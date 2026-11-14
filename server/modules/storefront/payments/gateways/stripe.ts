import crypto from 'crypto'
import { AppError } from '../../../../middleware/errorHandler.js'
import type { PaymentGateway, GatewayEvent, GatewayOrderContext, GatewayNotifyContext, GatewaySession } from '../types.js'
import { assertConfig, fetchJson, header, money } from './common.js'
import { resolveGatewayConfig } from '../credentialService.js'

/**
 * Stripe（PLAN 6.1）：Checkout Session + Webhook + Refund。
 *
 * 为什么用 Checkout Session 而不是 Elements：
 * 本站现有契约是「服务端建会话、前端按 action 拉起收银台」，Checkout Session 的
 * redirect 语义与 `GatewaySession.action='redirect'` 天然对齐；Elements 需要在
 * C 端引入 Stripe.js 与额外的确认流程，改造面大得多。
 *
 * 关键设计：
 * - `assertConfigured` 缺 SECRET_KEY 直接 503，**不降级为 mock**（与既有网关一致）；
 * - 建会话带 `Idempotency-Key`（本地 providerRef），网络重试不会重复建单；
 * - Webhook 验签用 Stripe 的 `t=<ts>,v1=<hex>` 方案，并校验时间戳窗口防重放；
 * - 退款以 refundNo 作为幂等键，避免重试二次退款。
 *
 * 凭据：后台加密配置（DB）为主，STRIPE_* 环境变量兜底。
 */

const API_BASE = 'https://api.stripe.com/v1'
/** Webhook 时间戳容忍窗口（秒）：超出视为重放 */
const WEBHOOK_TOLERANCE_SECONDS = 300

async function cfg(): Promise<Record<string, string>> {
  return resolveGatewayConfig('stripe')
}

function authHeaders(secretKey: string): Record<string, string> {
  return {
    authorization: `Bearer ${secretKey}`,
    'content-type': 'application/x-www-form-urlencoded',
  }
}

/** Stripe 只接受 form-encoded 的嵌套字段（a[b]=c），这里做扁平化 */
function toForm(params: Record<string, string | number | undefined>): string {
  const usp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === '') continue
    usp.append(k, String(v))
  }
  return usp.toString()
}

/**
 * 校验 Stripe Webhook 签名。
 *
 * 签名串 = `${t}.${rawBody}`，算法 HMAC-SHA256(webhookSecret)，结果与 v1 比较。
 * 用 timingSafeEqual 而非 ===，避免时序侧信道。
 */
export function verifyStripeSignature(rawBody: Buffer, signatureHeader: string, secret: string, nowSeconds = Math.floor(Date.now() / 1000)): boolean {
  if (!signatureHeader || !secret) return false
  const parts = signatureHeader.split(',').reduce<Record<string, string>>((acc, item) => {
    const [k, v] = item.split('=')
    if (k && v) acc[k.trim()] = v.trim()
    return acc
  }, {})
  const timestamp = Number(parts.t)
  if (!Number.isFinite(timestamp)) return false
  // 时间戳窗口：防止旧请求被重放
  if (Math.abs(nowSeconds - timestamp) > WEBHOOK_TOLERANCE_SECONDS) return false
  const expected = crypto.createHmac('sha256', secret).update(`${parts.t}.${rawBody.toString('utf8')}`).digest('hex')
  const provided = parts.v1 ?? ''
  const a = Buffer.from(expected)
  const b = Buffer.from(provided)
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

/** Stripe 事件 → 统一事件（金额单位：分；Stripe 本身就用最小货币单位） */
function toEvent(raw: Record<string, unknown>): GatewayEvent {
  const type = String(raw.type ?? '')
  const data = (raw.data ?? {}) as Record<string, unknown>
  const object = (data.object ?? {}) as Record<string, unknown>

  const succeeded = ['checkout.session.completed', 'checkout.session.async_payment_succeeded', 'payment_intent.succeeded']
  const failed = ['checkout.session.async_payment_failed', 'payment_intent.payment_failed']

  if (!succeeded.includes(type) && !failed.includes(type)) {
    // 非支付类事件（如 customer.created）不报错，交给上层按"无需处理"忽略
    throw new AppError(400, `PAYMENT_EVENT_IGNORED: 不支持的 Stripe 事件 ${type}`)
  }

  // Session 事件带回 client_reference_id / metadata.orderNo；PaymentIntent 事件只有 metadata
  const metadata = (object.metadata ?? {}) as Record<string, unknown>
  const orderNo = String(object.client_reference_id ?? metadata.orderNo ?? '') || undefined
  const amountTotal = object.amount_total ?? object.amount_received ?? object.amount
  const currency = object.currency ? String(object.currency).toUpperCase() : undefined

  return {
    type: succeeded.includes(type) ? 'payment.succeeded' : 'payment.failed',
    gatewayOrderNo: orderNo,
    orderNo,
    gatewayRef: String(object.payment_intent ?? object.id ?? '') || undefined,
    amountCents: amountTotal != null ? Math.round(Number(amountTotal)) : undefined,
    currency,
    raw,
  }
}

export const stripeGateway: PaymentGateway = {
  id: 'stripe',

  async assertConfigured() {
    const c = await cfg()
    assertConfig({ SECRET_KEY: c.SECRET_KEY }, 'stripe')
  },

  async createPayment(ctx: GatewayOrderContext): Promise<GatewaySession> {
    const c = await cfg()
    assertConfig({ SECRET_KEY: c.SECRET_KEY }, 'stripe')

    // 成功/取消回跳：优先用后台配置，其次沿用调用方给的 returnUrl
    const successUrl = c.SUCCESS_URL || ctx.returnUrl
    const cancelUrl = c.CANCEL_URL || ctx.returnUrl

    const body = toForm({
      mode: 'payment',
      'line_items[0][quantity]': 1,
      'line_items[0][price_data][currency]': ctx.currency.toLowerCase(),
      'line_items[0][price_data][unit_amount]': ctx.amountCents,
      'line_items[0][price_data][product_data][name]': ctx.subject.slice(0, 120),
      client_reference_id: ctx.gatewayOrderNo,
      'metadata[orderNo]': ctx.gatewayOrderNo,
      'metadata[providerRef]': ctx.providerRef,
      success_url: `${successUrl}${successUrl.includes('?') ? '&' : '?'}provider=stripe&order=${encodeURIComponent(ctx.gatewayOrderNo)}`,
      cancel_url: cancelUrl,
      // 便于对账时在 Stripe 后台按本地单号检索
      'payment_intent_data[metadata][orderNo]': ctx.gatewayOrderNo,
    })

    const res = await fetchJson<{ id: string; url: string }>(`${API_BASE}/checkout/sessions`, {
      method: 'POST',
      headers: { ...authHeaders(c.SECRET_KEY), 'idempotency-key': ctx.providerRef },
      body,
    })
    if (!res?.url) throw new AppError(502, 'STRIPE_SESSION_FAILED: 未返回收银台地址')

    return {
      action: 'redirect',
      redirectUrl: res.url,
      gatewayRef: res.id,
      clientParams: { publishableKey: c.PUBLISHABLE_KEY ?? '' },
    }
  },

  async verifyAndParse(ctx: GatewayNotifyContext): Promise<GatewayEvent> {
    const c = await cfg()
    assertConfig({ SECRET_KEY: c.SECRET_KEY, WEBHOOK_SECRET: c.WEBHOOK_SECRET }, 'stripe')
    const signature = header(ctx.headers, 'stripe-signature')
    if (!signature) throw new AppError(401, '缺少 Stripe 签名')
    if (!verifyStripeSignature(ctx.rawBody, signature, c.WEBHOOK_SECRET)) {
      throw new AppError(401, 'STRIPE_SIGNATURE_INVALID: 验签失败')
    }
    let payload: Record<string, unknown>
    try {
      payload = JSON.parse(ctx.rawBody.toString('utf8')) as Record<string, unknown>
    } catch {
      throw new AppError(400, '非法 JSON')
    }
    return toEvent(payload)
  },

  async query(ctx: { orderNo: string; providerRef: string; gatewayRef?: string }) {
    const c = await cfg()
    if (!c.SECRET_KEY || !ctx.gatewayRef) return null
    // Checkout Session 的支付结果看 payment_status；未支付返回 null 让对账继续等待
    const session = await fetchJson<{ payment_status?: string; payment_intent?: string; amount_total?: number; currency?: string }>(
      `${API_BASE}/checkout/sessions/${encodeURIComponent(ctx.gatewayRef)}`,
      { method: 'GET', headers: authHeaders(c.SECRET_KEY) },
    ).catch(() => null)
    if (!session) return null
    if (session.payment_status !== 'paid') return null
    return {
      type: 'payment.succeeded' as const,
      orderNo: ctx.orderNo,
      gatewayOrderNo: ctx.orderNo,
      gatewayRef: String(session.payment_intent ?? ctx.gatewayRef),
      amountCents: session.amount_total != null ? Math.round(Number(session.amount_total)) : undefined,
      currency: session.currency ? String(session.currency).toUpperCase() : undefined,
      raw: session as Record<string, unknown>,
    }
  },

  async refund(ctx) {
    const c = await cfg()
    assertConfig({ SECRET_KEY: c.SECRET_KEY }, 'stripe')
    if (!ctx.gatewayRef) throw new AppError(400, 'STRIPE_REFUND_NO_PAYMENT_INTENT: 缺少原支付单号')
    const res = await fetchJson<{ id: string }>(`${API_BASE}/refunds`, {
      method: 'POST',
      headers: { ...authHeaders(c.SECRET_KEY), 'idempotency-key': ctx.refundNo },
      // 传入原单金额以便 Stripe 校验部分退款上限
      body: toForm({ payment_intent: ctx.gatewayRef, amount: ctx.amountCents }),
    })
    return { providerRef: res?.id }
  },

  /** Stripe 只需要 2xx，无特定应答体 */
  successResponse() {
    return { contentType: 'application/json', body: JSON.stringify({ received: true }) }
  },
}

/** 供测试与对账复用的金额格式化（Stripe 用最小单位，这里仅用于日志/展示） */
export const formatStripeAmount = money
