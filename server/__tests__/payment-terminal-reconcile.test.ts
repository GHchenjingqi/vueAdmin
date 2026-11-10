// @vitest-environment node
/**
 * 支付单据终态扫描器（paymentReconcileService）实证审计
 *
 * 上一轮「订单关闭路径资源释放收口」只验证了「关闭动作本身会不会释放资源」，
 * 没有验证「谁来决定一笔支付单据已经终态、以及关单会不会误伤别人的资源」。
 * 本轮把 reconcilePayments / startPaymentReconcileScanner 单独拉出来并排验证。
 *
 * 期望行为（修复前跑红即为缺陷证据）：
 *  T1 已支付订单的残留 initiated 单据被关单时，不得回退已成交订单的优惠券占用
 *  T2 超过宽限期的 failed 单据被关单并回退券/库存，不再永久悬挂
 *  T3 用户已发起重试（同单另一张 initiated 单据在途）时，关闭旧单据不得回退券
 *  T4 进程级扫描器能驱动多个租户，而不是只跑 ambient tenant 1
 *  T5 长期查不到结果的单据不能占满单批名额，饿死本可关闭的单据
 *  T6 库存释放失败时不得把单据落成终态（否则永远没有下一轮重试）
 *
 * 独立租户 987750 / 987751，每例 beforeEach 清理；测试库为真实 MySQL。
 * 外部网关不做真实网络调用：paypal 的「查单返回空」由 gatewayRegistry 局部替身模拟。
 */
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import { runInTenant } from '../modules/tenant/context.js'
import {
  ShopOrder,
  ShopOrderPayment,
  ShopCoupon,
  ShopCouponRedemption,
  ShopInventory,
  ShopInventoryReservation,
} from '../modules/shop/models/index.js'
import * as reconcile from '../modules/storefront/services/paymentReconcileService.js'

const flags = vi.hoisted(() => ({ queryCapable: false, failRelease: false }))

// 让「网关有主动查单能力但查不到结果」成为可确定性复现的输入，避免真实网络调用
vi.mock('../modules/storefront/payments/gatewayRegistry.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../modules/storefront/payments/gatewayRegistry.js')>()
  return {
    ...actual,
    getGateway: (providerId: string) => {
      if (flags.queryCapable && providerId === 'paypal') {
        return { id: 'paypal', query: async () => null } as never
      }
      return actual.getGateway(providerId)
    },
  }
})

// T6：注入一次「库存释放失败」，观察单据是否被错误地落成终态
vi.mock('../modules/shop/services/reservationService.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../modules/shop/services/reservationService.js')>()
  return {
    ...actual,
    releaseReservation: (...args: Parameters<typeof actual.releaseReservation>) => {
      if (flags.failRelease) return Promise.reject(new Error('simulated inventory release failure'))
      return actual.releaseReservation(...args)
    },
  }
})

const TID = 987750
const TID2 = 987751
const inTenant = <T>(fn: () => Promise<T>): Promise<T> => runInTenant({ tenantId: TID }, fn)
const uniq = (): string => `trm${Date.now()}${Math.floor(Math.random() * 1e6)}`
const MIN = 60_000
const HOUR = 60 * MIN
const day = (offset: number): string => {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + offset)
  return d.toISOString().slice(0, 10)
}

interface PaymentOpts {
  orderNo: string
  orderId: number
  provider?: string
  status?: string
  ageMs?: number
  tenantId?: number
}

async function seedPayment(opts: PaymentOpts): Promise<string> {
  const providerRef = `pay_${uniq()}`
  const tId = opts.tenantId ?? TID
  const row = await ShopOrderPayment.create({
    tenantId: tId,
    orderId: opts.orderId,
    orderNo: opts.orderNo,
    provider: opts.provider ?? 'mock',
    providerRef,
    sessionId: `sess_${uniq()}`,
    amountCents: 10000,
    currency: 'USD',
    status: opts.status ?? 'initiated',
  } as never)
  if (opts.ageMs) {
    await ShopOrderPayment.update({ createdAt: new Date(Date.now() - opts.ageMs) } as never, {
      where: { id: row.id },
    } as never)
  }
  return providerRef
}

async function seedOrder(paymentStatus = 'initiated', tenantId = TID): Promise<{ orderNo: string; orderId: number }> {
  const orderNo = 'TRM-' + uniq()
  const order = await ShopOrder.create({
    tenantId,
    orderNo,
    channelId: 0,
    shopId: 0,
    buyer: { email: 'trm@test.dev' },
    currency: 'USD',
    amount: 100,
    status: paymentStatus === 'captured' ? 'paid' : 'created',
    paymentStatus,
    email: 'trm@test.dev',
    amountCents: 10000,
    subtotalCents: 10000,
    accessToken: 'tok_' + orderNo,
  } as never)
  return { orderNo, orderId: order.id }
}

async function seedCouponRedemption(orderNo: string, tenantId = TID): Promise<number> {
  const coupon = await ShopCoupon.create({
    tenantId,
    code: 'RC' + uniq(),
    type: 'fixed',
    value: 10,
    minSpend: 0,
    currency: 'USD',
    validFrom: day(-1),
    validTo: day(1),
    usageLimit: 5,
    usedCount: 1,
  } as never)
  await ShopCouponRedemption.create({
    tenantId,
    couponId: coupon.id,
    couponCode: coupon.code,
    orderNo,
    discountCents: 1000,
    currency: 'USD',
  } as never)
  return coupon.id
}

async function seedReservation(orderNo: string, tenantId = TID): Promise<number> {
  const skuId = 895000 + Math.floor(Math.random() * 100000)
  await ShopInventory.create({ tenantId, skuId, warehouseId: 1, quantity: 10, locked: 1 } as never)
  await ShopInventoryReservation.create({
    tenantId,
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
  for (const tId of [TID, TID2]) {
    await ShopInventoryReservation.destroy({ where: { tenantId: tId } })
    await ShopInventory.destroy({ where: { tenantId: tId } })
    await ShopCouponRedemption.destroy({ where: { tenantId: tId } })
    await ShopCoupon.destroy({ where: { tenantId: tId } })
    await ShopOrderPayment.destroy({ where: { tenantId: tId } })
    await ShopOrder.destroy({ where: { tenantId: tId } })
  }
}

beforeEach(async () => {
  flags.queryCapable = false
  flags.failRelease = false
  await clean()
})
afterAll(clean)

const redemptionOf = (orderNo: string) =>
  ShopCouponRedemption.findOne({ where: { tenantId: TID, orderNo } })

describe('支付单据终态扫描器（reconcilePayments / startPaymentReconcileScanner）', () => {
  it('T1 已支付订单的残留 initiated 单据被关单时，不得回退已成交订单的券占用', async () => {
    await inTenant(async () => {
      const { orderNo, orderId } = await seedOrder('captured')
      const couponId = await seedCouponRedemption(orderNo)
      await seedPayment({ orderNo, orderId, status: 'captured', ageMs: 40 * MIN })
      await seedPayment({ orderNo, orderId, status: 'initiated', ageMs: 40 * MIN })

      const closed = await reconcile.reconcilePayments()
      expect(closed).toBeGreaterThanOrEqual(1)
      expect(await redemptionOf(orderNo)).not.toBeNull()
      const coupon = await ShopCoupon.findByPk(couponId)
      expect(Number(coupon?.usedCount)).toBe(1)
    })
  })

  it('T2 超过宽限期的 failed 单据被关单并回退券与库存预占', async () => {
    await inTenant(async () => {
      const { orderNo, orderId } = await seedOrder('failed')
      const couponId = await seedCouponRedemption(orderNo)
      await seedReservation(orderNo)
      const ref = await seedPayment({ orderNo, orderId, status: 'failed', ageMs: 25 * HOUR })

      const closed = await reconcile.reconcilePayments()
      expect(closed).toBeGreaterThanOrEqual(1)
      const pay = await ShopOrderPayment.findOne({ where: { providerRef: ref } })
      expect(pay?.status).toBe('expired')
      expect(await redemptionOf(orderNo)).toBeNull()
      const coupon = await ShopCoupon.findByPk(couponId)
      expect(Number(coupon?.usedCount)).toBe(0)
      const resv = await ShopInventoryReservation.findOne({ where: { tenantId: TID, ref: orderNo } })
      expect(resv?.status).toBe('released')
    })
  })

  it('T3 用户已发起重试时，关闭旧的失败单据不得回退仍在途订单的券', async () => {
    await inTenant(async () => {
      const { orderNo, orderId } = await seedOrder('failed')
      const couponId = await seedCouponRedemption(orderNo)
      const staleRef = await seedPayment({ orderNo, orderId, status: 'failed', ageMs: 25 * HOUR })
      const retryRef = await seedPayment({ orderNo, orderId, status: 'initiated', ageMs: 2 * MIN })

      await reconcile.reconcilePayments()
      const stale = await ShopOrderPayment.findOne({ where: { providerRef: staleRef } })
      const retry = await ShopOrderPayment.findOne({ where: { providerRef: retryRef } })
      expect(stale?.status).toBe('expired')
      expect(retry?.status).toBe('initiated')
      expect(await redemptionOf(orderNo)).not.toBeNull()
      const coupon = await ShopCoupon.findByPk(couponId)
      expect(Number(coupon?.usedCount)).toBe(1)
    })
  })

  it('T4 进程级扫描器按租户驱动关单，而不是只跑 ambient tenant 1', async () => {
    const a = await seedOrder('initiated')
    const b = await seedOrder('initiated', TID2)
    const refA = await seedPayment({ ...a, ageMs: 40 * MIN })
    const refB = await seedPayment({ ...b, ageMs: 40 * MIN, tenantId: TID2 })

    const stop = reconcile.startPaymentReconcileScanner(20, [TID, TID2])
    try {
      const deadline = Date.now() + 4000
      while (Date.now() < deadline) {
        const pa = await ShopOrderPayment.findOne({ where: { providerRef: refA } })
        const pb = await ShopOrderPayment.findOne({ where: { providerRef: refB } })
        if (pa?.status === 'expired' && pb?.status === 'expired') break
        await new Promise((resolve) => setTimeout(resolve, 30))
      }
    } finally {
      stop()
    }
    const pa = await ShopOrderPayment.findOne({ where: { providerRef: refA } })
    const pb = await ShopOrderPayment.findOne({ where: { providerRef: refB } })
    expect(pa?.status).toBe('expired')
    expect(pb?.status).toBe('expired')
  })

  it('T5 查单长期无结果的单据不得占满单批名额，饿死本可关闭的单据', async () => {
    flags.queryCapable = true
    await inTenant(async () => {
      const aged = 40 * MIN
      const stuck = Array.from({ length: 60 }, (_, i) => ({
        tenantId: TID,
        orderId: 1,
        orderNo: `TRM-STUCK-${uniq()}-${i}`,
        provider: 'paypal',
        providerRef: `pay_stuck_${uniq()}_${i}`,
        sessionId: `sess_stuck_${uniq()}_${i}`,
        amountCents: 10000,
        currency: 'USD',
        status: 'initiated',
      }))
      await ShopOrderPayment.bulkCreate(stuck as never)
      const { orderNo, orderId } = await seedOrder()
      const closableRef = await seedPayment({ orderNo, orderId, provider: 'mock' })
      // 全部推到超时窗口内（但不满 24h 硬上限），并按 updatedAt 拉平以保证确定性
      await ShopOrderPayment.update({ createdAt: new Date(Date.now() - aged) } as never, {
        where: { tenantId: TID },
      } as never)

      await reconcile.reconcilePayments()
      await reconcile.reconcilePayments()
      const closable = await ShopOrderPayment.findOne({ where: { providerRef: closableRef } })
      expect(closable?.status).toBe('expired')
    })
  })

  it('T6 库存释放失败时不得把单据落成终态，下一轮扫描必须能重试', async () => {
    flags.failRelease = true
    await inTenant(async () => {
      const { orderNo, orderId } = await seedOrder()
      await seedReservation(orderNo)
      const ref = await seedPayment({ orderNo, orderId, ageMs: 40 * MIN })

      await reconcile.reconcilePayments()
      const afterFail = await ShopOrderPayment.findOne({ where: { providerRef: ref } })
      expect(afterFail?.status).toBe('initiated')

      flags.failRelease = false
      const retried = await reconcile.reconcilePayments()
      expect(retried).toBeGreaterThanOrEqual(1)
      const afterRetry = await ShopOrderPayment.findOne({ where: { providerRef: ref } })
      expect(afterRetry?.status).toBe('expired')
      const resv = await ShopInventoryReservation.findOne({ where: { tenantId: TID, ref: orderNo } })
      expect(resv?.status).toBe('released')
    })
  })
})
