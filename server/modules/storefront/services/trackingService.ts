import { UniqueConstraintError } from 'sequelize'
import { AppError } from '../../../middleware/errorHandler.js'
import { getTenantContext } from '../../tenant/context.js'
import { ShopOrder, ShopOrderShipment, ShopTrackingEvent } from '../../shop/models/index.js'
import type { TrackingNode } from '../../shop/models/ShopTrackingEvent.js'
import type { StorefrontSite } from '../middleware/siteContext.js'

/**
 * 物流轨迹服务（阶段 5 步骤 5 / 第五切片 · 步骤 5 收官）
 *
 * 复用 shop 的 orders / order_shipments（carrier/trackingNo 已在），仅新增轨迹缓存表。
 * 公开接口免 admin 鉴权，但**必须凭 orderNo + accessToken 双要素**访问（防订单枚举，P4-T04），
 * 任一不匹配一律 404，不暴露订单是否存在。
 *
 * 外部 17track 采用可插拔 provider 钩子（与 inventoryService.setRestockHook 同款思路）：
 *  - 默认 provider 为 null → 只返回本地 shipment 状态与已缓存轨迹，绝不硬依赖外网；
 *  - 配置真实 17track 时通过 setTrackingProvider 注入拉取函数；异常被 try/catch 隔离，
 *    拉取失败自动降级到本地缓存，不让外部 API 故障打挂 C 端查询。
 */

const tid = (): number => getTenantContext()?.tenantId ?? 1

export interface TrackingProviderInput {
  carrier: string
  trackingNo: string
  tenantId: number
}

export interface TrackingProviderResult {
  status: string
  events: TrackingNode[]
}

/** 轨迹拉取函数（由部署层注入真实 17track 客户端；测试注入 mock） */
export type TrackingProvider = (input: TrackingProviderInput) => Promise<TrackingProviderResult>

let trackingProvider: TrackingProvider | null = null

export function setTrackingProvider(provider: TrackingProvider | null): void {
  trackingProvider = provider
}

/**
 * 进程内合并同租户同运单的并发外部拉取：缓存过期时多个 C 端请求只打一次
 * 17track。settled 后立刻移除，异常同样不留在表里，避免下次查询被旧 Promise 卡住。
 * 多实例部署仍各自拉取（见审计报告残留）。
 */
const inFlightPulls = new Map<string, Promise<TrackingProviderResult>>()

function pullOnce(
  key: string,
  provider: TrackingProvider,
  input: TrackingProviderInput,
): Promise<TrackingProviderResult> {
  const pending = inFlightPulls.get(key)
  if (pending) return pending
  const tracked = provider(input).finally(() => {
    if (inFlightPulls.get(key) === tracked) inFlightPulls.delete(key)
  })
  inFlightPulls.set(key, tracked)
  return tracked
}

export interface TrackingView {
  orderNo: string
  status: string
  carrier: string | null
  trackingNo: string | null
  events: TrackingNode[]
  provider: string
  syncedAt: Date
}

/**
 * 查询订单物流轨迹。
 * 防枚举：orderNo + accessToken 必须同时匹配（tenantId 隔离），否则 404。
 * 无物流单时返回空轨迹视图（而非 404，避免泄漏"订单是否已发货"之外的信息）。
 */
export async function getOrderTracking(
  site: StorefrontSite,
  orderNo: string,
  accessToken: string,
): Promise<TrackingView> {
  const tId = tid()
  const order = await ShopOrder.findOne({ where: { orderNo, accessToken, tenantId: tId } })
  if (!order) throw new AppError(404, '订单不存在')

  const shipment = await ShopOrderShipment.findOne({ where: { orderId: order.id, tenantId: tId }, order: [['id', 'DESC']] })
  if (!shipment || !shipment.trackingNo) {
    return {
      orderNo: order.orderNo,
      status: shipment?.status ?? 'not_shipped',
      carrier: shipment?.carrier ?? null,
      trackingNo: shipment?.trackingNo ?? null,
      events: [],
      provider: 'local',
      syncedAt: new Date(0),
    }
  }

  // 读取已有缓存
  let cache = await ShopTrackingEvent.findOne({ where: { tenantId: tId, shipmentId: shipment.id } })

  // 有 provider 且缓存过期（>10 分钟）时尝试拉取并刷新；失败降级到本地缓存
  const STALE_MS = 10 * 60 * 1000
  const stale = !cache || Date.now() - new Date(cache.syncedAt).getTime() > STALE_MS
  let pulled: TrackingProviderResult | null = null
  if (trackingProvider && stale) {
    try {
      pulled = await pullOnce(`${tId}:${shipment.id}`, trackingProvider, {
        carrier: shipment.carrier,
        trackingNo: shipment.trackingNo,
        tenantId: tId,
      })
      const values = {
        tenantId: tId,
        siteId: site.shopId ?? null,
        orderId: order.id,
        shipmentId: shipment.id,
        carrier: shipment.carrier,
        trackingNo: shipment.trackingNo,
        status: pulled.status,
        events: pulled.events,
        provider: '17track',
        syncedAt: new Date(),
      }
      if (cache) {
        await cache.update(values as never)
      } else {
        try {
          cache = await ShopTrackingEvent.create(values as never)
        } catch (err) {
          if (!(err instanceof UniqueConstraintError)) throw err
          // 并发首次查询：赢家已落库，回读其缓存，避免本请求返回空轨迹
          cache = await ShopTrackingEvent.findOne({ where: { tenantId: tId, shipmentId: shipment.id } })
        }
      }
    } catch {
      // 外部 API 故障 / 其它写入异常：降级使用已有缓存，不影响 C 端查询
    }
  }

  return {
    orderNo: order.orderNo,
    status: cache?.status ?? pulled?.status ?? shipment.status,
    carrier: shipment.carrier,
    trackingNo: shipment.trackingNo,
    events: (cache?.events as TrackingNode[] | null) ?? pulled?.events ?? [],
    provider: cache?.provider ?? (pulled ? '17track' : 'local'),
    syncedAt: cache?.syncedAt ?? new Date(0),
  }
}

/** 供后台发货时写入/刷新轨迹缓存（本切片测试与未来 admin 使用，公开接口不暴露） */
export async function upsertTrackingCache(
  site: StorefrontSite,
  input: {
    orderId: number
    shipmentId: number
    carrier: string
    trackingNo: string
    status: string
    events: TrackingNode[]
    provider?: string
  },
): Promise<number> {
  const tId = tid()
  const values = {
    tenantId: tId,
    siteId: site.shopId ?? null,
    orderId: input.orderId,
    shipmentId: input.shipmentId,
    carrier: input.carrier,
    trackingNo: input.trackingNo,
    status: input.status,
    events: input.events,
    provider: input.provider ?? 'local',
    syncedAt: new Date(),
  }
  const existing = await ShopTrackingEvent.findOne({ where: { tenantId: tId, shipmentId: input.shipmentId } })
  if (existing) {
    await existing.update(values as never)
    return existing.id
  }
  try {
    const row = await ShopTrackingEvent.create(values as never)
    return row.id
  } catch (err) {
    if (!(err instanceof UniqueConstraintError)) throw err
    // 后台并发刷新同一运单：唯一键冲突说明赢家已插入，回读后更新同一行
    const winner = await ShopTrackingEvent.findOne({ where: { tenantId: tId, shipmentId: input.shipmentId } })
    if (!winner) throw err
    await winner.update(values as never)
    return winner.id
  }
}
