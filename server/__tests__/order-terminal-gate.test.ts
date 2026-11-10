// @vitest-environment node
/**
 * 订单终态 ↔ 支付单据终态 联动实证（P0）
 *
 * 上一轮 payment-terminal-reconcile-audit.md §5.1 发现的高危缺口：
 * 对账关单释放了优惠券占用，却没把订单置为终态；而建会话只拦 captured、
 * 事件落地也不拒绝非结算态订单 → 用户可对同一订单重新发起支付，
 * 带着折扣快照成交却没有 coupon_redemptions 流水，限量券被无限复用。
 *
 * 期望行为（修复前跑红即为证据）：
 *  G1 对账关单（确实释放了订单级资源时）把订单落为 cancelled / failed 终态
 *  G2 终态订单不得再创建支付会话
 *  G3 终态订单不得被支付成功事件改单
 *  G4 已支付订单的残留单据被关单时，绝不能把订单置为终态
 *  G5 重试在途（同单另一张 initiated）时，不得把订单置为终态
 *  G6 同订单两张超时单据并发关单，券占用最终必须且只被回退一次
 *
 * 独立租户 987760，真实 MySQL；每例 beforeEach 清理。
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { runInTenant } from '../modules/tenant/context.js'
import {
  ShopOrder,
  ShopOrderPayment,
  ShopCoupon,
  ShopCouponRedemption,
  ShopInventory,
  ShopInventoryReservation,
} from '../modules/shop/models/index.js'
import * as paymentService from '../modules/storefront/services/paymentService.js'
import * as reconcile from '../modules/storefront/services/paymentReconcileService.js'

const TID = 987760
const inTenant = <T>(fn: () => Promise<T>): Promise<T> => runInTenant({ tenantId: TID }, fn)
const uniq = (): string => `gat${Date.now()}${Math.floor(Math.random() * 1e6)}`
const MIN = 60_000
const HOUR = 60 * MIN
const day = (offset: number): string => {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + offset)
  return d.toISOString().slice(0, 10)
}

async function seedOrder(paymentStatus = 'initiated', status = 'created'): Promise<{ orderNo: string; orderId: number }> {
  const orderNo = 'GAT-' + uniq()
  const order = await ShopOrder.create({
    tenantId: TID,
    orderNo,
    channelId: 0,
    shopId: 0,
    buyer: { email: 'gate@test.dev' },
    currency: 'USD',
    amount: 100,
    status,
    paymentStatus,
    email: 'gate@test.dev',
    amountCents: 10000,
    subtotalCents: 10000,
    discountCents: 1000,
    couponCode: 'GATE-Coupon',
    accessToken: 'tok_' + orderNo,
  } as never)
  return { orderNo, orderId: order.id }
}

async function seedPayment(orderNo: string, orderId: number, status = 'initiated', ageMs = 40 * MIN): Promise<string> {
  const providerRef = `pay_${uniq()}`
  const row = await ShopOrderPayment.create({
    tenantId: TID,
    orderId,
    orderNo,
    provider: 'mock',
    providerRef,
    sessionId: `sess_${uniq()}`,
    amountCents: 10000,
    currency: 'USD',
    status,
  } as never)
  await ShopOrderPayment.update({ createdAt: new Date(Date.now() - ageMs) } as never, { where: { id: row.id } } as never)
  return providerRef
}

async function seedCoupon(orderNo: string): Promise<number> {
  const coupon = await ShopCoupon.create({
    tenantId: TID,
    code: 'GC' + uniq(),
    type: 'fixed',
    value: 10,
    minSpend: 0,
    currency: 'USD',
    validFrom: day(-1),
    validTo: day(1),
    usageLimit: 3,
    usedCount: 1,
  } as never)
  await ShopCouponRedemption.create({
    tenantId: TID,
    couponId: coupon.id,
    couponCode: coupon.code,
    orderNo,
    discountCents: 1000,
    currency: 'USD',
  } as never)
  return coupon.id
}

async function seedReservation(orderNo: string): Promise<number> {
  const skuId = 906000 + Math.floor(Math.random() * 100000)
  await ShopInventory.create({ tenantId: TID, skuId, warehouseId: 1, quantity: 10, locked: 1 } as never)
  await ShopInventoryReservation.create({
    tenantId: TID,
    skuId,
    warehouseId: 1,
    qty: 1,
    status: 'active',
    ref: orderNo,
    expiresAt: new Date(Date.now() + HOUR),
  } as never)
  return skuId
}

async function clean(): Promise<void> {
  await ShopInventoryReservation.destroy({ where: { tenantId: TID } })
  await ShopInventory.destroy({ where: { tenantId: TID } })
  await ShopCouponRedemption.destroy({ where: { tenantId: TID } })
  await ShopCoupon.destroy({ where: { tenantId: TID } })
  await ShopOrderPayment.destroy({ where: { tenantId: TID } })
  await ShopOrder.destroy({ where: { tenantId: TID } })
}

beforeEach(clean)
afterAll(clean)

const orderOf = (orderNo: string) => ShopOrder.findOne({ where: { tenantId: TID, orderNo } })

describe('订单终态 ↔ 支付单据终态联动', () => {
  it('G1 对账关单释放订单资源时，订单必须落为 cancelled / failed 终态', async () => {
    await inTenant(async () => {
      const { orderNo, orderId } = await seedOrder()
      await seedCoupon(orderNo)
      await seedReservation(orderNo)
      await seedPayment(orderNo, orderId)

      const closed = await reconcile.reconcilePayments()
      expect(closed).toBeGreaterThanOrEqual(1)
      const order = await orderOf(orderNo)
      expect(order?.status).toBe('cancelled')
      expect(order?.paymentStatus).toBe('failed')
    })
  })

  it('G2 终态订单不得再创建支付会话（限量券绕过利用链的第一环）', async () => {
    await inTenant(async () => {
      const normal = await seedOrder()
      // 前置：正常订单可建会话，证明门禁不是被通道配置等因素误触发
      await expect(
        paymentService.createSession({} as never, normal.orderId, 'mock'),
      ).resolves.toMatchObject({ status: 'initiated' })

      const terminal = await seedOrder('failed', 'cancelled')
      await expect(
        paymentService.createSession({} as never, terminal.orderId, 'mock'),
      ).rejects.toThrow(/订单已关闭/)
    })
  })

  it('G3 终态订单不得被支付成功事件改单（利用链的第二环）', async () => {
    await inTenant(async () => {
      const { orderNo, orderId } = await seedOrder('failed', 'cancelled')
      await seedPayment(orderNo, orderId, 'initiated', 40 * MIN)

      const res = await paymentService.applyGatewayEvent('mock', {
        type: 'payment.succeeded',
        providerRef: `fresh_${uniq()}`,
        orderNo,
        raw: {},
      })
      expect(res.ok).toBe(false)
      const order = await orderOf(orderNo)
      expect(order?.paymentStatus).toBe('failed')
      expect(order?.status).toBe('cancelled')
    })
  })

  it('G4 已支付订单的残留单据被关单时，绝不能把订单置为终态', async () => {
    await inTenant(async () => {
      const { orderNo, orderId } = await seedOrder('captured', 'paid')
      const couponId = await seedCoupon(orderNo)
      await seedPayment(orderNo, orderId, 'captured')
      await seedPayment(orderNo, orderId, 'initiated')

      await reconcile.reconcilePayments()
      const order = await orderOf(orderNo)
      expect(order?.status).toBe('paid')
      expect(order?.paymentStatus).toBe('captured')
      expect(await ShopCouponRedemption.findOne({ where: { tenantId: TID, orderNo } })).not.toBeNull()
      expect(Number((await ShopCoupon.findByPk(couponId))?.usedCount)).toBe(1)
    })
  })

  it('G5 重试在途（同单另一张 initiated）时，不得把订单置为终态', async () => {
    await inTenant(async () => {
      const { orderNo, orderId } = await seedOrder('initiated')
      await seedCoupon(orderNo)
      await seedPayment(orderNo, orderId, 'initiated', 40 * MIN)
      await seedPayment(orderNo, orderId, 'initiated', 2 * MIN)

      await reconcile.reconcilePayments()
      const order = await orderOf(orderNo)
      expect(order?.status).toBe('created')
      expect(order?.paymentStatus).toBe('initiated')
      expect(await ShopCouponRedemption.findOne({ where: { tenantId: TID, orderNo } })).not.toBeNull()
    })
  })

  it('G6 同订单两张超时单据并发关单，券占用最终恰好回退一次', async () => {
    await inTenant(async () => {
      const { orderNo, orderId } = await seedOrder()
      const couponId = await seedCoupon(orderNo)
      await seedReservation(orderNo)
      await seedPayment(orderNo, orderId, 'initiated', 40 * MIN)
      await seedPayment(orderNo, orderId, 'initiated', 41 * MIN)

      await Promise.all([reconcile.reconcilePayments(), reconcile.reconcilePayments()])
      expect(await ShopCouponRedemption.findOne({ where: { tenantId: TID, orderNo } })).toBeNull()
      expect(Number((await ShopCoupon.findByPk(couponId))?.usedCount)).toBe(0)
      const pays = await ShopOrderPayment.findAll({ where: { tenantId: TID, orderNo } })
      expect(pays.every((p) => p.status === 'expired')).toBe(true)
      const order = await orderOf(orderNo)
      expect(order?.status).toBe('cancelled')
    })
  })
})
