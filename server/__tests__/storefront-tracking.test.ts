// @vitest-environment node
/**
 * Storefront 物流轨迹 17track（阶段 5 步骤 5 第五切片）服务层测试
 *
 * 覆盖：
 *  - 防枚举：orderNo / accessToken 任一不匹配 → 404
 *  - 无物流单 → 空轨迹视图（not_shipped）
 *  - 有缓存轨迹 → 返回 carrier/trackingNo/events/provider
 *  - provider 钩子：缓存过期时拉取并刷新；拉取异常降级到本地缓存
 *  - 缓存未过期不重复拉取；upsertTrackingCache 幂等（同 shipment 只一行）
 *  - 跨租户隔离
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { runInTenant } from '../modules/tenant/context.js'
import {
  ShopChannel,
  ShopShop,
  ShopOrder,
  ShopOrderShipment,
  ShopTrackingEvent,
} from '../modules/shop/models/index.js'
import type { StorefrontSite } from '../modules/storefront/middleware/siteContext.js'
import * as trackingService from '../modules/storefront/services/trackingService.js'

const TID = 1
const OTHER_TID = 83
function uniq(): string {
  return `trk${Date.now()}${Math.floor(Math.random() * 1e6)}`
}

let site: StorefrontSite

beforeAll(async () => {
  await runInTenant({ tenantId: TID }, async () => {
    const channel = await ShopChannel.create({
      tenantId: TID,
      name: 'TRK Channel ' + uniq(),
      type: 'independent',
      status: 'active',
    } as never)
    const shop = await ShopShop.create({
      tenantId: TID,
      channelId: channel.id,
      name: 'TRK Shop ' + uniq(),
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
  trackingService.setTrackingProvider(null)
})

/** 创建带 accessToken 的订单，可选挂一个物流单 */
async function makeOrder(withShipment: boolean, tenantId = TID) {
  const orderNo = 'SO' + uniq()
  const accessToken = 'tok_' + uniq()
  const order = await ShopOrder.create({
    tenantId,
    orderNo,
    channelId: 0,
    shopId: site.shopId ?? 0,
    buyer: { email: 'trk@ex.com' },
    currency: 'USD',
    amount: 100,
    status: 'shipped',
    email: 'trk@ex.com',
    amountCents: 10000,
    subtotalCents: 10000,
    accessToken,
  } as never)
  let shipmentId = 0
  if (withShipment) {
    const shipment = await ShopOrderShipment.create({
      tenantId,
      orderId: order.id,
      carrier: 'DHL',
      trackingNo: 'DHL' + uniq(),
      status: 'in_transit',
    } as never)
    shipmentId = shipment.id
  }
  return { order, orderNo, accessToken, shipmentId }
}

describe('阶段5-步骤5(五)：物流轨迹防枚举', () => {
  it('orderNo + accessToken 双要素匹配才返回，任一不符 → 404', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const { orderNo, accessToken } = await makeOrder(false)
      const ok = await trackingService.getOrderTracking(site, orderNo, accessToken)
      expect(ok.orderNo).toBe(orderNo)
      expect(ok.status).toBe('not_shipped')

      await expect(trackingService.getOrderTracking(site, orderNo, 'wrong')).rejects.toMatchObject({ statusCode: 404 })
      await expect(
        trackingService.getOrderTracking(site, 'SO_NOT_EXIST', accessToken),
      ).rejects.toMatchObject({ statusCode: 404 })
      await expect(trackingService.getOrderTracking(site, orderNo, '')).rejects.toMatchObject({ statusCode: 404 })
    })
  })

  it('跨租户不可凭站点上下文查到别的租户订单', async () => {
    await runInTenant({ tenantId: OTHER_TID }, async () => {
      const { orderNo, accessToken } = await makeOrder(false, OTHER_TID)
      // 以 TID 的租户上下文查询 → 404（tenantId 隔离）
      await runInTenant({ tenantId: TID }, async () => {
        await expect(trackingService.getOrderTracking(site, orderNo, accessToken)).rejects.toMatchObject({
          statusCode: 404,
        })
      })
    })
  })
})

describe('阶段5-步骤5(五)：轨迹缓存与 provider', () => {
  it('upsertTrackingCache 写入后返回轨迹；同 shipment 重复写不产生新行', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const { order, orderNo, accessToken, shipmentId } = await makeOrder(true)
      const events = [
        { time: '2026-11-05T09:00:00Z', description: '已揽收', location: '深圳' },
        { time: '2026-11-05T12:00:00Z', description: '转运中', location: '香港' },
      ]
      const id1 = await trackingService.upsertTrackingCache(site, {
        orderId: order.id,
        shipmentId,
        carrier: 'DHL',
        trackingNo: 'DHL123',
        status: 'in_transit',
        events,
      })
      const id2 = await trackingService.upsertTrackingCache(site, {
        orderId: order.id,
        shipmentId,
        carrier: 'DHL',
        trackingNo: 'DHL123',
        status: 'delivered',
        events: [...events, { time: '2026-11-06T10:00:00Z', description: '已签收' }],
      })
      expect(id2).toBe(id1)
      expect(await ShopTrackingEvent.count({ where: { tenantId: TID, shipmentId } })).toBe(1)

      const view = await trackingService.getOrderTracking(site, orderNo, accessToken)
      expect(view.provider).toBe('local')
      expect(view.status).toBe('delivered')
      expect(view.events).toHaveLength(3)
    })
  })

  it('缓存过期时 provider 被调用并刷新为 17track', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const { order, orderNo, accessToken, shipmentId } = await makeOrder(true)
      await trackingService.upsertTrackingCache(site, {
        orderId: order.id,
        shipmentId,
        carrier: 'DHL',
        trackingNo: 'DHL123',
        status: 'created',
        events: [],
      })
      // 强制置为过期
      await ShopTrackingEvent.update(
        { syncedAt: new Date(Date.now() - 60 * 60 * 1000) },
        { where: { tenantId: TID, shipmentId } } as never,
      )

      let calls = 0
      trackingService.setTrackingProvider(async (input) => {
        calls += 1
        expect(input.carrier).toBe('DHL')
        return {
          status: 'in_transit',
          events: [{ time: '2026-11-05T15:00:00Z', description: '17track: 到达转运中心' }],
        }
      })
      const view = await trackingService.getOrderTracking(site, orderNo, accessToken)
      expect(calls).toBe(1)
      expect(view.provider).toBe('17track')
      expect(view.status).toBe('in_transit')
      expect(view.events[0].description).toContain('17track')

      // 缓存已刷新 → 未过期时不再拉取
      const again = await trackingService.getOrderTracking(site, orderNo, accessToken)
      expect(calls).toBe(1)
      expect(again.provider).toBe('17track')
    })
  })

  it('provider 抛异常时降级到本地缓存，不打断 C 端查询', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const { order, orderNo, accessToken, shipmentId } = await makeOrder(true)
      await trackingService.upsertTrackingCache(site, {
        orderId: order.id,
        shipmentId,
        carrier: 'DHL',
        trackingNo: 'DHL123',
        status: 'in_transit',
        events: [{ time: '2026-11-05T09:00:00Z', description: '本地缓存节点' }],
      })
      await ShopTrackingEvent.update(
        { syncedAt: new Date(Date.now() - 60 * 60 * 1000) },
        { where: { tenantId: TID, shipmentId } } as never,
      )
      trackingService.setTrackingProvider(async () => {
        throw new Error('17track timeout')
      })
      const view = await trackingService.getOrderTracking(site, orderNo, accessToken)
      expect(view.provider).toBe('local')
      expect(view.status).toBe('in_transit')
      expect(view.events[0].description).toBe('本地缓存节点')
    })
  })

  it('无本地缓存且 provider 拉取成功时写入新缓存', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const { orderNo, accessToken, shipmentId } = await makeOrder(true)
      trackingService.setTrackingProvider(async () => ({
        status: 'delivered',
        events: [{ time: '2026-11-06T10:00:00Z', description: '已签收' }],
      }))
      const view = await trackingService.getOrderTracking(site, orderNo, accessToken)
      expect(view.provider).toBe('17track')
      expect(view.status).toBe('delivered')
      expect(await ShopTrackingEvent.count({ where: { tenantId: TID, shipmentId } })).toBe(1)
    })
  })
})
