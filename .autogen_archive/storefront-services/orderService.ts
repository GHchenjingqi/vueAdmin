import { randomBytes } from 'node:crypto'
import { Op } from 'sequelize'
import { AppError } from '../../../middleware/errorHandler.js'
import { getTenantContext } from '../../tenant/context.js'
import { ShopCoupon, ShopOrder, ShopOrderItem } from '../../shop/models/index.js'
import { ShopCart, ShopCartItem, ShopCouponRedemption, ShopOrderEvent } from '../models/index.js'
import { commitByRef, releaseByRef, reserve } from './reservationService.js'
import { computeQuote } from './quoteService.js'

/**
 * 订单（P3-T10/T13 / 状态机落地 / T-02 幂等 / T-10 防枚举）
 *
 * - 幂等：Idempotency-Key 唯一索引，重复提交返回原订单
 * - 快照：items（title/spec/单价/行小计/币种）+ 地址固化（C6：历史订单币种不受后台切换影响）
 * - 状态机：created→paid（Webhook captured）/ created→cancelled；非法跃迁拒绝并审计
 * - 审计：每次跃迁写 order_events（X-T03）
 * - 库存预占 ref=order:{orderNo}（稳定，release/commit 按此幂等）
 */

const tid = (): number => getTenantContext()?.tenantId ?? 1

export function newAccessToken(): string {
  return randomBytes(24).toString('hex')
}

function newOrderNo(): string {
  return `SO${Date.now()}${Math.floor(Math.random() * 1000)}`
}

/** 记录订单事件（审计） */
async function recordEvent(orderId: number, orderNo: string, from: string | null, to: string, actor: string, reason: string | null, eventId: string | null): Promise<void> {
  const tenantId = tid()
  await ShopOrderEvent.create({ tenantId, orderId, orderNo, from, to, actor, reason, eventId } as never)
}

/** 服务端建单：报价重算 → 库存预占 → 快照落库；同幂等键重放返回原单 */
export async function createOrder(cartToken: string, input: Record<string, unknown>, idempotencyKey: string | null): Promise<{ orderNo: string; id: number; accessToken: string }> {
  const tenantId = tid()
  if (idempotencyKey) {
    const existing = await ShopOrder.findOne({ where: { tenantId, idempotencyKey } })
    if (existing) return { orderNo: existing.orderNo, id: existing.id, accessToken: existing.accessToken ?? '' }
  }

  const address = (input.address ?? {}) as Record<string, string>
  const country = (address.country ?? '').toUpperCase()
  const quote = await computeQuote(cartToken, {
    country,
    couponCode: input.couponCode as string | undefined,
    shippingRateId: input.shippingRateId as string | undefined,
  })

  const cartRow = await ShopCart.findOne({ where: { tenantId, token: cartToken } })
  if (!cartRow) throw new AppError(404, 'CART_NOT_FOUND')
  const cartItems = await ShopCartItem.findAll({ where: { tenantId, cartId: cartRow.id } })

  const orderNo = newOrderNo()
  const accessToken = newAccessToken()

  // 库存预占（跨 SKU 一致性：失败整体回滚，订单不入库）；ref 稳定=order:{orderNo}
  await reserve(cartItems.map((i) => ({ skuId: i.skuId, qty: i.qty })), `order:${orderNo}`)

  const totalCents = quote.total.amount
  const order = await ShopOrder.create({
    orderNo,
    channelId: 0,
    shopId: 0,
    buyer: { email: input.email ?? '' },
    currency: quote.currency,
    amount: totalCents / 100,
    status: 'created',
    tenantId,
    paymentStatus: 'none',
    email: input.email ?? null,
    shippingAddress: address,
    note: input.note ?? null,
    subtotalCents: quote.subtotal.amount,
    discountCents: quote.discount.amount,
    shippingCents: quote.shipping.amount,
    taxCents: quote.tax.amount,
    amountCents: totalCents,
    couponCode: input.couponCode ?? null,
    accessToken,
    idempotencyKey,
    reservationId: null,
    policySnapshot: { capturedAt: new Date().toISOString() },
  } as never)

  for (const item of cartItems) {
    const unit = quote.items.find((q) => q.skuId === item.skuId)?.unit.amount ?? Number(item.unitAmountCents)
    await ShopOrderItem.create({
      orderId: order.id, skuId: item.skuId, qty: item.qty, price: unit / 100, tenantId,
      title: item.titleSnapshot, spec: item.specSnapshot, unitAmountCents: unit, lineTotalCents: unit * item.qty, currency: quote.currency,
    } as never)
  }

  if (quote.appliedCoupon) {
    const coupon = await ShopCoupon.findOne({ where: { tenantId, code: quote.appliedCoupon.code } })
    if (coupon) {
      await coupon.increment('usedCount')
      await ShopCouponRedemption.create({
        tenantId, couponId: coupon.id, code: coupon.code, orderNo,
        discountCents: quote.discount.amount, currency: quote.currency,
      } as never)
    }
  }

  await recordEvent(order.id, orderNo, null, 'created', 'customer', 'order created', null)
  return { orderNo, id: order.id, accessToken }
}

/** 订单状态跃迁白名单（现状枚举沿用 admin：created/paid/fulfilled/shipped/done/cancelled） */
const ALLOWED: Record<string, string[]> = {
  created: ['paid', 'cancelled'],
  paid: ['fulfilled', 'cancelled'],
  fulfilled: ['shipped'],
  shipped: ['done'],
}
export function canTransition(from: string, to: string): boolean {
  return (ALLOWED[from] ?? []).includes(to)
}

/** 记录跃迁（含非法跃迁审计） */
async function auditTransition(orderNo: string, from: string, to: string, actor: string, reason: string | null, eventId: string | null): Promise<void> {
  const tenantId = tid()
  const order = await ShopOrder.findOne({ where: { tenantId, orderNo } })
  if (!order) return
  await ShopOrderEvent.create({ tenantId, orderId: order.id, orderNo, from, to, actor, reason, eventId } as never)
}

/** 支付成功（Webhook）：created→paid + 库存实扣 + 优惠券核销；已 paid 幂等返回 */
export async function markPaid(orderNo: string, eventId: string | null): Promise<void> {
  const tenantId = tid()
  const order = await ShopOrder.findOne({ where: { tenantId, orderNo } })
  if (!order) return
  if (order.status === 'paid') return
  if (!canTransition(order.status, 'paid')) {
    await auditTransition(orderNo, order.status, order.status, 'webhook', `illegal transition ignored (want paid)`, eventId)
    throw new AppError(409, 'ILLEGAL_TRANSITION')
  }
  await order.update({ status: 'paid', paymentStatus: 'captured', paidAt: new Date() })
  await recordEvent(order.id, orderNo, 'created', 'paid', 'webhook', 'payment captured', eventId)
  await commitByRef(`order:${orderNo}`)
}

/** 支付失败/超时补偿（T-05）：释放预占；订单保持 created（可重试），paymentStatus=failed */
export async function markPaymentFailed(orderNo: string, eventId: string | null, reason: string): Promise<void> {
  const tenantId = tid()
  const order = await ShopOrder.findOne({ where: { tenantId, orderNo } })
  if (!order || order.status !== 'created') return
  await order.update({ paymentStatus: 'failed' })
  await recordEvent(order.id, orderNo, 'created', 'created', 'webhook', reason, eventId)
  await releaseByRef(`order:${orderNo}`)
}

/** 取消订单：释放预占 + 关闭（T-12 币种切换处置承接） */
export async function cancelOrder(orderNo: string, reason: string, actor = 'system'): Promise<void> {
  const tenantId = tid()
  const order = await ShopOrder.findOne({ where: { tenantId, orderNo } })
  if (!order) return
  if (order.status === 'cancelled') return
  if (!canTransition(order.status, 'cancelled')) throw new AppError(409, 'ILLEGAL_TRANSITION')
  await order.update({ status: 'cancelled', closedAt: new Date(), cancelledReason: reason })
  await recordEvent(order.id, orderNo, order.status, 'cancelled', actor, reason, null)
  await releaseByRef(`order:${orderNo}`)
}

/** 订单访问（防枚举）：orderNo + accessToken 双要素；越权一律 404（T-10） */
export async function getOrderByToken(orderNo: string, token: string): Promise<Record<string, unknown>> {
  const tenantId = tid()
  const order = await ShopOrder.findOne({ where: { tenantId, orderNo, accessToken: token } })
  if (!order) throw new AppError(404, 'ORDER_NOT_FOUND')
  const items = await ShopOrderItem.findAll({ where: { tenantId, orderId: order.id } })
  const o = order.toJSON() as Record<string, unknown>
  return { ...o, items }
}

/** sweeper：关闭超时未支付订单（默认 30 分钟 TTL，T-05） */
export async function sweepTimeoutOrders(timeoutMinutes = 30): Promise<number> {
  const tenantId = tid()
  const cutoff = new Date(Date.now() - timeoutMinutes * 60_000)
  const stale = await ShopOrder.findAll({
    where: { tenantId, status: 'created', paymentStatus: { [Op.in]: ['none', 'failed'] }, createdAt: { [Op.lt]: cutoff } },
  })
  let n = 0
  for (const order of stale) {
    try {
      await cancelOrder(order.orderNo, 'payment_timeout', 'sweeper')
      n += 1
    } catch {
      // 已被并发关闭则跳过
    }
  }
  return n
}
