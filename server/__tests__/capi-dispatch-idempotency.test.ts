// @vitest-environment node
/**
 * CAPI 服务端事实事件（purchase/refund）订单级派发幂等回归。
 *
 * 缺陷：幂等键是客户端可控的 eventId，换一个 eventId 就能把同一订单的转化
 * 重复外发到 Meta/Google CAPI，导致转化虚高、广告归因与计费失真。
 * 修复：派发前以订单行 FOR UPDATE 串行化认领 + dispatchStatus CAS 占位。
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { runInTenant } from '../modules/tenant/context.js'
import { ShopChannel, ShopShop, ShopOrder, ShopAnalyticsEvent } from '../modules/shop/models/index.js'
import type { StorefrontSite } from '../modules/storefront/middleware/siteContext.js'
import * as analyticsService from '../modules/storefront/services/analyticsService.js'

const TID = 1
const uniq = (): string => `cd${Date.now()}${Math.floor(Math.random() * 1e6)}`

let site: StorefrontSite

beforeAll(async () => {
  await runInTenant({ tenantId: TID }, async () => {
    const channel = await ShopChannel.create({
      tenantId: TID,
      name: 'CD Channel ' + uniq(),
      type: 'independent',
      status: 'active',
    } as never)
    const shop = await ShopShop.create({
      tenantId: TID,
      channelId: channel.id,
      name: 'CD Shop ' + uniq(),
      credentials: { defaultCurrency: 'USD', defaultLocale: 'en-US' },
    } as never)
    site = {
      tenantId: TID,
      channelId: channel.id,
      shopId: shop.id,
      defaultCurrency: 'USD',
      defaultLocale: 'en-US',
    }
  })
})

afterEach(() => {
  analyticsService.setCapiProvider(null)
})

async function makeOrder(paymentStatus = 'captured', status = 'paid'): Promise<ShopOrder> {
  return ShopOrder.create({
    tenantId: TID,
    orderNo: 'CD' + uniq(),
    channelId: site.channelId,
    shopId: site.shopId,
    buyer: { email: 'cd@ex.com' },
    currency: 'USD',
    amount: 259.8,
    status,
    paymentStatus,
    email: 'cd@ex.com',
    amountCents: 25980,
    subtotalCents: 25980,
    accessToken: 'tok' + uniq(),
  } as never)
}

function event(
  order: ShopOrder,
  eventName = 'purchase',
  consent: boolean | undefined = true,
): analyticsService.TrackEventInput {
  return {
    eventId: 'cd_' + uniq(),
    eventName,
    consent: consent === undefined ? undefined : { analytics: consent },
    params: { transaction_id: order.orderNo, value: 0.01, currency: 'JPY' },
  }
}

describe('CAPI 事实事件：订单级派发幂等', () => {
  it('同一订单 3 个不同 eventId 顺序上报 purchase → 只外发 1 次', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const order = await makeOrder()
      let calls = 0
      analyticsService.setCapiProvider(async () => { calls += 1 })
      const first = await analyticsService.recordEvent(site, event(order))
      const second = await analyticsService.recordEvent(site, event(order))
      const third = await analyticsService.recordEvent(site, event(order))
      expect(calls).toBe(1)
      expect(first.dispatchStatus).toBe('sent')
      expect(second.dispatchStatus).toBe('local_only')
      expect(third.dispatchStatus).toBe('local_only')
      const rows = await ShopAnalyticsEvent.findAll({ where: { tenantId: TID, orderId: order.id, eventName: 'purchase' } })
      expect(rows).toHaveLength(3) // 仍逐条留痕，仅抑制外发
      expect(rows.filter((r) => r.dispatchStatus === 'sent')).toHaveLength(1)
    })
  })

  it('同一订单 3 个不同 eventId 并发上报 purchase → 只外发 1 次', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const order = await makeOrder()
      let calls = 0
      analyticsService.setCapiProvider(async () => { calls += 1 })
      const results = await Promise.all([
        analyticsService.recordEvent(site, event(order)),
        analyticsService.recordEvent(site, event(order)),
        analyticsService.recordEvent(site, event(order)),
      ])
      expect(calls).toBe(1)
      expect(results.filter((r) => r.dispatchStatus === 'sent')).toHaveLength(1)
    })
  })

  it('同一 eventId 重复上报 → 只落一行、只外发 1 次（既有幂等）', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const order = await makeOrder()
      let calls = 0
      analyticsService.setCapiProvider(async () => { calls += 1 })
      const input = event(order)
      const a = await analyticsService.recordEvent(site, input)
      const b = await analyticsService.recordEvent(site, input)
      expect(calls).toBe(1)
      expect(a.dispatchStatus).toBe('sent')
      expect(b.dispatchStatus).toBe('sent')
      expect(await ShopAnalyticsEvent.count({ where: { tenantId: TID, eventId: input.eventId } })).toBe(1)
    })
  })

  it('purchase 与 refund 属不同事件名，同一订单各外发 1 次', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const order = await makeOrder('refunded')
      let calls = 0
      analyticsService.setCapiProvider(async () => { calls += 1 })
      const p = await analyticsService.recordEvent(site, event(order, 'purchase'))
      const r = await analyticsService.recordEvent(site, event(order, 'refund'))
      expect(calls).toBe(2)
      expect(p.dispatchStatus).toBe('sent')
      expect(r.dispatchStatus).toBe('sent')
    })
  })

  it('不同订单互不抑制，各外发 1 次', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const a = await makeOrder()
      const b = await makeOrder()
      let calls = 0
      analyticsService.setCapiProvider(async () => { calls += 1 })
      await analyticsService.recordEvent(site, event(a))
      await analyticsService.recordEvent(site, event(b))
      expect(calls).toBe(2)
    })
  })

  it('未同意上报不占派发名额，用户同意后仍可外发 1 次', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const order = await makeOrder()
      let calls = 0
      analyticsService.setCapiProvider(async () => { calls += 1 })
      const skipped = await analyticsService.recordEvent(site, event(order, 'purchase', false))
      const sent = await analyticsService.recordEvent(site, event(order))
      expect(skipped.dispatchStatus).toBe('skipped_no_consent')
      expect(calls).toBe(1)
      expect(sent.dispatchStatus).toBe('sent')
    })
  })

  it('provider 失败不算占用，允许换 eventId 重试外发', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const order = await makeOrder()
      let calls = 0
      analyticsService.setCapiProvider(async () => {
        calls += 1
        if (calls === 1) throw new Error('CAPI timeout')
      })
      const failed = await analyticsService.recordEvent(site, event(order))
      const retry = await analyticsService.recordEvent(site, event(order))
      expect(failed.dispatchStatus).toBe('failed')
      expect(retry.dispatchStatus).toBe('sent')
      expect(calls).toBe(2)
    })
  })

  it('无 provider 时的 local_only 不占名额，之后注入 provider 仍可外发', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const order = await makeOrder()
      const local = await analyticsService.recordEvent(site, event(order))
      let calls = 0
      analyticsService.setCapiProvider(async () => { calls += 1 })
      const sent = await analyticsService.recordEvent(site, event(order))
      expect(local.dispatchStatus).toBe('local_only')
      expect(sent.dispatchStatus).toBe('sent')
      expect(calls).toBe(1)
    })
  })

  it('浏览类事件不受订单级去重影响，仍不外发', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      let calls = 0
      analyticsService.setCapiProvider(async () => { calls += 1 })
      for (let i = 0; i < 3; i++) {
        const r = await analyticsService.recordEvent(site, {
          eventId: 'cd_' + uniq(),
          eventName: 'view_item',
          consent: { analytics: true },
          params: { value: 10 },
        })
        expect(r.dispatchStatus).toBe('local_only')
      }
      expect(calls).toBe(0)
    })
  })

  it('订单未支付仍 400，不因新增锁逻辑改变校验', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const order = await makeOrder('none', 'created')
      await expect(analyticsService.recordEvent(site, event(order))).rejects.toMatchObject({ statusCode: 400 })
    })
  })

  it('金额仍取订单快照，重复上报不污染已派发 payload', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const order = await makeOrder()
      const payloads: analyticsService.CapiPayload[] = []
      analyticsService.setCapiProvider(async (p) => { payloads.push(p) })
      await analyticsService.recordEvent(site, event(order))
      await analyticsService.recordEvent(site, event(order))
      expect(payloads).toHaveLength(1)
      expect(payloads[0].valueCents).toBe(25980)
      expect(payloads[0].currency).toBe('USD')
    })
  })
})
