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
import * as membershipService from '../../shop/services/membershipService.js'
import { getProvider, defaultProvider, isProviderUsable } from '../payments/providerRegistry.js'
import { getGateway, assertGatewayConfigured } from '../payments/gatewayRegistry.js'
import { notifyUrl } from '../payments/gateways/common.js'
import config from '../../../config/index.js'
import type { StorefrontSite } from '../middleware/siteContext.js'
import type { GatewayAction, GatewayEvent, GatewayNotifyContext } from '../payments/types.js'

/**
 * 支付服务（阶段 5 步骤 4 / P3-T11 / P3-T12）
 *
 * - 支付会话金额 / 币种取自订单快照（amountCents / currency），绝不重新计价；
 * - Webhook：原始 body HMAC-SHA256 验签 → providerRef/orderNo 绑定校验 → 订单状态 CAS 认领（仅赢家产生计数、审计、预占与邮件副作用）；
 * - 验签失败 / 重复投递均不产生副作用；回调币种与订单快照不一致时告警并不改单（此处以订单快照为准）。
 */

const tid = (): number => getTenantContext()?.tenantId ?? 1

/**
 * 订单终态：对账关单释放订单级资源后会把订单落为 cancelled。
 * 终态订单不得再建支付会话，也不得被任何支付事件改单，
 * 否则「券已退但订单仍可支付」会让同一张限量券被无限复用。
 */
const TERMINAL_ORDER_STATUSES = new Set<ShopOrder['status']>(['cancelled'])
function assertOrderPayable(order: ShopOrder): void {
  if (TERMINAL_ORDER_STATUSES.has(order.status)) {
    throw new AppError(409, '订单已关闭，无法发起支付')
  }
}

export interface PaymentSession {
  orderId: number
  orderNo: string
  provider: string
  providerRef: string
  sessionId: string
  amountCents: number
  currency: string
  status: string
  /** 网关商户订单号（真实通道；mock 为空） */
  gatewayOrderNo?: string
  gatewayRef?: string
  /** 收银台动作：redirect / qr / form / sdk / mock */
  action: GatewayAction
  redirectUrl?: string
  qrCode?: string
  form?: { url: string; method: 'GET' | 'POST'; fields: Record<string, string> }
  clientParams?: Record<string, string>
  /** 免登录回跳凭证（网关跳转回结果页时换取订单状态用） */
  returnToken?: string
}

/** 创建支付会话：金额与币种取自订单快照；provider 可选（缺省用默认，P5-T03 区域支付/BNPL） */
export async function createSession(site: StorefrontSite, orderId: number, requestedProvider?: string): Promise<PaymentSession> {
  void site
  const tId = tid()
  const order = await ShopOrder.findOne({ where: { id: orderId, tenantId: tId } })
  if (!order) throw new AppError(404, '订单不存在')
  assertOrderPayable(order)
  if (order.paymentStatus === 'captured') throw new AppError(409, '订单已支付')

  // T-08：地址不在配送范围的订单不得进入支付（不能创建可支付订单）
  const country = extractCountry(order.shippingAddress)
  if (country) await assertShippableCountry(country)

  // P5-T03：Provider 前置能力校验（存在 + flag 开启 + 订单币种支持），任一不满足即 422 拒绝且无副作用
  const providerDef = requestedProvider ? getProvider(requestedProvider) : await defaultProvider(order.currency)
  if (!providerDef) throw new AppError(422, '支付方式不可用')
  if (!(await isProviderUsable(providerDef, order.currency))) {
    throw new AppError(422, `支付方式 ${providerDef.id} 不可用（未启用或不支持 ${order.currency}）`)
  }
  // 真实网关缺配置 fail-closed：不产生会话、不静默降级为 mock
  if (providerDef.real) await assertGatewayConfigured(providerDef.id)

  const provider = providerDef.id
  const providerRef = `pay_${order.orderNo}_${crypto.randomBytes(8).toString('hex')}`
  const sessionId = `sess_${crypto.randomBytes(12).toString('hex')}`
  // 网关商户订单号：纯字母数字，供 out_trade_no / invoice_id / orderId 使用
  const gatewayOrderNo = `P${Date.now().toString(36).toUpperCase()}${crypto.randomBytes(5).toString('hex').toUpperCase()}`
  // 免登录回跳凭证：网关跳转回结果页时只带 orderNo+provider，前端用它换订单状态
  const returnToken = makeReturnToken(order.orderNo, provider)

  let gatewayResult: {
    action: GatewayAction
    redirectUrl?: string
    qrCode?: string
    form?: PaymentSession['form']
    gatewayRef?: string
    clientParams?: Record<string, string>
  } = { action: 'mock' }
  if (providerDef.real) {
    const gateway = getGateway(provider)
    if (!gateway) throw new AppError(422, '支付方式不可用')
    const base = (process.env.PAYMENT_PUBLIC_BASE_URL ?? '').replace(/\/$/, '')
    gatewayResult = await gateway.createPayment({
      orderNo: order.orderNo,
      amountCents: Number(order.amountCents),
      currency: order.currency,
      providerRef,
      gatewayOrderNo,
      notifyUrl: notifyUrl(provider),
      returnUrl: base ? `${base}/checkout/result?orderNo=${encodeURIComponent(order.orderNo)}&provider=${provider}&rt=${encodeURIComponent(returnToken)}` : '',
      subject: `订单 ${order.orderNo}`,
      tenantId: tId,
    })
  }

  const payment = await ShopOrderPayment.create({
    tenantId: tId,
    orderId: order.id,
    orderNo: order.orderNo,
    provider,
    providerRef,
    sessionId,
    gatewayOrderNo,
    gatewayRef: gatewayResult.gatewayRef ?? null,
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
    gatewayOrderNo,
    gatewayRef: gatewayResult.gatewayRef,
    action: gatewayResult.action,
    redirectUrl: gatewayResult.redirectUrl,
    qrCode: gatewayResult.qrCode,
    form: gatewayResult.form,
    clientParams: gatewayResult.clientParams,
    returnToken,
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
 * 验签与事件解析委派各网关适配器，解析后的统一事件交给 applyGatewayEvent 落地。
 */
export async function handleWebhook(
  provider: string,
  rawBody: Buffer,
  signature: string | undefined,
  notifyHeaders: GatewayNotifyContext['headers'] = {},
): Promise<WebhookResult> {
  // 未注册通道在验签/解析前直接拒绝，避免任意路径参数都能进入支付状态机
  const def = getProvider(provider)
  if (!def) return { ok: false, status: 400, message: `未注册的支付 Provider: ${provider}` }
  const gateway = getGateway(provider)
  if (!gateway) return { ok: false, status: 400, message: `未注册的支付 Provider: ${provider}` }

  // 验签与事件格式解析委派给各网关适配器；mock/bnpl 沿用 HMAC + 自定义 JSON
  let event: Awaited<ReturnType<typeof gateway.verifyAndParse>>
  try {
    event = await gateway.verifyAndParse({
      rawBody,
      headers: notifyHeaders,
      config: { providerId: provider, signature: signature ?? '' },
    })
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode
    if (status === 400 || status === 401 || status === 503) {
      return { ok: false, status, message: (err as Error).message }
    }
    throw err
  }
  return applyGatewayEvent(provider, event)
}

/**
 * 应用统一支付事件到订单状态机（Webhook / 主动 capture / 查单补单共用）。
 * 包含 (provider, providerRef) 幂等去重、订单绑定校验、币种可用性校验与
 * paymentStatus CAS 认领；副作用（预占 commit / 释放、审计、邮件）仅赢家产生。
 */
export async function applyGatewayEvent(provider: string, event: GatewayEvent): Promise<WebhookResult> {
  const def = getProvider(provider)
  if (!def) return { ok: false, status: 400, message: `未注册的支付 Provider: ${provider}` }
  const tId = tid()
  const payload = event.raw
  let providerRef: string | undefined = event.providerRef
  let orderNo: string | undefined = event.orderNo
  const eventType: string | undefined = event.type

  // 真实网关通知通常只带商户订单号 / 网关交易号，回查内部绑定补齐幂等键与订单号
  if (!providerRef || !orderNo) {
    const where = event.gatewayOrderNo
      ? { gatewayOrderNo: event.gatewayOrderNo, tenantId: tId }
      : event.gatewayRef
        ? { gatewayRef: event.gatewayRef, tenantId: tId }
        : null
    const row = where ? await ShopOrderPayment.findOne({ where: where as never }) : null
    if (row) {
      providerRef = providerRef || row.providerRef
      orderNo = orderNo || row.orderNo
    }
  }

  if (!providerRef || !orderNo) return { ok: false, status: 400, message: '缺少 providerRef / orderNo' }

  // P5-T03 修复 3/4：以 providerRef 查绑定记录，换 provider 重投必须拒绝，
  // 否则同一 providerRef 换一个 provider 就能绕开 (provider,providerRef) 幂等去重。
  // 兼容策略：无历史支付记录的订单放行（内部建单/回归夹具）；
  // 是否收紧为「一律拒绝」需业务确认，见 docs/reports/p5-fix-readiness.md。
  const prev = await ShopOrderPayment.findOne({ where: { providerRef, tenantId: tId } as never })
  if (prev && prev.provider !== provider) {
    return { ok: false, status: 400, message: `providerRef 已绑定其它 Provider: ${prev.provider}` }
  }
  // providerRef 与 orderNo 必须指向同一笔订单：否则可用 A 单的支付记录把 B 单标记为已支付，
  // 并消费掉 A 单的支付记录（A 单真实回调随后被去重，永远无法支付）。
  if (prev && prev.orderNo !== orderNo) {
    return { ok: false, status: 400, message: `providerRef 已绑定其它订单: ${prev.orderNo}` }
  }
  if (prev && prev.status !== 'initiated') {
    return { ok: true, alreadyProcessed: true, status: 200 }
  }

  const order = await ShopOrder.findOne({ where: { orderNo, tenantId: tId } })
  if (!order) return { ok: false, status: 404, message: '订单不存在' }
  // 已关单订单不得被任何支付事件改单（含迟到 / 伪造 providerRef 的回调）
  if (TERMINAL_ORDER_STATUSES.has(order.status)) {
    return { ok: false, status: 409, message: '订单已关闭' }
  }

  // P5-T03 修复 2/4：flag 关闭 / 币种不支持的 Provider 不得通过回调改单（关闭态零副作用）。
  if (!(await isProviderUsable(def, order.currency))) {
    return { ok: false, status: 403, message: `Provider ${provider} 不可用（flag 关闭或币种不支持）` }
  }

  // 回调币种若与订单快照不一致，以订单快照为准，记录告警（此处仅日志，不改单）
  if (typeof payload?.currency === 'string' && payload.currency !== order.currency) {
    console.warn(`[webhook] 回调币种 ${payload.currency} 与订单 ${order.orderNo} 快照 ${order.currency} 不一致，以订单快照为准`)
  }

  if (eventType === 'payment.succeeded') {
    if (SETTLED_PAYMENT_STATUSES.has(order.paymentStatus)) return { ok: true, alreadyProcessed: true, status: 200 }
    // CAS 认领：并发同事件只有一个请求能把读到的非终态改为 captured；
    // 输家直接视为已处理，避免重复计数 / 重复审计 / 重复提交预占。
    const [claimed] = await ShopOrder.update({ paymentStatus: 'captured', status: 'paid', paidAt: new Date() } as never, {
      where: { id: order.id, tenantId: tId, paymentStatus: order.paymentStatus } as never,
    })
    if (claimed !== 1) return { ok: true, alreadyProcessed: true, status: 200 }
    incCounter('payment_success')
    updatePaymentFailureRate()
    await reservationService.commitReservation(order.orderNo)
    if (prev) await prev.update({ status: 'captured', rawPayload: payload } as never)
    // X-T03：审计订单/支付状态变更（system 事件，不阻断主流程）
    await auditLogService.record({
      actorType: 'system',
      action: 'order.payment_captured',
      entityType: 'order',
      entityId: order.id,
      afterState: { status: 'paid', paymentStatus: 'captured' },
    })
    await auditLogService.record({
      actorType: 'system',
      action: 'payment.captured',
      entityType: 'payment',
      entityId: order.id,
      afterState: { paymentStatus: 'captured' },
    })
    // P3-T17：订单确认邮件入队（幂等 + 异常隔离，邮件失败不得让支付回调重投失败）
    await tryEnqueue({ orderId: order.id, type: 'confirmed' })
    // 会员积分（异常隔离：积分失败不得让支付回调重投失败）
    try {
      const orderCustomerId = (order.buyer as { customerId?: number | null } | null)?.customerId
      if (orderCustomerId) {
        const paidCents = order.amountCents ?? order.amount ?? 0
        await membershipService.awardPointsForOrder(tId, order.id, orderCustomerId, paidCents)
        // 积分抵扣落账（订单 pointsUsed>0 时扣减；uq order+reason 幂等）
        const pointsUsed = Number((order as unknown as { pointsUsed?: number }).pointsUsed ?? 0)
        if (pointsUsed > 0) await membershipService.redeemPointsForOrder(tId, order.id, orderCustomerId, pointsUsed)
      }
    } catch (err) {
      console.warn(`[membership] 订单 ${order.orderNo} 积分发放失败（不影响支付回调）：`, err instanceof Error ? err.message : err)
    }
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
    // 与 succeeded 同口径 CAS 认领，避免并发失败回调重复计数 / 重复审计 / 重复释放预占。
    const [claimed] = await ShopOrder.update({ paymentStatus: 'failed' } as never, {
      where: { id: order.id, tenantId: tId, paymentStatus: order.paymentStatus } as never,
    })
    if (claimed !== 1) return { ok: true, alreadyProcessed: true, status: 200 }
    incCounter('payment_failure')
    updatePaymentFailureRate()
    await reservationService.releaseReservation(order.orderNo)
    if (prev) await prev.update({ status: 'failed', rawPayload: payload } as never)
    // X-T03：审计订单支付失败（system 事件，不阻断主流程）
    await auditLogService.record({
      actorType: 'system',
      action: 'order.payment_failed',
      entityType: 'order',
      entityId: order.id,
      afterState: { paymentStatus: 'failed' },
    })
    return { ok: true, status: 200 }
  }

  return { ok: false, status: 400, message: `不支持的事件类型: ${eventType ?? 'unknown'}` }
}

/**
 * 网关要求用户在回跳后由服务端主动确认（如 PayPal Orders v2 先 authorize 再 capture）。
 * 幂等：重复调用等同于重复 webhook，仅靠 applyGatewayEvent 的 CAS 认领产生一次副作用。
 * 仅对配置了 capture 的真实网关生效；mock/bnpl 无此环节直接透传。
 */
export async function capturePayment(orderNo: string, provider: string): Promise<WebhookResult> {
  const def = getProvider(provider)
  if (!def || !def.real) return { ok: false, status: 422, message: '支付方式不支持主动确认' }
  const gateway = getGateway(provider)
  if (!gateway?.capture) return { ok: false, status: 422, message: `支付通道 ${provider} 不支持主动确认` }
  const tId = tid()
  const payment = await ShopOrderPayment.findOne({ where: { orderNo, tenantId: tId } as never })
  if (!payment) return { ok: false, status: 404, message: '支付记录不存在' }
  if (payment.provider !== provider) return { ok: false, status: 400, message: '支付通道不匹配' }
  if (payment.status !== 'initiated') return { ok: true, alreadyProcessed: true, status: 200 }
  const event = await gateway.capture({ gatewayRef: payment.gatewayRef ?? '', config: { providerId: provider } })
  return applyGatewayEvent(provider, event)
}

const RETURN_TOKEN_TTL_MS = 15 * 60 * 1000

function returnTokenSecret(): string {
  return config.payment?.webhookSecret ?? 'storefront_mock_webhook_secret'
}

/**
 * 生成免登录回跳凭证（无状态签名 token）：网关跳转回结果页时只带 orderNo + provider，
 * 前端用此 token 换订单状态，避免把 accessToken 暴露在跳转 URL 或依赖 webhook 时序。
 * TTL 15 分钟；token 仅用于只读状态查询，不含任何写权限。
 */
export function makeReturnToken(orderNo: string, provider: string): string {
  const exp = Date.now() + RETURN_TOKEN_TTL_MS
  const body = Buffer.from(`${orderNo}.${provider}.${exp}`).toString('base64url')
  const sig = createHmac('sha256', returnTokenSecret()).update(body).digest('base64url')
  return `${body}.${sig}`
}

/** 校验回跳凭证：签名不符 / 已过期返回 null */
export function verifyReturnToken(token: string): { orderNo: string; provider: string } | null {
  const parts = token.split('.')
  if (parts.length !== 2) return null
  const [body, sig] = parts
  const expected = createHmac('sha256', returnTokenSecret()).update(body).digest('base64url')
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  const decoded = Buffer.from(body, 'base64url').toString('utf8')
  const [orderNo, provider, exp] = decoded.split('.')
  if (!orderNo || !provider || !exp) return null
  if (Date.now() > Number(exp)) return null
  return { orderNo, provider }
}
