import crypto from 'crypto'
import { createHmac, timingSafeEqual } from 'crypto'
import { AppError } from '../../../middleware/errorHandler.js'
import { getTenantContext } from '../../tenant/context.js'
import { ShopOrder, ShopOrderPayment } from '../../shop/models/index.js'
import * as reservationService from '../../shop/services/reservationService.js'
import { tryEnqueue } from '../../shop/services/orderMailService.js'
import { assertShippableCountry, extractCountry } from './shippingService.js'
import { getCounter, incCounter, setGauge } from './monitoringService.js'
import * as auditLogService from '../../shop/services/auditLogService.js'
import { getProvider, defaultProvider, isProviderUsable } from '../payments/providerRegistry.js'
import config from '../../../config/index.js'
import type { StorefrontSite } from '../middleware/siteContext.js'

/**
 * 支付服务（阶段 5 步骤 4 / P3-T11 / P3-T12）
 *
 * - 支付会话金额 / 币种取自订单快照（amountCents / currency），绝不重新计价；
 * - Webhook：原始 body HMAC-SHA256 验签 → 事件去重（provider+providerRef 唯一约束）→ 幂等更新；
 * - 验签失败 / 重复投递均不产生副作用；回调币种与订单快照不一致时告警并不改单（此处以订单快照为准）。
 */

const tid = (): number => getTenantContext()?.tenantId ?? 1

export interface PaymentSession {
  orderId: number
  orderNo: string
  provider: string
  providerRef: string
  sessionId: string
  amountCents: number
  currency: string
  status: string
}

/** 创建支付会话：金额与币种取自订单快照；provider 可选（缺省用默认，P5-T03 区域支付/BNPL） */
export async function createSession(
  site: StorefrontSite,
  orderId: number,
  requestedProvider?: string,
): Promise<PaymentSession> {
  void site
  const tId = tid()
  const order = await ShopOrder.findOne({ where: { id: orderId, tenantId: tId } })
  if (!order) throw new AppError(404, '订单不存在')
  if (order.paymentStatus === 'captured') throw new AppError(409, '订单已支付')

  // T-08：地址不在配送范围的订单不得进入支付（不能创建可支付订单）
  const country = extractCountry(order.shippingAddress)
  if (country) await assertShippableCountry(country)

  // P5-T03：Provider 前置能力校验（存在 + flag 开启 + 订单币种支持），任一不满足即 422 拒绝且无副作用
  const providerDef = requestedProvider
    ? getProvider(requestedProvider)
    : (getProvider(config.payment?.provider) ?? defaultProvider())
  if (!providerDef) throw new AppError(422, '支付方式不可用')
  if (!(await isProviderUsable(providerDef, order.currency))) {
    throw new AppError(422, `支付方式 ${providerDef.id} 不可用（未启用或不支持 ${order.currency}）`)
  }

  const provider = providerDef.id
  const providerRef = `pay_${order.orderNo}_${crypto.randomBytes(8).toString('hex')}`
  const sessionId = `sess_${crypto.randomBytes(12).toString('hex')}`

  const payment = await ShopOrderPayment.create({
    tenantId: tId,
    orderId: order.id,
    orderNo: order.orderNo,
    provider,
    providerRef,
    sessionId,
    amountCents: order.amountCents,
    currency: order.currency,
    status: 'initiated',
  } as never)

  return {
    orderId: order.id,
    orderNo: order.orderNo,
    provider,
    providerRef,
    sessionId,
    amountCents: Number(payment.amountCents),
    currency: payment.currency,
    status: payment.status,
  }
}

/** 计算 webhook 签名（mock 提供商用 HMAC-SHA256 对原始 body 签名） */
export function signWebhook(rawBody: Buffer | string): string {
  const secret = config.payment?.webhookSecret ?? 'storefront_mock_webhook_secret'
  return createHmac('sha256', secret).update(rawBody).digest('hex')
}

export interface WebhookResult {
  ok: boolean
  /** 事件已被处理过（幂等去重命中） */
  alreadyProcessed?: boolean
  status: number
  message?: string
}

/** P4-T13：支付失败率 gauge（失败 /（成功+失败）），供告警评估 */
function updatePaymentFailureRate(): void {
  const success = getCounter('payment_success')
  const failure = getCounter('payment_failure')
  const total = success + failure
  setGauge('payment_failure_rate', total > 0 ? Number((failure / total).toFixed(4)) : 0)
}

/**
 * G3：已结算支付态。订单一旦成功扣款（captured）或进入退款流程（refunding/refunded），
 * 迟到的回调不得把状态回退、重复 commit 预占或重复发送确认邮件。
 */
const SETTLED_PAYMENT_STATUSES = new Set(['captured', 'refunding', 'refunded'])

/**
 * 处理支付 Webhook（原始 body + 签名头）。
 * 返回 { ok, status } 供 controller 转化为 HTTP 响应；验签失败抛 401，且不产生任何副作用。
 */
export async function handleWebhook(provider: string, rawBody: Buffer, signature: string | undefined): Promise<WebhookResult> {
  // P5-T03 修复 1/4：provider 必须已注册；未知 provider 在验签/解析前直接拒绝，
  // 避免任意路径参数都能进入支付状态机。
  const def = getProvider(provider)
  if (!def) return { ok: false, status: 400, message: `未注册的支付 Provider: ${provider}` }
  // P5-T03 修复 4/4：优先使用 Provider 声明的独立 webhook 密钥。
  const secret = def.webhookSecret ?? config.payment?.webhookSecret ?? 'storefront_mock_webhook_secret'

  // 1) 验签（时序安全比较）
  if (!signature) return { ok: false, status: 401, message: '缺少签名' }
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex')
  const a = Buffer.from(signature)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, status: 401, message: '签名无效' }
  }

  // 2) 解析事件（签名通过后）
  let payload: Record<string, any>
  try {
    payload = JSON.parse(rawBody.toString('utf8'))
  } catch {
    return { ok: false, status: 400, message: '非法 JSON' }
  }

  const tId = tid()
  const providerRef: string | undefined = payload?.providerRef
  const orderNo: string | undefined = payload?.orderNo
  const eventType: string | undefined = payload?.type

  if (!providerRef || !orderNo) return { ok: false, status: 400, message: '缺少 providerRef / orderNo' }

  // P5-T03 修复 3/4：以 providerRef 查绑定记录，换 provider 重投必须拒绝，
  // 否则同一 providerRef 换一个 provider 就能绕开 (provider,providerRef) 幂等去重。
  // 兼容策略：无历史支付记录的订单放行（内部建单/回归夹具）；
  // 是否收紧为「一律拒绝」需业务确认，见 docs/reports/p5-fix-readiness.md。
  const prev = await ShopOrderPayment.findOne({ where: { providerRef, tenantId: tId } as never })
  if (prev && prev.provider !== provider) {
    return { ok: false, status: 400, message: `providerRef 已绑定其它 Provider: ${prev.provider}` }
  }
  if (prev && prev.status !== 'initiated') {
    return { ok: true, alreadyProcessed: true, status: 200 }
  }

  const order = await ShopOrder.findOne({ where: { orderNo, tenantId: tId } })
  if (!order) return { ok: false, status: 404, message: '订单不存在' }

  // P5-T03 修复 2/4：flag 关闭 / 币种不支持的 Provider 不得通过回调改单（关闭态零副作用）。
  if (!(await isProviderUsable(def, order.currency))) {
    return { ok: false, status: 403, message: `Provider ${provider} 不可用（flag 关闭或币种不支持）` }
  }

  // 回调币种若与订单快照不一致，以订单快照为准，记录告警（此处仅日志，不改单）
  if (typeof payload?.currency === 'string' && payload.currency !== order.currency) {
    console.warn(`[webhook] 回调币种 ${payload.currency} 与订单 ${order.orderNo} 快照 ${order.currency} 不一致，以订单快照为准`)
  }

  if (eventType === 'payment.succeeded') {
    incCounter('payment_success')
    updatePaymentFailureRate()
    if (SETTLED_PAYMENT_STATUSES.has(order.paymentStatus)) return { ok: true, alreadyProcessed: true, status: 200 }
    await order.update({ paymentStatus: 'captured', status: 'paid', paidAt: new Date() } as never)
    await reservationService.commitReservation(order.orderNo)
    if (prev) await prev.update({ status: 'captured', rawPayload: payload } as never)
    // X-T03：审计订单/支付状态变更（system 事件，不阻断主流程）
    await auditLogService.record({ actorType: 'system', action: 'order.payment_captured', entityType: 'order', entityId: order.id, afterState: { status: 'paid', paymentStatus: 'captured' } })
    await auditLogService.record({ actorType: 'system', action: 'payment.captured', entityType: 'payment', entityId: order.id, afterState: { paymentStatus: 'captured' } })
    // P3-T17：订单确认邮件入队（幂等 + 异常隔离，邮件失败不得让支付回调重投失败）
    await tryEnqueue({ orderId: order.id, type: 'confirmed' })
    return { ok: true, status: 200 }
  }

  if (eventType === 'payment.failed') {
    // G3：迟到/乱序的失败回调不得回退已结算订单，也不得重复释放已 committed 的预占。
    if (SETTLED_PAYMENT_STATUSES.has(order.paymentStatus)) {
      console.warn(`[webhook] 订单 ${order.orderNo} 已处于 ${order.paymentStatus}，忽略迟到失败事件 ${providerRef}`)
      await auditLogService.record({
        actorType: 'system',
        action: 'payment.stale_failed_ignored',
        entityType: 'order',
        entityId: order.id,
        beforeState: { paymentStatus: order.paymentStatus },
        afterState: { paymentStatus: order.paymentStatus, providerRef },
      })
      return { ok: true, alreadyProcessed: true, status: 200 }
    }
    incCounter('payment_failure')
    updatePaymentFailureRate()
    await order.update({ paymentStatus: 'failed' } as never)
    await reservationService.releaseReservation(order.orderNo)
    if (prev) await prev.update({ status: 'failed', rawPayload: payload } as never)
    // X-T03：审计订单支付失败（system 事件，不阻断主流程）
    await auditLogService.record({ actorType: 'system', action: 'order.payment_failed', entityType: 'order', entityId: order.id, afterState: { paymentStatus: 'failed' } })
    return { ok: true, status: 200 }
  }

  return { ok: false, status: 400, message: `不支持的事件类型: ${eventType ?? 'unknown'}` }
}
