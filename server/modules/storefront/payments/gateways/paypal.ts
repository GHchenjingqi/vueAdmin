import { AppError } from '../../../../middleware/errorHandler.js'
import type { PaymentGateway, GatewayEvent, GatewayOrderContext, GatewayNotifyContext, GatewaySession } from '../types.js'
import { assertConfig, baseUrl, envConfig, fetchJson, header, money } from './common.js'

/**
 * PayPal Orders v2（USD / EUR / GBP / CAD / AUD）。
 *
 * - 下单：/v2/checkout/orders（PayPal-Request-Id = 本地幂等键，重放不重复建单）；
 * - 收银台：返回 approve 链接跳转让用户授权；用户返回后由服务端主动 capture；
 * - 通知验签：/v1/notifications/verify-webhook-signature（PayPal 侧证书链校验，
 *   不是本地 HMAC），验签通过后再解析事件；
 * - 退款：/v2/payments/captures/{captureId}/refund。
 *
 * 凭据环境变量：PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET / PAYPAL_ENV /
 * PAYPAL_WEBHOOK_ID；回调域名 PAYMENT_PUBLIC_BASE_URL。
 */
const KEYS = ['CLIENT_ID', 'CLIENT_SECRET', 'ENV', 'WEBHOOK_ID']

const apiBase = (config: Record<string, string>): string => (config.ENV === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com')

async function token(config: Record<string, string>): Promise<string> {
  const auth = Buffer.from(`${config.CLIENT_ID}:${config.CLIENT_SECRET}`).toString('base64')
  const res = await fetchJson<{ access_token: string }>(`${apiBase(config)}/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  })
  return res.access_token
}

function toEvent(raw: Record<string, unknown>): GatewayEvent {
  const eventType = String(raw.event_type ?? '')
  const resource = (raw.resource ?? {}) as Record<string, unknown>
  const gatewayOrderNo = String(resource.custom_id ?? (resource.supplementary_data as Record<string, unknown> | undefined)?.related_ids ?? '')
  const amount = (resource.amount ?? {}) as Record<string, unknown>
  const ok = ['PAYMENT.CAPTURE.COMPLETED', 'CHECKOUT.ORDER.COMPLETED', 'CHECKOUT.PAYMENT-APPROVED'].includes(eventType)
  const failed = ['PAYMENT.CAPTURE.DENIED', 'PAYMENT.CAPTURE.DECLINED', 'CHECKOUT.ORDER.VOIDED'].includes(eventType)
  if (!ok && !failed) throw new AppError(400, `PAYMENT_EVENT_IGNORED: 不支持的 PayPal 事件 ${eventType}`)
  return {
    type: ok ? 'payment.succeeded' : 'payment.failed',
    gatewayOrderNo: gatewayOrderNo || undefined,
    gatewayRef: String(resource.id ?? ''),
    amountCents: amount.value != null ? Math.round(Number(amount.value) * 100) : undefined,
    currency: amount.currency_code ? String(amount.currency_code) : undefined,
    raw,
  }
}

export const paypalGateway: PaymentGateway = {
  id: 'paypal',

  assertConfigured() {
    assertConfig(envConfig('PAYPAL', KEYS), 'paypal')
    if (!baseUrl()) throw new AppError(503, 'PAYMENT_GATEWAY_NOT_CONFIGURED: PAYMENT_PUBLIC_BASE_URL 未配置')
  },

  async createPayment(ctx: GatewayOrderContext): Promise<GatewaySession> {
    const config = envConfig('PAYPAL', KEYS)
    assertConfig(config, 'paypal')
    const access = await token(config)
    const body = {
      intent: 'CAPTURE',
      purchase_units: [
        {
          invoice_id: ctx.gatewayOrderNo,
          custom_id: ctx.gatewayOrderNo,
          amount: { currency_code: ctx.currency, value: money(ctx.amountCents) },
          description: ctx.subject,
        },
      ],
      application_context: { return_url: ctx.returnUrl, cancel_url: ctx.returnUrl, user_action: 'PAY_NOW' },
    }
    const order = await fetchJson<{ id: string; links?: { rel: string; href: string }[] }>(`${apiBase(config)}/v2/checkout/orders`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json', 'PayPal-Request-Id': ctx.providerRef },
      body: JSON.stringify(body),
    })
    const approve = order.links?.find((l) => l.rel === 'approve' || l.rel === 'payer-action')?.href
    if (!approve) throw new AppError(502, 'PAYMENT_GATEWAY_FAILED: PayPal 未返回 approve 链接')
    return { action: 'redirect', redirectUrl: approve, gatewayRef: order.id, clientParams: { orderId: order.id, clientId: config.CLIENT_ID } }
  },

  async verifyAndParse(ctx: GatewayNotifyContext): Promise<GatewayEvent> {
    const config = { ...envConfig('PAYPAL', KEYS), ...ctx.config }
    assertConfig(config, 'paypal')
    const access = await token(config)
    let raw: Record<string, unknown>
    try {
      raw = JSON.parse(ctx.rawBody.toString('utf8')) as Record<string, unknown>
    } catch {
      throw new AppError(400, '非法 JSON')
    }
    const verification = await fetchJson<{ verification_status: string }>(`${apiBase(config)}/v1/notifications/verify-webhook-signature`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        auth_algo: header(ctx.headers, 'paypal-auth-algo'),
        cert_url: header(ctx.headers, 'paypal-cert-url'),
        transmission_id: header(ctx.headers, 'paypal-transmission-id'),
        transmission_sig: header(ctx.headers, 'paypal-transmission-sig'),
        transmission_time: header(ctx.headers, 'paypal-transmission-time'),
        webhook_id: config.WEBHOOK_ID,
        webhook_event: raw,
      }),
    })
    if (verification.verification_status !== 'SUCCESS') throw new AppError(401, 'PayPal Webhook 验签失败')
    return toEvent(raw)
  },

  async capture({ gatewayRef, config }): Promise<GatewayEvent> {
    const cfg = { ...envConfig('PAYPAL', KEYS), ...config }
    const access = await token(cfg)
    const raw = await fetchJson<Record<string, unknown>>(`${apiBase(cfg)}/v2/checkout/orders/${encodeURIComponent(gatewayRef)}/capture`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json', 'PayPal-Request-Id': gatewayRef },
      body: '{}',
    })
    return {
      type: 'payment.succeeded',
      gatewayRef,
      gatewayOrderNo: String((raw.purchase_units as Record<string, unknown>[] | undefined)?.[0]?.custom_id ?? ''),
      raw,
    }
  },

  async refund({ refundNo, amountCents, currency, gatewayRef, config }) {
    const cfg = { ...envConfig('PAYPAL', KEYS), ...config }
    const access = await token(cfg)
    const order = await fetchJson<Record<string, unknown>>(`${apiBase(cfg)}/v2/checkout/orders/${encodeURIComponent(gatewayRef ?? '')}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${access}` },
    })
    const units = (order.purchase_units ?? []) as Record<string, unknown>[]
    const captureId = String(((units[0]?.payments as Record<string, unknown> | undefined)?.captures as Record<string, unknown>[] | undefined)?.[0]?.id ?? '')
    if (!captureId) throw new AppError(502, 'PAYMENT_GATEWAY_FAILED: PayPal 原支付 captureId 缺失，无法退款')
    const res = await fetchJson<{ id: string }>(`${apiBase(cfg)}/v2/payments/captures/${encodeURIComponent(captureId)}/refund`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json', 'PayPal-Request-Id': refundNo },
      body: JSON.stringify({ amount: { value: money(amountCents), currency_code: currency } }),
    })
    return { providerRef: res.id }
  },
}
