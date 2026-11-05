import { randomUUID } from 'node:crypto'
import { AppError } from '../../../middleware/errorHandler.js'
import { getTenantContext } from '../../tenant/context.js'
import { ShopOrder, ShopOrderPayment } from '../../shop/models/index.js'
import { newEventId, signMockPayload } from './currencyConfig.js'
import { handleWebhookEvent } from './webhookService.js'

/**
 * 支付会话（P3-T11）：金额与币种一律取订单快照（C6）；服务商不支持该币种 → 明确报错，禁止静默换汇（C5）。
 * Provider 适配层：mock（本仓内置，签名 Webhook 沙箱闭环）/ stripe（真实开户后启用，见 PAYMENT_PROVIDER_CHECK §5）。
 */

const tid = (): number => getTenantContext()?.tenantId ?? 1

interface ProviderInfo {
  id: string
  supportedCurrencies: string[]
}

/** 服务商能力矩阵（真实清单以开户后 Dashboard 为准，见 PAYMENT_PROVIDER_CHECK.md §2） */
const PROVIDERS: Record<string, ProviderInfo> = {
  mock: { id: 'mock', supportedCurrencies: ['USD', 'CNY', 'EUR', 'GBP', 'CAD', 'AUD'] },
  stripe: { id: 'stripe', supportedCurrencies: ['USD', 'EUR', 'GBP', 'CAD', 'AUD'] },
}

export async function createPaymentSession(orderNo: string, returnUrl: string): Promise<{ provider: string; sessionId: string; providerRef: string; sessionUrl: string; amount: { amount: number; currency: string } }> {
  const tenantId = tid()
  const order = await ShopOrder.findOne({ where: { tenantId, orderNo } })
  if (!order) throw new AppError(404, 'ORDER_NOT_FOUND')
  if (order.status !== 'created') throw new AppError(409, 'ORDER_NOT_PAYABLE')

  // 币种能力前置校验（PROVIDER_CURRENCY_UNSUPPORTED → 阻断而非换汇）
  const providerId = 'mock'
  const provider = PROVIDERS[providerId]
  if (!provider.supportedCurrencies.includes(order.currency)) {
    throw new AppError(409, 'PROVIDER_CURRENCY_UNSUPPORTED')
  }

  const sessionId = randomUUID()
  const providerRef = `mp_${sessionId.replace(/-/g, '').slice(0, 20)}`
  const amountCents = Number(order.amountCents)
  const payment = await ShopOrderPayment.create({
    tenantId, orderId: order.id, orderNo: order.orderNo, provider: providerId, providerRef, sessionId,
    amountCents, currency: order.currency, status: 'initiated', rawPayload: { returnUrl },
  } as never)

  if (order.paymentStatus === 'none') {
    await order.update({ paymentStatus: 'initiated' })
  }

  // mock 收单页：用户在页面上选择「模拟支付成功 / 失败」→ confirm 端点以正确签名投递事件（真实服务商由其服务器回调 /webhooks/:provider）
  const base = process.env.STOREFRONT_API_BASE || `https://localhost:${process.env.SERVER_PORT || 5173}`
  const sessionUrl = `${base}/api/storefront/v1/payments/mock/${sessionId}`
  return { provider: providerId, sessionId, providerRef, sessionUrl, amount: { amount: amountCents, currency: order.currency } }
}

/** Mock 收单确认：构造带签名的事件并走同一条 Webhook 校验/幂等链路（T-03/T-04 沙箱载体） */
export async function confirmMockSession(sessionId: string, outcome: 'success' | 'failure'): Promise<{ orderNo: string; status: string }> {
  const tenantId = tid()
  const payment = await ShopOrderPayment.findOne({ where: { tenantId, sessionId } })
  if (!payment) throw new AppError(404, 'PAYMENT_SESSION_NOT_FOUND')

  const secret = process.env.PAYMENT_MOCK_SECRET || 'mock_payment_secret_dev'
  const event = {
    id: newEventId(),
    type: outcome === 'success' ? 'payment.succeeded' : 'payment.failed',
    data: {
      sessionId,
      providerRef: payment.providerRef,
      orderNo: payment.orderNo,
      amountCents: Number(payment.amountCents),
      currency: payment.currency,
    },
  }
  const signature = signMockPayload(secret, event)
  await handleWebhookEvent('mock', event, signature)
  const order = await ShopOrder.findOne({ where: { tenantId, orderNo: payment.orderNo } })
  return { orderNo: payment.orderNo, status: order?.paymentStatus ?? 'unknown' }
}
