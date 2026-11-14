import { createHmac, timingSafeEqual } from 'crypto'
import { AppError } from '../../../middleware/errorHandler.js'
import config from '../../../config/index.js'
import type { PaymentGateway, GatewayEvent, GatewayOrderContext, GatewayNotifyContext, GatewaySession } from './types.js'
import { getProvider } from './providerRegistry.js'
import { failVerify, header } from './gateways/common.js'
import { paypalGateway } from './gateways/paypal.js'
import { wechatGateway } from './gateways/wechat.js'
import { alipayGateway } from './gateways/alipay.js'
import { unionpayGateway } from './gateways/unionpay.js'
import { stripeGateway } from './gateways/stripe.js'

/** mock / bnpl 沿用 HMAC-SHA256 签名与自定义 JSON 事件（保持既有沙箱链路与回归契约） */
const mockGateway: PaymentGateway = {
  id: 'mock',
  async assertConfigured() {
    /* 内网沙箱通道，无需外部凭据 */
  },
  async createPayment(_ctx: GatewayOrderContext): Promise<GatewaySession> {
    return { action: 'mock' }
  },
  async verifyAndParse(ctx: GatewayNotifyContext): Promise<GatewayEvent> {
    const def = getProvider(ctx.config.providerId)
    // 安全修复（CWE-798 / CWE-345）：mock/bnpl 回调必须以配置的独立 webhook 密钥验签，
    // 严禁退回硬编码默认密钥。未配置（含仍为旧默认常量 'storefront_mock_webhook_secret'）
    // 时 fail-closed 拒绝——否则任意匿名者可凭已知默认密钥伪造 payment.succeeded，
    // 把任意订单标记为已支付/已收款，造成资损。
    const secret = def?.webhookSecret ?? config.payment?.webhookSecret
    if (!secret || secret === 'storefront_mock_webhook_secret') {
      throw new AppError(401, 'mock/bnpl 回调未配置独立 webhook 密钥（禁止默认密钥），拒绝')
    }
    const signature = ctx.config.signature ?? ''
    if (!signature) throw new AppError(401, '缺少签名')
    const expected = createHmac('sha256', secret).update(ctx.rawBody).digest('hex')
    const a = Buffer.from(signature)
    const b = Buffer.from(expected)
    if (a.length !== b.length || !timingSafeEqual(a, b)) failVerify()
    let payload: Record<string, unknown>
    try {
      payload = JSON.parse(ctx.rawBody.toString('utf8')) as Record<string, unknown>
    } catch {
      throw new AppError(400, '非法 JSON')
    }
    const type = payload.type === 'payment.failed' ? 'payment.failed' : 'payment.succeeded'
    return {
      type,
      providerRef: payload.providerRef ? String(payload.providerRef) : undefined,
      orderNo: payload.orderNo ? String(payload.orderNo) : undefined,
      amountCents: payload.amountCents != null ? Number(payload.amountCents) : undefined,
      currency: payload.currency ? String(payload.currency) : undefined,
      raw: payload,
    }
  },
}

const REAL: Record<string, PaymentGateway> = {
  paypal: paypalGateway,
  stripe: stripeGateway,
  wechat: wechatGateway,
  alipay: alipayGateway,
  unionpay: unionpayGateway,
}

export function getGateway(providerId: string): PaymentGateway | undefined {
  const def = getProvider(providerId)
  if (!def) return undefined
  return def.real ? REAL[def.id] : mockGateway
}

/** 建会话前校验：真实网关缺配置直接 503，禁止静默降级为 mock 或假成功 */
export async function assertGatewayConfigured(providerId: string): Promise<void> {
  const gateway = getGateway(providerId)
  if (!gateway) throw new AppError(422, '支付方式不可用')
  await gateway.assertConfigured()
}

/** 从请求头提取各网关验签所需信息（供 controller 统一收集） */
export function collectNotifyContext(headers: Record<string, string | string[] | undefined>, rawBody: Buffer, signature?: string) {
  return {
    headers,
    rawBody,
    config: { signature: signature ?? (header(headers, 'x-mock-signature') || header(headers, 'x-signature')) },
  }
}
