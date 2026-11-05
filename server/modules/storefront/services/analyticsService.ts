import { Op } from 'sequelize'
import { AppError } from '../../../middleware/errorHandler.js'
import { getTenantContext } from '../../tenant/context.js'
import { ShopOrder, ShopAnalyticsEvent } from '../../shop/models/index.js'
import type { DispatchStatus } from '../../shop/models/ShopAnalyticsEvent.js'
import type { StorefrontSite } from '../middleware/siteContext.js'

/**
 * 服务端 CAPI 埋点服务（阶段 5 步骤 6 / P4-T10、P4-T11、X-T 对账）
 *
 * - 事件字典对齐 `docs/ANALYTICS_EVENTS.md`（GA4 九事件 + 服务端侧 refund）。
 * - **幂等**：(tenantId, eventId) 唯一，重复上报只落一次、不重复派发。
 * - **同意门控（P4-T11）**：`consent.analytics !== true` 时仅落库留痕，派发状态
 *   `skipped_no_consent`，绝不向 CAPI 外发；同意撤回后新事件同样不外发。
 * - **服务端事实**：`purchase` / `refund` 的金额与币种一律取**订单快照**，
 *   忽略前端传入 value/currency，并要求订单确实处于对应支付态，防伪造转化。
 * - **可插拔 CAPI provider**：默认 null（仅落库，测试零外网依赖）；
 *   部署层经 `setCapiProvider` 注入 Meta/Google sender；派发异常被隔离，
 *   状态置 `failed`，绝不把第三方故障抛给 C 端页面。
 * - 浏览类事件（view_item 等）前端 GA4 已发，服务端只落库供后台抽样对账，
 *   不重复外发（dispatchStatus='local_only'）。
 */

const tid = (): number => getTenantContext()?.tenantId ?? 1

/** GA4 九事件 + 服务端侧 refund */
export const EVENT_NAMES = [
  'view_item_list', 'select_item', 'view_item', 'view_cart', 'add_to_cart',
  'begin_checkout', 'add_shipping_info', 'add_payment_info', 'purchase', 'refund',
] as const
export type EventName = (typeof EVENT_NAMES)[number]

/** 需以服务端订单事实校准的事件 */
const SERVER_FACT_EVENTS: EventName[] = ['purchase', 'refund']

export interface TrackEventInput {
  eventId: string
  eventName: string
  consent?: { analytics?: boolean }
  sessionId?: string
  params?: Record<string, unknown>
}

export interface CapiPayload {
  eventId: string
  eventName: 'purchase' | 'refund'
  transactionId: string
  currency: string
  valueCents: number
  orderId: number
  params: Record<string, unknown>
  tenantId: number
  siteId: number | null
}

export type CapiProvider = (payload: CapiPayload) => Promise<void>

let capiProvider: CapiProvider | null = null

export function setCapiProvider(provider: CapiProvider | null): void {
  capiProvider = provider
}

export interface TrackEventResult {
  eventId: string
  accepted: boolean
  dispatchStatus: DispatchStatus
}

/** 从 params 读取交易号（兼容 transaction_id 字符串与数字） */
function readTransactionId(params: Record<string, unknown>): string {
  const raw = params.transaction_id ?? params.transactionId
  return typeof raw === 'string' || typeof raw === 'number' ? String(raw).slice(0, 64) : ''
}

/** 服务端事实校验：凭交易号取订单，返回快照金额/币种，失败抛 400 */
async function assertOrderFact(
  tenantId: number,
  transactionId: string,
  eventName: 'purchase' | 'refund',
): Promise<{ orderId: number; currency: string; valueCents: number }> {
  if (!transactionId) throw new AppError(400, `${eventName} 事件缺少 transaction_id`)
  const where: Record<string, unknown> = { tenantId }
  if (/^\d+$/.test(transactionId)) {
    // Op.or 为 unique symbol，用 symbol 索引签名绕过 Record<string,unknown> 限制
    ;(where as Record<string | symbol, unknown>)[Op.or] = [{ orderNo: transactionId }, { id: Number(transactionId) }]
  } else {
    where.orderNo = transactionId
  }
  const order = await ShopOrder.findOne({ where: where as never })
  if (!order) throw new AppError(400, `${eventName} 事件关联订单不存在`)

  const paid = order.paymentStatus === 'captured' || ['paid', 'fulfilled', 'shipped', 'done'].includes(order.status)
  if (eventName === 'purchase' && !paid) {
    throw new AppError(400, '订单未支付，不能上报 purchase')
  }
  if (eventName === 'refund' && order.paymentStatus !== 'refunded' && order.paymentStatus !== 'refunding') {
    throw new AppError(400, '订单未进入退款流程，不能上报 refund')
  }
  return {
    orderId: order.id,
    currency: order.currency,
    valueCents: Number(order.amountCents),
  }
}

/** 上报一个埋点事件（幂等 + 同意门控 + 服务端事实 + CAPI 派发） */
export async function recordEvent(site: StorefrontSite, input: TrackEventInput): Promise<TrackEventResult> {
  const tId = tid()
  const eventId = String(input.eventId ?? '').slice(0, 64)
  if (!eventId) throw new AppError(400, 'eventId 不能为空')

  // 1) 幂等：同租户同 eventId 只落一次，不重复派发
  const existing = await ShopAnalyticsEvent.findOne({ where: { tenantId: tId, eventId } })
  if (existing) {
    return { eventId, accepted: true, dispatchStatus: existing.dispatchStatus }
  }

  // 2) 事件白名单
  const eventName = input.eventName as EventName
  if (!EVENT_NAMES.includes(eventName)) {
    throw new AppError(400, `不支持的事件名: ${input.eventName}`)
  }

  const params = (input.params ?? {}) as Record<string, unknown>
  const consent = input.consent?.analytics === true
  let orderId: number | null = null
  let transactionId: string | null = null
  let currency: string | null = null
  let valueCents = 0

  // 3) purchase / refund 以订单快照校准（忽略前端 value/currency）
  const isFactEvent = SERVER_FACT_EVENTS.includes(eventName)
  if (isFactEvent) {
    const txn = readTransactionId(params)
    const fact = await assertOrderFact(tId, txn, eventName as 'purchase' | 'refund')
    orderId = fact.orderId
    transactionId = txn
    currency = fact.currency
    valueCents = fact.valueCents
  } else {
    // 浏览类事件金额仅用于后台对账（元 → 分），不参与 CAPI 外发
    const rawValue = Number(params.value ?? 0)
    valueCents = Number.isFinite(rawValue) ? Math.round(rawValue * 100) : 0
    currency = typeof params.currency === 'string' ? params.currency.slice(0, 3).toUpperCase() : null
  }

  // 4) 同意门控 + 派发状态预判
  let dispatchStatus: DispatchStatus = 'local_only'
  if (isFactEvent) {
    dispatchStatus = consent ? 'local_only' : 'skipped_no_consent'
  }

  // 5) 落库（unique 兜底并发重复）
  let row: ShopAnalyticsEvent
  try {
    row = await ShopAnalyticsEvent.create({
      tenantId: tId,
      siteId: site.shopId ?? null,
      eventId,
      eventName,
      consentAnalytics: consent,
      customerId: null,
      sessionId: input.sessionId ?? null,
      orderId,
      transactionId,
      currency,
      valueCents,
      params,
      dispatchStatus,
      dispatchedAt: null,
    } as never)
  } catch (err) {
    // 并发下撞唯一约束：视为已受理
    const dup = await ShopAnalyticsEvent.findOne({ where: { tenantId: tId, eventId } })
    if (dup) return { eventId, accepted: true, dispatchStatus: dup.dispatchStatus }
    throw err
  }

  // 6) 仅服务端事实事件 + 已同意 + 已注入 provider 时派发 CAPI
  if (isFactEvent && consent && capiProvider) {
    try {
      await capiProvider({
        eventId,
        eventName: eventName as 'purchase' | 'refund',
        transactionId: transactionId ?? '',
        currency: currency ?? 'USD',
        valueCents,
        orderId: orderId ?? 0,
        params,
        tenantId: tId,
        siteId: site.shopId ?? null,
      })
      await row.update({ dispatchStatus: 'sent', dispatchedAt: new Date() } as never)
      dispatchStatus = 'sent'
    } catch {
      // 第三方故障隔离：留痕 failed，不打断 C 端
      await row.update({ dispatchStatus: 'failed' } as never)
      dispatchStatus = 'failed'
    }
  }

  return { eventId, accepted: true, dispatchStatus }
}

/** 后台对账：按站点 + 事件名统计（供未来 admin 报表 / G4 抽样对账） */
export async function countEvents(site: StorefrontSite, eventName: EventName): Promise<number> {
  return ShopAnalyticsEvent.count({
    where: { tenantId: tid(), siteId: site.shopId ?? 0, eventName },
  })
}
