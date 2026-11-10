import { AppError } from '../../../../middleware/errorHandler.js'
import type { PaymentGateway, GatewayEvent, GatewayOrderContext, GatewayNotifyContext, GatewaySession, GatewayRefundContext } from '../types.js'
import { assertConfig, fetchJson, money, notifyUrl, parseForm, rsaSign, rsaVerify, sortedKv } from './common.js'
import { resolveGatewayConfig } from '../credentialService.js'

/**
 * 支付宝（电脑网站支付 alipay.trade.page.pay / 统一收单交易退款，CNY）。
 *
 * - 签名 RSA2（SHA256withRSA），公共请求参数 + biz_content 按 key 字典序拼接；
 * - 收银台：构造带签名的 GET 表单，由前端自动提交到网关；
 * - 通知：form-urlencoded，剔除 sign/sign_type 后按字典序拼接待验签串，用支付宝公钥验签；
 *   trade_status ∈ TRADE_SUCCESS/TRADE_FINISHED 视为成功，成功应答必须是纯文本 success；
 * - 退款：alipay.trade.refund，out_request_no = 本地 refundNo（部分退款幂等键）。
 *
 * 凭据来源：后台加密配置（DB）为主，ALIPAY_* 环境变量兜底；详见 credentialService。
 */

interface AliParams {
  [key: string]: string
}

function commonParams(config: Record<string, string>, method: string, notify?: string): AliParams {
  return {
    app_id: config.APP_ID,
    method,
    format: 'JSON',
    charset: 'utf-8',
    sign_type: 'RSA2',
    timestamp: new Date().toISOString().slice(0, 19).replace('T', ' '),
    version: '1.0',
    ...(notify ? { notify_url: notify } : {}),
  }
}

function sign(config: Record<string, string>, params: AliParams): AliParams {
  return { ...params, sign: rsaSign(config.PRIVATE_KEY, sortedKv(params, ['sign', 'sign_type'])) }
}

async function callGateway<T = Record<string, unknown>>(
  config: Record<string, string>,
  method: string,
  bizContent: Record<string, unknown>,
  notify?: string,
): Promise<T> {
  const params = sign(config, { ...commonParams(config, method, notify), biz_content: JSON.stringify(bizContent) })
  const res = await fetch(config.GATEWAY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
    body: new URLSearchParams(params).toString(),
  })
  const text = await res.text()
  let body: Record<string, unknown>
  try {
    body = JSON.parse(text) as Record<string, unknown>
  } catch {
    throw new AppError(502, 'PAYMENT_GATEWAY_FAILED: 支付宝返回非 JSON')
  }
  const key = `${method.replace(/\./g, '_')}_response`
  const payload = (body[key] ?? body.error_response ?? {}) as Record<string, unknown>
  if (String(payload.code ?? '') !== '10000') throw new AppError(502, `PAYMENT_GATEWAY_FAILED: 支付宝 ${payload.msg ?? payload.sub_msg ?? '调用失败'}`)
  return payload as T
}

export const alipayGateway: PaymentGateway = {
  id: 'alipay',

  async assertConfigured() {
    assertConfig(await resolveGatewayConfig('alipay'), 'alipay')
  },

  async createPayment(ctx: GatewayOrderContext): Promise<GatewaySession> {
    const config = await resolveGatewayConfig('alipay')
    assertConfig(config, 'alipay')
    const params = sign(config, {
      ...commonParams(config, 'alipay.trade.page.pay', ctx.notifyUrl || notifyUrl('alipay')),
      return_url: ctx.returnUrl,
      biz_content: JSON.stringify({
        out_trade_no: ctx.gatewayOrderNo,
        total_amount: money(ctx.amountCents),
        subject: ctx.subject,
        product_code: 'FAST_INSTANT_TRADE_PAY',
      }),
    })
    return { action: 'form', form: { url: config.GATEWAY, method: 'GET', fields: params }, gatewayRef: ctx.gatewayOrderNo }
  },

  async verifyAndParse(ctx: GatewayNotifyContext): Promise<GatewayEvent> {
    const config = { ...(await resolveGatewayConfig('alipay')), ...ctx.config }
    assertConfig(config, 'alipay')
    const fields = parseForm(ctx.rawBody)
    const signature = fields.sign ?? ''
    if (!signature || !rsaVerify(config.PUBLIC_KEY, sortedKv(fields, ['sign', 'sign_type']), signature)) throw new AppError(401, '签名无效')
    const status = String(fields.trade_status ?? '')
    const ok = ['TRADE_SUCCESS', 'TRADE_FINISHED'].includes(status)
    const failed = ['TRADE_CLOSED', 'TRADE_FAIL'].includes(status)
    if (!ok && !failed) throw new AppError(400, `PAYMENT_EVENT_IGNORED: 支付宝交易状态 ${status}`)
    return {
      type: ok ? 'payment.succeeded' : 'payment.failed',
      gatewayOrderNo: fields.out_trade_no || undefined,
      gatewayRef: fields.trade_no || undefined,
      amountCents: fields.total_amount ? Math.round(Number(fields.total_amount) * 100) : undefined,
      currency: 'CNY',
      raw: fields,
    }
  },

  async query({ orderNo, providerRef, config }) {
    const cfg = { ...(await resolveGatewayConfig('alipay')), ...config }
    const res = await callGateway(cfg, 'alipay.trade.query', { out_trade_no: providerRef || orderNo })
    return res.trade_status === 'TRADE_SUCCESS'
      ? { type: 'payment.succeeded', gatewayOrderNo: String(res.out_trade_no ?? ''), gatewayRef: String(res.trade_no ?? ''), raw: res }
      : null
  },

  async refund(ctx: GatewayRefundContext & { config: Record<string, string> }) {
    const config = { ...(await resolveGatewayConfig('alipay')), ...ctx.config }
    const res = await callGateway(config, 'alipay.trade.refund', {
      out_trade_no: ctx.gatewayRef || ctx.orderNo,
      trade_no: ctx.gatewayRef,
      refund_amount: money(ctx.amountCents),
      out_request_no: ctx.refundNo,
      refund_reason: '订单退款',
    })
    return { providerRef: String(res.trade_no ?? ctx.refundNo) }
  },

  successResponse() {
    return { contentType: 'text/plain', body: 'success' }
  },
}
