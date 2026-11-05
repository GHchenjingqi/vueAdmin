// @vitest-environment node
/**
 * Storefront 服务端 CAPI 埋点 + 订单来源（阶段 5 步骤 6）测试
 *
 * 覆盖：
 *  - 事件白名单（未知事件 400）、eventId 幂等（不重复落库/不重复派发）
 *  - 同意门控：未同意 → skipped_no_consent 且 CAPI 不外发；同意 → sent
 *  - 服务端事实：purchase 未支付 400、已支付时金额/币种取订单快照（忽略前端 value）
 *  - refund 需退款态；浏览类事件仅落库 local_only
 *  - CAPI provider 异常隔离 → failed，不抛给 C 端
 *  - 订单来源归因（site + utm）随建单固化
 *  - 跨租户隔离
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { runInTenant } from '../modules/tenant/context.js'
import {
  ShopChannel,
  ShopShop,
  ShopOrder,
  ShopAnalyticsEvent,
} from '../modules/shop/models/index.js'
import * as categoryService from '../modules/shop/services/categoryService.js'
import * as brandService from '../modules/shop/services/brandService.js'
import * as spuService from '../modules/shop/services/spuService.js'
import * as skuService from '../modules/shop/services/skuService.js'
import * as priceService from '../modules/shop/services/priceService.js'
import * as warehouseService from '../modules/shop/services/warehouseService.js'
import * as inventoryService from '../modules/shop/services/inventoryService.js'
import type { StorefrontSite } from '../modules/storefront/middleware/siteContext.js'
import * as analyticsService from '../modules/storefront/services/analyticsService.js'
import * as checkoutService from '../modules/storefront/services/checkoutService.js'

const TID = 1
const OTHER_TID = 84
function uniq(): string {
  return `an${Date.now()}${Math.floor(Math.random() * 1e6)}`
}

let site: StorefrontSite
let skuId = 0

beforeAll(async () => {
  await runInTenant({ tenantId: TID }, async () => {
    const channel = await ShopChannel.create({
      tenantId: TID, name: 'AN Channel ' + uniq(), type: 'independent', status: 'active',
    } as never)
    const shop = await ShopShop.create({
      tenantId: TID, channelId: channel.id, name: 'AN Shop ' + uniq(),
      credentials: { defaultCurrency: 'USD', defaultLocale: 'en-US' },
    } as never)
    site = {
      tenantId: TID, channelId: channel.id, shopId: shop.id,
      defaultCurrency: 'USD', defaultLocale: 'en-US',
    }
  })
})

afterEach(() => {
  analyticsService.setCapiProvider(null)
})

/** 造一笔订单（可指定支付/退款态） */
async function makeOrder(paymentStatus: string, status = 'paid', tenantId = TID) {
  return ShopOrder.create({
    tenantId,
    orderNo: 'SO' + uniq(),
    channelId: 0,
    shopId: site.shopId ?? 0,
    buyer: { email: 'an@ex.com' },
    currency: 'USD',
    amount: 259.8,
    status,
    paymentStatus,
    email: 'an@ex.com',
    amountCents: 25980,
    subtotalCents: 25980,
    accessToken: 'tok_' + uniq(),
  } as never)
}

describe('阶段5-步骤6：埋点事件校验与幂等', () => {
  it('事件白名单：未知事件名 → 400', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      await expect(
        analyticsService.recordEvent(site, { eventId: 'e_' + uniq(), eventName: 'hack_event' }),
      ).rejects.toMatchObject({ statusCode: 400 })
    })
  })

  it('eventId 幂等：重复上报只落一行、不重复派发', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const order = await makeOrder('captured')
      const eventId = 'e_' + uniq()
      let calls = 0
      analyticsService.setCapiProvider(async () => { calls += 1 })
      const input = {
        eventId,
        eventName: 'purchase',
        consent: { analytics: true },
        params: { transaction_id: order.orderNo, value: 1 }, // 前端伪造值，应被订单快照覆盖
      }
      const first = await analyticsService.recordEvent(site, input)
      const second = await analyticsService.recordEvent(site, input)
      expect(first.dispatchStatus).toBe('sent')
      expect(second.dispatchStatus).toBe('sent')
      expect(calls).toBe(1)
      expect(await ShopAnalyticsEvent.count({ where: { tenantId: TID, eventId } })).toBe(1)
    })
  })

  it('eventId 为空 → 400', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      await expect(
        analyticsService.recordEvent(site, { eventId: '', eventName: 'view_item' }),
      ).rejects.toMatchObject({ statusCode: 400 })
    })
  })
})

describe('阶段5-步骤6：同意门控与 CAPI 派发', () => {
  it('未同意 analytics → skipped_no_consent，CAPI 不外发', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const order = await makeOrder('captured')
      let calls = 0
      analyticsService.setCapiProvider(async () => { calls += 1 })
      const r = await analyticsService.recordEvent(site, {
        eventId: 'e_' + uniq(),
        eventName: 'purchase',
        consent: { analytics: false },
        params: { transaction_id: order.orderNo },
      })
      expect(r.dispatchStatus).toBe('skipped_no_consent')
      expect(calls).toBe(0)
      const row = await ShopAnalyticsEvent.findOne({ where: { tenantId: TID, eventId: r.eventId } })
      expect(row!.consentAnalytics).toBe(false)
    })
  })

  it('已同意 + provider → sent，金额币种取订单快照（忽略前端伪造值）', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const order = await makeOrder('captured')
      let payload: analyticsService.CapiPayload | null = null
      analyticsService.setCapiProvider(async (p) => { payload = p })
      const r = await analyticsService.recordEvent(site, {
        eventId: 'e_' + uniq(),
        eventName: 'purchase',
        consent: { analytics: true },
        params: { transaction_id: order.orderNo, value: 0.01, currency: 'JPY' },
      })
      expect(r.dispatchStatus).toBe('sent')
      expect(payload).toBeTruthy()
      expect(payload!.valueCents).toBe(25980)
      expect(payload!.currency).toBe('USD')
      expect(payload!.orderId).toBe(order.id)
      const row = await ShopAnalyticsEvent.findOne({ where: { tenantId: TID, eventId: r.eventId } })
      expect(Number(row!.valueCents)).toBe(25980)
      expect(row!.currency).toBe('USD')
      expect(row!.dispatchedAt).not.toBeNull()
    })
  })

  it('provider 抛异常 → failed，隔离第三方故障不打断 C 端', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const order = await makeOrder('captured')
      analyticsService.setCapiProvider(async () => { throw new Error('CAPI timeout') })
      const r = await analyticsService.recordEvent(site, {
        eventId: 'e_' + uniq(),
        eventName: 'purchase',
        consent: { analytics: true },
        params: { transaction_id: order.orderNo },
      })
      expect(r.dispatchStatus).toBe('failed')
      expect(r.accepted).toBe(true)
    })
  })

  it('无 provider 时 purchase 仅落库 local_only，不外发', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const order = await makeOrder('captured')
      const r = await analyticsService.recordEvent(site, {
        eventId: 'e_' + uniq(),
        eventName: 'purchase',
        consent: { analytics: true },
        params: { transaction_id: order.orderNo },
      })
      expect(r.dispatchStatus).toBe('local_only')
    })
  })
})

describe('阶段5-步骤6：服务端事实与浏览类事件', () => {
  it('purchase 订单未支付 → 400（防伪造转化）', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const order = await makeOrder('none', 'created')
      await expect(
        analyticsService.recordEvent(site, {
          eventId: 'e_' + uniq(), eventName: 'purchase',
          consent: { analytics: true }, params: { transaction_id: order.orderNo },
        }),
      ).rejects.toMatchObject({ statusCode: 400 })
    })
  })

  it('purchase 缺 transaction_id → 400', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      await expect(
        analyticsService.recordEvent(site, { eventId: 'e_' + uniq(), eventName: 'purchase', params: {} }),
      ).rejects.toMatchObject({ statusCode: 400 })
    })
  })

  it('refund 需订单进入退款态，否则 400', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const notRefunded = await makeOrder('captured')
      await expect(
        analyticsService.recordEvent(site, {
          eventId: 'e_' + uniq(), eventName: 'refund', params: { transaction_id: notRefunded.orderNo },
        }),
      ).rejects.toMatchObject({ statusCode: 400 })

      const refunded = await makeOrder('refunded')
      const r = await analyticsService.recordEvent(site, {
        eventId: 'e_' + uniq(), eventName: 'refund',
        consent: { analytics: true }, params: { transaction_id: refunded.orderNo },
      })
      expect(r.accepted).toBe(true)
      expect(r.dispatchStatus).toBe('local_only')
    })
  })

  it('浏览类事件仅落库 local_only（前端 GA4 已发，不重复外发）', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      let calls = 0
      analyticsService.setCapiProvider(async () => { calls += 1 })
      const r = await analyticsService.recordEvent(site, {
        eventId: 'e_' + uniq(),
        eventName: 'view_item',
        consent: { analytics: true },
        params: { currency: 'usd', value: 129.9, items: [{ item_id: '1' }] },
      })
      expect(r.dispatchStatus).toBe('local_only')
      expect(calls).toBe(0)
      const row = await ShopAnalyticsEvent.findOne({ where: { tenantId: TID, eventId: r.eventId } })
      expect(Number(row!.valueCents)).toBe(12990)
      expect(row!.currency).toBe('USD')
    })
  })

  it('跨租户隔离：别的租户查不到本租户事件', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      await analyticsService.recordEvent(site, {
        eventId: 'e_' + uniq(), eventName: 'view_cart', params: {},
      })
      const mine = await analyticsService.countEvents(site, 'view_cart')
      expect(mine).toBeGreaterThan(0)
      await runInTenant({ tenantId: OTHER_TID }, async () => {
        expect(await analyticsService.countEvents(site, 'view_cart')).toBe(0)
      })
    })
  })
})

describe('阶段5-步骤6：订单来源归因随建单固化', () => {
  it('createOrder 写入 sourceSiteId + utm 字段，落库可查', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const category = await categoryService.createCategory({
        parentId: 0, name: { 'en-US': 'AN Cat ' + uniq() }, level: 1, sort: 0,
      })
      const brand = await brandService.createBrand({ name: 'AN Brand ' + uniq() })
      const warehouse = await warehouseService.createWarehouse({
        name: 'AN WH ' + uniq(), type: 'overseas', country: 'US',
      })
      const spu = await spuService.createSpu({
        categoryId: category.id, brandId: brand.id,
        name: { 'en-US': 'AN Wig ' + uniq() }, description: { 'en-US': 'an test' },
      })
      const sku = await skuService.createSku({ spuId: spu.id, code: 'ANSKU' + uniq(), spec: { color: '1B' } })
      skuId = sku.id
      await priceService.upsertPrice(sku.id, { currency: 'USD', amount: 99 })
      await inventoryService.adjust(sku.id, warehouse.id, 20)

      const order = await checkoutService.createOrder(site, {
        items: [{ skuId: sku.id, qty: 1 }],
        email: `buyer_${uniq()}@ex.com`,
        attribution: {
          utmSource: 'google', utmMedium: 'cpc', utmCampaign: 'black_friday',
          utmTerm: 'glueless wig', utmContent: 'ad_a',
          landingPage: '/products/bob-wig', referrer: 'https://google.com/',
        },
      })
      const row = await ShopOrder.findOne({ where: { id: order.id, tenantId: TID } })
      expect(row!.sourceSiteId).toBe(site.shopId)
      expect(row!.utmSource).toBe('google')
      expect(row!.utmMedium).toBe('cpc')
      expect(row!.utmCampaign).toBe('black_friday')
      expect(row!.utmTerm).toBe('glueless wig')
      expect(row!.utmContent).toBe('ad_a')
      expect(row!.landingPage).toBe('/products/bob-wig')
      expect(row!.referrer).toBe('https://google.com/')
    })
  })

  it('未传 attribution 时来源字段为 null（存量/游客下单不受影响）', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const order = await checkoutService.createOrder(site, {
        items: [{ skuId, qty: 1 }],
        email: `buyer_${uniq()}@ex.com`,
      })
      const row = await ShopOrder.findOne({ where: { id: order.id, tenantId: TID } })
      expect(row!.utmSource).toBeNull()
      expect(row!.sourceSiteId).toBe(site.shopId)
    })
  })
})
