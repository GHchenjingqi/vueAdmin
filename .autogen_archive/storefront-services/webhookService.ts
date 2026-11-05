import { createHmac } from 'node:crypto'
import { AppError } from '../../../middleware/errorHandler.js'
import { getTenantContext } from '../../tenant/context.js'
import { ShopOrderPayment } from '../../shop/models/index.js'
import { ShopWebhookEvent } from '../models/index.js'
import { markPaid, markPaymentFailed } from './orderService.js'

/**
 * Webhook 处理（P3-T12 / T-03 / T-04）：
 * - 验签：X-Mock-Signature: t=<ts>,v1=HMAC_SHA256(secret, t+'.'+JSON.stringify(payload))
 *   （Stripe 同构 t/v1 方案；真实 Stripe 接入时需原始请求体，见代码注释与 PAYMENT_PROVIDER_CHECK §5）
 * - 验签失败 → 400 且无任何副作用
 * - 事件去重：webhook_events(provider,eventId) 唯一 → 重复投递直接幂等返回
 * - 币种不一致：事件币种 ≠ 订单快照币种 → 审计告警不改单
 */

const tid = (): number => getTenantContext()?.tenantId ?? 1

function verifySignature(provider: string, payload: unknown, signature: string | undefined): void {
  if (provider !== 'mock') {
    // 其他 provider 接入时在此扩展（stripe: t/v1 解析 + 5 分钟新鲜度）
    throw new AppError(400, 'WEBHOOK_PROVIDER_UNSUPPORTED')
  }
  if (!signature || !signature.startsWith('t=')) throw new AppError(400, 'WEBHOOK_SIGNATURE_INVALID')
  const m = /^t=(\d+),v1=([0-9a-f]{64})$/.exec(signature)
  if (!m) throw new AppError(400, 'WEBHOOK_SIGNATURE_INVALID')
  const [, t, v1] = m
  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(t))
  if (age > 300) throw new AppError(400, 'WEBHOOK_SIGNATURE_EXPIRED')
  const secret = process.env.PAYMENT_MOCK_SECRET || 'mock_payment_secret_dev'
  const expected = createHmac('sha256', secret).update(`${t}.${JSON.stringify(payload)}`).digest('hex')
  if (expected !== v1) throw new AppError(400, 'WEBHOOK_SIGNATURE_INVALID')
}

interface WebhookEvent {
  id: string
  type: string
  data: { sessionId?: string; orderNo?: string; amountCents?: number; currency?: string }
}

/** 处理已验签事件（幂等）；返回 {deduped} 供 200 响应 */
export async function handleWebhookEvent(provider: string, payload: WebhookEvent, signature: string): Promise<{ deduped: boolean }> {
  verifySignature(provider, payload, signature)
  const tenantId = tid()
  if (!payload?.id || !payload?.type) throw new AppError(400, 'WEBHOOK_EVENT_INVALID')

  // 事件去重（唯一索引兜底并发）
  try {
    await ShopWebhookEvent.create({ tenantId, provider, eventId: payload.id, type: payload.type, payload: payload as unknown as Record<string, unknown> } as never)
  } catch (err) {
    if ((err as { name?: string }).name === 'SequelizeUniqueConstraintError') return { deduped: true }
    throw err
  }

  if (payload.type === 'payment.succeeded' || payload.type === 'payment.failed') {
    const payment = payload.data?.sessionId ? await ShopOrderPayment.findOne({ where: { tenantId, sessionId: payload.data.sessionId } }) : null
    if (!payment) throw new AppError(404, 'PAYMENT_SESSION_NOT_FOUND')
    const orderNo = payment.orderNo

    // 币种一致性：事件币种 ≠ 支付单快照币种 → 告警不改单（P3-T12）
    if (payload.data?.currency && payload.data.currency !== payment.currency) {
      await ShopWebhookEvent.create({ tenantId, provider, eventId: `${payload.id}:currency-mismatch`, type: 'alert.currency_mismatch', payload } as never).catch(() => undefined)
      return { deduped: false }
    }

    // 金额一致性：事件金额 ≠ 支付单快照 → 告警不改单
    if (payload.data?.amountCents !== undefined && Number(payload.data.amountCents) !== Number(payment.amountCents)) {
      await ShopWebhookEvent.create({ tenantId, provider, eventId: `${payload.id}:amount-mismatch`, type: 'alert.amount_mismatch', payload } as never).catch(() => undefined)
      return { deduped: false }
    }

    if (payload.type === 'payment.succeeded') {
      await payment.update({ status: 'captured', rawPayload: payload as unknown as Record<string, unknown> })
      await markPaid(orderNo, payload.id)
    } else {
      await payment.update({ status: 'failed' })
      await markPaymentFailed(orderNo, payload.id, 'payment.failed')
    }
  }

  return { deduped: false }
}
