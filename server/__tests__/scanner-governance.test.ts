// @vitest-environment node
/**
 * 未支付订单资源回收扫描器统一治理（P1-4）实证
 *
 * 测绘发现：releaseExpiredReservations() 在全仓库只有测试调用，app.ts 从未注册
 * 任何定时器 → TTL 到期的库存预占与券占用在生产永远不会被释放。
 * 历轮报告却一直把 sweeper 当成「已在运行的关闭路径」来讨论，属于治理盲区。
 *
 * 期望行为（修复前跑红即为证据）：
 *  S1 进程级扫描器能驱动过期预占回收，库存与券占用一并回退
 *  S2 两个租户的过期预占都被驱动（不是只跑 tenant 1）
 *  S3 动态租户枚举覆盖「只有预占、没有支付单据」的租户
 *  S4 对账子任务失败时，同租户的预占回收仍要执行（失败隔离）
 *
 * 独立租户 987770 / 987771，真实 MySQL；扫描器一律 try/finally 确定性停止。
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { runInTenant } from '../modules/tenant/context.js'
import {
  ShopInventory,
  ShopInventoryReservation,
  ShopCoupon,
  ShopCouponRedemption,
} from '../modules/shop/models/index.js'
import * as reconcile from '../modules/storefront/services/paymentReconcileService.js'

const TID = 987770
const TID2 = 987771
const uniq = (): string => `scn${Date.now()}${Math.floor(Math.random() * 1e6)}`
const day = (offset: number): string => {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + offset)
  return d.toISOString().slice(0, 10)
}

/** 造一个「已过期的 active 预占 + 券核销」，不创建任何支付单据 */
async function seedExpiredReservation(tenantId: number): Promise<{ ref: string; skuId: number; couponId: number }> {
  const ref = 'SCN-' + uniq()
  const skuId = 917000 + Math.floor(Math.random() * 100000)
  await ShopInventory.create({ tenantId, skuId, warehouseId: 1, quantity: 10, locked: 1 } as never)
  await ShopInventoryReservation.create({
    tenantId,
    skuId,
    warehouseId: 1,
    qty: 1,
    status: 'active',
    ref,
    expiresAt: new Date(Date.now() - 60_000),
  } as never)
  const coupon = await ShopCoupon.create({
    tenantId,
    code: 'SC' + uniq(),
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
    tenantId,
    couponId: coupon.id,
    couponCode: coupon.code,
    orderNo: ref,
    discountCents: 1000,
    currency: 'USD',
  } as never)
  return { ref, skuId, couponId: coupon.id }
}

async function clean(): Promise<void> {
  for (const tId of [TID, TID2]) {
    await ShopCouponRedemption.destroy({ where: { tenantId: tId } })
    await ShopCoupon.destroy({ where: { tenantId: tId } })
    await ShopInventoryReservation.destroy({ where: { tenantId: tId } })
    await ShopInventory.destroy({ where: { tenantId: tId } })
  }
}

beforeEach(clean)
afterAll(clean)

const resvOf = (tenantId: number, ref: string) =>
  ShopInventoryReservation.findOne({ where: { tenantId, ref } })

/** 轮询等待扫描器生效，避免固定 sleep 造成 flake */
async function waitFor(predicate: () => Promise<boolean>, timeoutMs = 4000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await predicate()) return true
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  return false
}

describe('未支付订单资源回收扫描器', () => {
  it('S1 进程级扫描器驱动过期预占回收：库存预占与券占用一并回退', async () => {
    const { ref, couponId } = await seedExpiredReservation(TID)
    const stop = reconcile.startPaymentReconcileScanner(20, [TID])
    try {
      expect(
        await waitFor(async () =>
          (await resvOf(TID, ref))?.status === 'released' &&
          (await ShopCouponRedemption.findOne({ where: { tenantId: TID, orderNo: ref } })) === null,
        ),
      ).toBe(true)
    } finally {
      await stop()
    }
    expect((await resvOf(TID, ref))?.status).toBe('released')
    expect(await ShopCouponRedemption.findOne({ where: { tenantId: TID, orderNo: ref } })).toBeNull()
    expect(Number((await ShopCoupon.findByPk(couponId))?.usedCount)).toBe(0)
  })

  it('S2 两个租户的过期预占都被驱动，而不是只跑 tenant 1', async () => {
    const a = await seedExpiredReservation(TID)
    const b = await seedExpiredReservation(TID2)
    const stop = reconcile.startPaymentReconcileScanner(20, [TID, TID2])
    try {
      expect(
        await waitFor(async () =>
          (await resvOf(TID, a.ref))?.status === 'released' &&
          (await resvOf(TID2, b.ref))?.status === 'released' &&
          (await ShopCouponRedemption.findOne({ where: { tenantId: TID, orderNo: a.ref } })) === null &&
          (await ShopCouponRedemption.findOne({ where: { tenantId: TID2, orderNo: b.ref } })) === null,
        ),
      ).toBe(true)
    } finally {
      await stop()
    }
    expect((await resvOf(TID, a.ref))?.status).toBe('released')
    expect((await resvOf(TID2, b.ref))?.status).toBe('released')
  })

  it('S3 动态租户枚举必须覆盖「只有预占、没有支付单据」的租户', async () => {
    await seedExpiredReservation(TID)
    await seedExpiredReservation(TID2)
    const ids = await reconcile.pendingResourceTenantIds()
    expect(ids).toContain(TID)
    expect(ids).toContain(TID2)
  })

  it('S4 同租户的对账关单与预占回收互不阻塞，两件事都要做到', async () => {
    const { ref } = await seedExpiredReservation(TID)
    const { ShopOrderPayment } = await import('../modules/shop/models/index.js')
    const row = await ShopOrderPayment.create({
      tenantId: TID,
      orderId: 1,
      orderNo: 'SCN-BOTH-' + uniq(),
      provider: 'mock',
      providerRef: `pay_both_${uniq()}`,
      sessionId: `sess_both_${uniq()}`,
      amountCents: 10000,
      currency: 'USD',
      status: 'initiated',
    } as never)
    await ShopOrderPayment.update({ createdAt: new Date(Date.now() - 40 * 60_000) } as never, {
      where: { id: row.id },
    } as never)
    const stop = reconcile.startPaymentReconcileScanner(20, [TID])
    try {
      expect(await waitFor(async () => (await resvOf(TID, ref))?.status === 'released')).toBe(true)
    } finally {
      await stop()
    }
    const pay = await ShopOrderPayment.findByPk(row.id)
    expect(pay?.status).toBe('expired')
    expect((await resvOf(TID, ref))?.status).toBe('released')
    await ShopOrderPayment.destroy({ where: { tenantId: TID } })
  })
})
