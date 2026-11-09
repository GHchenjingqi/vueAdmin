import crypto from 'crypto'
import { AppError } from '../../../../middleware/errorHandler.js'
import type { PaymentGateway, GatewayEvent, GatewayOrderContext, GatewayNotifyContext, GatewaySession, GatewayRefundContext } from '../types.js'
import { aesGcmDecrypt, assertConfig, envConfig, fetchJson, header, notifyUrl, rsaSign, rsaVerify } from './common.js'

/**
 * 微信支付 APIv3（Native 扫码，CNY）。
 *
 * - 下单：POST /v3/pay/transactions/native → code_url → 二维码；
 * - 请求签名：WECHATPAY2-SHA256-RSA2048（method\nurl\ntimestamp\nnonce\nbody\n，商户私钥 RSA-SHA256）；
 * - 通知验签：Wechatpay-Signature + Timestamp/Nonce + 银联…（平台公钥 RSA-SHA256），
 *   随后用 APIv3 密钥 AES-256-GCM 解密 resource 得到真实交易数据；
 * - 退款：POST /v3/refund/domestic/refunds，out_refund_no = 本地 refundNo（网关侧幂等键）。
 *
 * 凭据环境变量：WECHAT_MCH_ID / WECHAT_APP_ID / WECHAT_API_V3_KEY / WECHAT_SERIAL_NO /
 * WECHAT_PRIVATE_KEY(PEM) / WECHAT_PLATFORM_PUBLIC_KEY(PEM)。
 */
const KEYS = ['MCH_ID', 'APP_ID', 'API_V3_KEY', 'SERIAL_NO', 'PRIVATE_KEY', 'PLATFORM_PUBLIC_KEY']
const BASE = 'https://api.mch.weixin.qq.com'

function authorization(config: Record<string, string>, method: string, urlPath: string, body: string): string {
  const nonce = crypto.randomBytes(16).toString('hex').toUpperCase()
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const message = `${method}\n${urlPath}\n${timestamp}\n${nonce}\n${body}\n`
  const signature = rsaSign(config.PRIVATE_KEY, message)
  return `WECHATPAY2-SHA256-RSA2048 mchid="${config.MCH_ID}",nonce_str="${nonce}",timestamp="${timestamp}",serial_no="${config.SERIAL_NO}",signature="${signature}"`
}

async function wxFetch<T>(config: Record<string, string>, method: string, path: string, body = ''): Promise<T> {
  return fetchJson<T>(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: authorization(config, method, path, body),
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': 'storefront-payment/1.0',
    },
    body: method === 'GET' ? undefined : body || '{}',
  })
}

export const wechatGateway: PaymentGateway = {
  id: 'wechat',

  assertConfigured() {
    assertConfig(envConfig('WECHAT', KEYS), 'wechat')
  },

  async createPayment(ctx: GatewayOrderContext): Promise<GatewaySession> {
    const config = envConfig('WECHAT', KEYS)
    assertConfig(config, 'wechat')
    const body = JSON.stringify({
      appid: config.APP_ID,
      mchid: config.MCH_ID,
      description: ctx.subject,
      out_trade_no: ctx.gatewayOrderNo,
      notify_url: ctx.notifyUrl || notifyUrl('wechat'),
      amount: { total: ctx.amountCents, currency: ctx.currency },
    })
    const res = await wxFetch<{ code_url: string; prepay_id?: string }>(config, 'POST', '/v3/pay/transactions/native', body)
    if (!res.code_url) throw new AppError(502, 'PAYMENT_GATEWAY_FAILED: 微信支付未返回 code_url')
    return { action: 'qr', qrCode: res.code_url, gatewayRef: res.prepay_id, clientParams: { codeUrl: res.code_url } }
  },

  async verifyAndParse(ctx: GatewayNotifyContext): Promise<GatewayEvent> {
    const config = { ...envConfig('WECHAT', KEYS), ...ctx.config }
    assertConfig(config, 'wechat')
    const timestamp = header(ctx.headers, 'wechatpay-timestamp')
    const nonce = header(ctx.headers, 'wechatpay-nonce')
    const signature = header(ctx.headers, 'wechatpay-signature')
    const raw = ctx.rawBody.toString('utf8')
    if (!timestamp || !nonce || !signature) throw new AppError(401, '缺少签名')
    if (!rsaVerify(config.PLATFORM_PUBLIC_KEY, `${timestamp}\n${nonce}\n${raw}\n`, signature)) throw new AppError(401, '签名无效')

    let envelope: Record<string, unknown>
    try {
      envelope = JSON.parse(raw) as Record<string, unknown>
    } catch {
      throw new AppError(400, '非法 JSON')
    }
    const resource = (envelope.resource ?? {}) as Record<string, unknown>
    const plain = aesGcmDecrypt(config.API_V3_KEY, String(resource.ciphertext ?? ''), String(resource.nonce ?? ''), String(resource.associated_data ?? ''))
    const outTradeNo = String(plain.out_trade_no ?? '')
    const state = String(plain.trade_state ?? '')
    const amount = (plain.amount ?? {}) as Record<string, unknown>
    const ok = state === 'SUCCESS'
    const failed = ['CLOSED', 'PAYERROR', 'REVOKED'].includes(state)
    if (!ok && !failed) throw new AppError(400, `PAYMENT_EVENT_IGNORED: 微信交易状态 ${state}`)
    return {
      type: ok ? 'payment.succeeded' : 'payment.failed',
      gatewayOrderNo: outTradeNo || undefined,
      gatewayRef: String(plain.transaction_id ?? ''),
      amountCents: amount.payer_total != null ? Number(amount.payer_total) : amount.total != null ? Number(amount.total) : undefined,
      currency: amount.currency ? String(amount.currency) : 'CNY',
      raw: plain,
    }
  },

  async query({ orderNo, providerRef, config }) {
    const cfg = { ...envConfig('WECHAT', KEYS), ...config }
    const no = providerRef || orderNo
    const res = await wxFetch<Record<string, unknown>>(cfg, 'GET', `/v3/pay/transactions/out-trade-no/${encodeURIComponent(no)}?mchid=${cfg.MCH_ID}`, '')
    return res.trade_state === 'SUCCESS'
      ? { type: 'payment.succeeded', gatewayOrderNo: String(res.out_trade_no ?? no), gatewayRef: String(res.transaction_id ?? ''), raw: res }
      : null
  },

  async refund(ctx: GatewayRefundContext & { config: Record<string, string> }) {
    const config = { ...envConfig('WECHAT', KEYS), ...ctx.config }
    const body = JSON.stringify({
      out_trade_no: ctx.gatewayRef || ctx.orderNo,
      out_refund_no: ctx.refundNo,
      reason: '订单退款',
      notify_url: notifyUrl('wechat-refund'),
      amount: { refund: ctx.amountCents, total: ctx.originalAmountCents ?? ctx.amountCents, currency: ctx.currency },
    })
    const res = await wxFetch<{ refund_id: string }>(config, 'POST', '/v3/refund/domestic/refunds', body)
    return { providerRef: res.refund_id }
  },

  successResponse() {
    return { contentType: 'application/json', body: JSON.stringify({ code: 'SUCCESS', message: '成功' }) }
  },
}
