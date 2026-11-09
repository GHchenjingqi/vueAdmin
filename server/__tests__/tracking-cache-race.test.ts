// @vitest-environment node
/**
 * 物流轨迹缓存并发刷新实证（trackingService）
 *
 * 背景：shop_tracking_events 上 (tenantId, shipmentId) 有唯一索引
 * uniq_tracking_tenant_shipment，但 getOrderTracking 的缓存写入是
 * findOne -> create / update，upsertTrackingCache 同样是 findOne -> create：
 * - 无缓存时并发查询会各自 create，只有一个成功；其余被外层 catch 吞掉后
 *   cache 仍为 null，C 端请求返回「空轨迹 + provider=local」；
 * - 每个并发请求都各自调用一次外部 17track provider，重复外呼；
 * - 后台并发刷新同一 shipment 会抛 SequelizeUniqueConstraintError。
 *
 * 断言：并发请求结果一致、provider 只拉取一次、表内只有一行、写接口不 500。
 * 专属租户 987705，避免与既有 tracking 用例共用数据。
 */
import { describe, it, expect, afterEach } from 'vitest'
import { runInTenant } from '../modules/tenant/context.js'
import { ShopOrder, ShopOrderShipment, ShopTrackingEvent } from '../modules/shop/models/index.js'
import type { StorefrontSite } from '../modules/storefront/middleware/siteContext.js'
import * as trackingService from '../modules/storefront/services/trackingService.js'

const TID = 987705
const uniq = (): string => `tcr${Date.now()}${Math.floor(Math.random() * 1e6)}`
const inTenant = <T>(fn: () => Promise<T>): Promise<T> => runInTenant({ tenantId: TID }, fn)

const site: StorefrontSite = {
  tenantId: TID,
  channelId: null,
  shopId: null,
  defaultCurrency: 'USD',
  defaultLocale: 'en-US',
}

const EVENTS = [{ time: '2026-11-09T02:00:00Z', description: '17track: 到达转运中心' }]

afterEach(() => {
  trackingService.setTrackingProvider(null)
})

/** 构造带物流单的订单（不依赖 channel/shop 记录，site 仅用于 siteId） */
async function makeOrder(): Promise<{ orderId: number; orderNo: string; accessToken: string; shipmentId: number }> {
  const orderNo = 'SO' + uniq()
  const accessToken = 'tok_' + uniq()
  const order = await ShopOrder.create({
    tenantId: TID,
    orderNo,
    channelId: 0,
    shopId: 0,
    buyer: { email: 'tcr@ex.com' },
    currency: 'USD',
    amount: 100,
    status: 'shipped',
    email: 'tcr@ex.com',
    amountCents: 10000,
    subtotalCents: 10000,
    accessToken,
  } as never)
  const shipment = await ShopOrderShipment.create({
    tenantId: TID,
    orderId: order.id,
    carrier: 'DHL',
    trackingNo: 'DHL' + uniq(),
    status: 'in_transit',
  } as never)
  return { orderId: order.id, orderNo, accessToken, shipmentId: shipment.id }
}

function installProvider(): { calls: () => number } {
  let calls = 0
  trackingService.setTrackingProvider(async () => {
    calls += 1
    // 拉开并发窗口，确保 8 个请求都进入 stale 分支
    await new Promise((r) => setTimeout(r, 40))
    return { status: 'in_transit', events: EVENTS }
  })
  return { calls: () => calls }
}

describe('轨迹缓存并发刷新（trackingService）', () => {
  it('首次并发查询：所有请求返回同一轨迹，provider 只拉取一次，表内一行', async () => {
    await inTenant(async () => {
      const { orderNo, accessToken, shipmentId } = await makeOrder()
      const probe = installProvider()

      const results = await Promise.allSettled(
        Array.from({ length: 8 }, () => trackingService.getOrderTracking(site, orderNo, accessToken)),
      )
      const snapshot = {
        fulfilled: results.filter((r) => r.status === 'fulfilled').length,
        rejected: results.filter((r) => r.status === 'rejected').length,
        rejections: results
          .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
          .map((r) => (r.reason as Error)?.name ?? String(r.reason)),
        providers: results
          .filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof trackingService.getOrderTracking>>> => r.status === 'fulfilled')
          .map((r) => r.value.provider),
        eventCounts: results
          .filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof trackingService.getOrderTracking>>> => r.status === 'fulfilled')
          .map((r) => r.value.events.length),
        providerCalls: probe.calls(),
        rows: await ShopTrackingEvent.count({ where: { tenantId: TID, shipmentId } }),
      }

      expect(snapshot).toEqual({
        fulfilled: 8,
        rejected: 0,
        rejections: [],
        providers: Array(8).fill('17track'),
        eventCounts: Array(8).fill(1),
        providerCalls: 1,
        rows: 1,
      })
    })
  })

  it('缓存过期并发刷新：不重复外呼，所有请求轨迹一致', async () => {
    await inTenant(async () => {
      const { orderId, orderNo, accessToken, shipmentId } = await makeOrder()
      await trackingService.upsertTrackingCache(site, {
        orderId,
        shipmentId,
        carrier: 'DHL',
        trackingNo: 'DHL-STALE',
        status: 'created',
        events: [],
      })
      await ShopTrackingEvent.update(
        { syncedAt: new Date(Date.now() - 60 * 60 * 1000) },
        { where: { tenantId: TID, shipmentId } } as never,
      )
      const probe = installProvider()

      const results = await Promise.allSettled(
        Array.from({ length: 8 }, () => trackingService.getOrderTracking(site, orderNo, accessToken)),
      )
      const views = results
        .filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof trackingService.getOrderTracking>>> => r.status === 'fulfilled')
        .map((r) => r.value)

      expect(results.every((r) => r.status === 'fulfilled')).toBe(true)
      expect(views.map((v) => v.provider)).toEqual(Array(8).fill('17track'))
      expect(views.map((v) => v.status)).toEqual(Array(8).fill('in_transit'))
      expect(probe.calls()).toBe(1)
      expect(await ShopTrackingEvent.count({ where: { tenantId: TID, shipmentId } })).toBe(1)
    })
  })

  it('并发 upsertTrackingCache：全部成功、只留一行、返回同一 id', async () => {
    await inTenant(async () => {
      const { orderId, shipmentId } = await makeOrder()
      const results = await Promise.allSettled(
        Array.from({ length: 8 }, (_, i) =>
          trackingService.upsertTrackingCache(site, {
            orderId,
            shipmentId,
            carrier: 'DHL',
            trackingNo: 'DHL-UPSERT',
            status: i % 2 === 0 ? 'in_transit' : 'delivered',
            events: EVENTS,
          }),
        ),
      )
      const ids = results
        .filter((r): r is PromiseFulfilledResult<number> => r.status === 'fulfilled')
        .map((r) => r.value)
      const snapshot = {
        fulfilled: results.filter((r) => r.status === 'fulfilled').length,
        rejected: results.filter((r) => r.status === 'rejected').length,
        rejections: results
          .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
          .map((r) => (r.reason as Error)?.name ?? String(r.reason)),
        distinctIds: [...new Set(ids)].length,
        rows: await ShopTrackingEvent.count({ where: { tenantId: TID, shipmentId } }),
      }

      expect(snapshot).toEqual({
        fulfilled: 8,
        rejected: 0,
        rejections: [],
        distinctIds: 1,
        rows: 1,
      })
    })
  })

  it('阴性对照：顺序查询不重复拉取；provider 异常仍降级；双要素不匹配仍 404', async () => {
    await inTenant(async () => {
      const { orderNo, accessToken, shipmentId } = await makeOrder()
      const probe = installProvider()
      const first = await trackingService.getOrderTracking(site, orderNo, accessToken)
      const second = await trackingService.getOrderTracking(site, orderNo, accessToken)
      expect(first.provider).toBe('17track')
      expect(second.provider).toBe('17track')
      expect(probe.calls()).toBe(1)

      await expect(trackingService.getOrderTracking(site, orderNo, 'wrong-token')).rejects.toMatchObject({
        statusCode: 404,
      })

      // provider 抛错时降级到已有缓存，不打断 C 端查询
      await ShopTrackingEvent.update(
        { syncedAt: new Date(Date.now() - 60 * 60 * 1000) },
        { where: { tenantId: TID, shipmentId } } as never,
      )
      trackingService.setTrackingProvider(async () => {
        throw new Error('17track timeout')
      })
      const degraded = await trackingService.getOrderTracking(site, orderNo, accessToken)
      expect(degraded.provider).toBe('17track')
      expect(degraded.events).toHaveLength(1)
    })
  })
})
