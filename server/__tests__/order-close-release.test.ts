// @vitest-environment node
/**
 * 订单关闭路径的资源释放收口实证
 *
 * 前台 checkoutService.cancelOrder 一次性释放「库存预占 + 优惠券占用 + 订单状态」，
 * 但后台取消 / 对账关单 / TTL sweeper 是三套独立实现，历轮从未并排验证。
 *
 * 期望行为（修复前跑红即为缺陷证据）：
 *  E1 后台 orderService.cancel 释放优惠券占用（流水删除、usedCount 回退）
 *  E2 后台取消把预占记录标记为 released，sweeper 不会二次释放同一笔库存
 *  E3 paymentReconcileService 关单释放优惠券占用
 *  E4 releaseExpiredReservations 到期释放时释放优惠券占用
 *
 * 使用独立租户 987730 + 每例独立 SKU/券码，与并行方 dev 数据及既有测试零共享。
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { runInTenant } from '../modules/tenant/context.js'
import {
  ShopOrder,
  ShopOrderItem,
  ShopOrderPayment,
  ShopCoupon,
  ShopCouponRedemption,
  ShopInventory,
  ShopInventoryReservation,
} from '../modules/shop/models/index.js'
import * as orderService from '../modules/shop/services/orderService.js'
import * as reservationService from '../modules/shop/services/reservationService.js'
import * as paymentReconcileService from '../modules/storefront/services/paymentReconcileService.js'
import * as couponService from '../modules/storefront/services/couponService.js'

const TID = 987730
const uniq = (): string => `cls${Date.now()}${Math.floor(Math.random() * 1e6)}`
const inTenant = <T>(fn: () => Promise<T>): Promise<T> => runInTenant({ tenantId: TID }, fn)
const day = (offset: number): string => {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + offset)
  return d.toISOString().slice(0, 10)
}

interface Fixture {
  orderId: number
  orderNo: string
  skuId: number
  couponId: number
}

/** 造一笔「已建单、有预占、有券核销」的待关闭订单 */
async function seed(expiresAt: Date = new Date(Date.now() - 60_000)): Promise<Fixture> {
  const tag = uniq()
  const orderNo = 'CLS-' + tag
  const skuId = 880000 + Math.floor(Math.random() * 100000)

  // locked=2：1 属于本单，另 1 属于同 SKU 的其它在途订单，用来观察重复释放
  await ShopInventory.create({ tenantId: TID, skuId, warehouseId: 1, quantity: 10, locked: 2 } as never)
  const order = await ShopOrder.create({
    tenantId: TID,
    orderNo,
    channelId: 0,
    shopId: 0,
    buyer: { email: 'close@test.dev' },
    currency: 'USD',
    amount: 100,
    status: 'created',
    email: 'close@test.dev',
    amountCents: 10000,
  } as never)
  await ShopOrderItem.create({ tenantId: TID, orderId: order.id, skuId, qty: 1, price: 100 } as never)
  await ShopInventoryReservation.create({
    tenantId: TID,
    skuId,
    warehouseId: 1,
    qty: 1,
    status: 'active',
    ref: orderNo,
    expiresAt,
  } as never)

  const coupon = await ShopCoupon.create({
    tenantId: TID,
    code: 'C' + tag,
    type: 'fixed',
    value: 10,
    minSpend: 0,
    currency: 'USD',
    validFrom: day(-1),
    validTo: day(1),
    usageLimit: 1,
    usedCount: 0,
  } as never)
  const ev = await couponService.evaluateCoupon(coupon.code, { currency: 'USD', subtotalCents: 10000 })
  await couponService.redeemCoupon(ev!, orderNo)

  return { orderId: order.id, orderNo, skuId, couponId: coupon.id }
}

const redemptionOf = (orderNo: string) =>
  ShopCouponRedemption.findOne({ where: { tenantId: TID, orderNo } })
const usedCountOf = async (couponId: number): Promise<number> => {
  const c = await ShopCoupon.findByPk(couponId)
  return Number(c?.usedCount ?? -1)
}
const lockedOf = async (skuId: number): Promise<number> => {
  const inv = await ShopInventory.findOne({ where: { tenantId: TID, skuId } })
  return Number(inv?.locked ?? -1)
}

beforeEach(async () => {
  // 只清本租户的预占/支付会话残留，避免 sweeper 扫到上一例的过期记录
  await ShopInventoryReservation.destroy({ where: { tenantId: TID } })
  await ShopOrderPayment.destroy({ where: { tenantId: TID } })
})

afterAll(() => {
  delete process.env.PAYMENT_RECONCILE_TIMEOUT_MS
})

describe('订单关闭路径的资源释放', () => {
  it('E1 后台取消订单释放券占用（流水删除 + usedCount 回退）', async () => {
    await inTenant(async () => {
      const f = await seed()
      expect(await redemptionOf(f.orderNo)).not.toBeNull()

      await orderService.cancel(f.orderId)

      expect(await redemptionOf(f.orderNo)).toBeNull()
      expect(await usedCountOf(f.couponId)).toBe(0)
    })
  })

  it('E2 后台取消把预占记录标记为 released', async () => {
    await inTenant(async () => {
      const f = await seed()
      await orderService.cancel(f.orderId)
      const res = await ShopInventoryReservation.findOne({ where: { tenantId: TID, ref: f.orderNo } })
      expect(res?.status).toBe('released')
    })
  })

  it('E2b sweeper 不会二次释放后台已取消订单的库存', async () => {
    await inTenant(async () => {
      const f = await seed() // 预占已过期，sweeper 会扫到
      await orderService.cancel(f.orderId)
      // 本单释放 1，另一笔在途占用必须保留
      expect(await lockedOf(f.skuId)).toBe(1)

      await reservationService.releaseExpiredReservations()
      expect(await lockedOf(f.skuId)).toBe(1)
    })
  })

  it('E3 对账关单释放券占用', async () => {
    await inTenant(async () => {
      const f = await seed()
      await ShopOrderPayment.create({
        tenantId: TID,
        orderId: f.orderId,
        orderNo: f.orderNo,
        provider: 'mock', // mock 网关无 query()，对账直接走关单分支
        providerRef: 'pr-' + uniq(),
        sessionId: 'sess-' + uniq(),
        amountCents: 10000,
        currency: 'USD',
        status: 'initiated',
        createdAt: new Date(Date.now() - 60 * 60 * 1000),
      } as never)
      process.env.PAYMENT_RECONCILE_TIMEOUT_MS = '1'

      const closed = await paymentReconcileService.reconcilePayments()
      expect(closed).toBeGreaterThan(0)
      expect(await redemptionOf(f.orderNo)).toBeNull()
      expect(await usedCountOf(f.couponId)).toBe(0)
    })
  })

  it('E4 TTL sweeper 释放过期预占时同步释放券占用', async () => {
    await inTenant(async () => {
      const f = await seed()
      const released = await reservationService.releaseExpiredReservations()
      expect(released).toBeGreaterThan(0)

      expect(await redemptionOf(f.orderNo)).toBeNull()
      expect(await usedCountOf(f.couponId)).toBe(0)
    })
  })
})
