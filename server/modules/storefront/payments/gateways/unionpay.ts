import { AppError } from '../../../../middleware/errorHandler.js'
import type { PaymentGateway, GatewayEvent, GatewayOrderContext, GatewayNotifyContext, GatewaySession, GatewayRefundContext } from '../types.js'
import { assertConfig, envConfig, fetchJson, header, notifyUrl, parseForm, rsaSign, rsaVerify, sortedKv } from './common.js'

/**
 * 银联全渠道 / 云闪付（frontTransReq 前台跳转，backTransReq 退款）。
 *
 * 业务口径：全国通用，后台无论启用哪个币种都展示；外币订单原样按订单快照币种
 * 传给网关（currencyCode 走 ISO 4217 数字代码映射，金额不做任何换算）。
 *
 * - 签名：signMethod=01（RSA-SHA256），除 signature 外全部参数按字典序 k=v& 拼接；
 * - 收银台：构造带签名的表单由前端自动提交到 frontTransReq.do；
 * - 通知：form-urlencoded，验签用银联公钥证书，respCode=00 视为成功；
 * - 退款：txnType=04 / txnSubType=00，orderId = 本地 refundNo。
 *
 * 凭据环境变量：UNIONPAY_MER_ID / UNIONPAY_CERT_ID / UNIONPAY_PRIVATE_KEY(PEM) /
 * UNIONPAY_PUBLIC_KEY(PEM) / UNIONPAY_GATEWAY / UNIONPAY_FRONT_TRANS_URL / UNIONPAY_BACK_TRANS_URL。
 */
const KEYS = ['MER_ID', 'CERT_ID', 'PRIVATE_KEY', 'PUBLIC_KEY', 'GATEWAY', 'FRONT_TRANS_URL', 'BACK_TRANS_URL']

/** ISO 4217 数字货币代码（银联 currencyCode 用数字，不做金额换算） */
const CURRENCY_CODE: Record<string, string> = { CNY: '156', USD: '840', EUR: '978', GBP: '826', CAD: '124', AUD: '036', JPY: '392', HKD: '344' }

function currencyCode(currency: string): string {
  const code = CURRENCY_CODE[currency.toUpperCase()]
  if (!code) throw new AppError(422, `PAYMENT_CURRENCY_UNSUPPORTED: 银联不支持币种 ${currency} 的数字代码`)
  return code
}

function baseFields(config: Record<string, string>, extra: Record<string, string>): Record<string, string> {
  return {
    version: '5.1.0',
    encoding: 'UTF-8',
    certId: config.CERT_ID,
    signMethod: '01',
    merId: config.MER_ID,
    ...extra,
  }
}

function signed(config: Record<string, string>, fields: Record<string, string>): Record<string, string> {
  return { ...fields, signature: rsaSign(config.PRIVATE_KEY, sortedKv(fields, ['signature'])) }
}

async function backTrans(config: Record<string, string>, fields: Record<string, string>): Promise<Record<string, string>> {
  const body = new URLSearchParams(signed(config, fields)).toString()
  const res = await fetch(config.BACK_TRANS_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' }, body })
  const parsed = parseForm(Buffer.from(await res.text()))
  if (!rsaVerify(config.PUBLIC_KEY, sortedKv(parsed, ['signature']), parsed.signature ?? ''))
    throw new AppError(502, 'PAYMENT_GATEWAY_FAILED: 银联应答验签失败')
  return parsed
}

export const unionpayGateway: PaymentGateway = {
  id: 'unionpay',

  assertConfigured() {
    assertConfig(envConfig('UNIONPAY', KEYS), 'unionpay')
  },

  async createPayment(ctx: GatewayOrderContext): Promise<GatewaySession> {
    const config = envConfig('UNIONPAY', KEYS)
    assertConfig(config, 'unionpay')
    const txnTime = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
    const fields = signed(
      config,
      baseFields(config, {
        txnType: '01',
        txnSubType: '01',
        bizType: '000201',
        channelType: '07',
        accessType: '0',
        orderId: ctx.gatewayOrderNo,
        txnTime,
        txnAmt: String(ctx.amountCents),
        currencyCode: currencyCode(ctx.currency),
        frontUrl: ctx.returnUrl,
        backUrl: ctx.notifyUrl || notifyUrl('unionpay'),
        payTimeout: new Date(Date.now() + 15 * 60 * 1000).toISOString().replace(/[-:T]/g, '').slice(0, 14),
      }),
    )
    return {
      action: 'form',
      form: { url: config.FRONT_TRANS_URL, method: 'POST', fields },
      gatewayRef: ctx.gatewayOrderNo,
      clientParams: { gateway: config.GATEWAY },
    }
  },

  async verifyAndParse(ctx: GatewayNotifyContext): Promise<GatewayEvent> {
    const config = { ...envConfig('UNIONPAY', KEYS), ...ctx.config }
    assertConfig(config, 'unionpay')
    const fields = parseForm(ctx.rawBody)
    if (!fields.signature || !rsaVerify(config.PUBLIC_KEY, sortedKv(fields, ['signature']), fields.signature)) throw new AppError(401, '签名无效')
    const ok = fields.respCode === '00' || fields.respCode === 'A6'
    const failed = !!fields.respCode && !ok
    if (!ok && !failed) throw new AppError(400, 'PAYMENT_EVENT_IGNORED: 银联通知缺少 respCode')
    return {
      type: ok ? 'payment.succeeded' : 'payment.failed',
      gatewayOrderNo: fields.orderId || undefined,
      gatewayRef: fields.queryId || undefined,
      amountCents: fields.txnAmt ? Number(fields.txnAmt) : undefined,
      currency: fields.currencyCode ? (Object.keys(CURRENCY_CODE).find((k) => CURRENCY_CODE[k] === fields.currencyCode) ?? undefined) : undefined,
      raw: fields,
    }
  },

  async query({ orderNo, providerRef, config }) {
    const cfg = { ...envConfig('UNIONPAY', KEYS), ...config }
    const txnTime = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
    const res = await backTrans(cfg, baseFields(cfg, { txnType: '00', txnSubType: '00', bizType: '000000', orderId: providerRef || orderNo, txnTime }))
    return res.respCode === '00' && res.origRespCode === '00'
      ? { type: 'payment.succeeded', gatewayOrderNo: res.orderId, gatewayRef: res.queryId, raw: res }
      : null
  },

  async refund(ctx: GatewayRefundContext & { config: Record<string, string> }) {
    const config = { ...envConfig('UNIONPAY', KEYS), ...ctx.config }
    const txnTime = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
    const res = await backTrans(
      config,
      baseFields(config, {
        txnType: '04',
        txnSubType: '00',
        bizType: '000201',
        channelType: '07',
        accessType: '0',
        orderId: ctx.refundNo,
        origQryId: ctx.gatewayRef ?? '',
        txnTime,
        txnAmt: String(ctx.amountCents),
        currencyCode: currencyCode(ctx.currency),
        backUrl: notifyUrl('unionpay-refund'),
      }),
    )
    return { providerRef: res.queryId ?? ctx.refundNo }
  },

  successResponse() {
    return { contentType: 'text/plain', body: 'ok' }
  },
}
