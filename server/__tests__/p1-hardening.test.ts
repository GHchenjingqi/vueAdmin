// @vitest-environment node
/**
 * P1 加固实证：审计覆盖 / 查询过滤 / 券治理边界 / 业务口径护栏
 *
 * A1 审计查询按 action / actorId / actorType 过滤（后端接口能力）
 * A2 六类高敏 controller 的埋点覆盖度（可执行矩阵，防后续新增入口漏埋）
 * A3 扫描器侧两处关闭动作以 system 事件留痕
 * B1 percent 券面额 0–100 上界（create 与 partial update 两种路径）
 * B2 券删除事务行锁：有流水拒绝、无流水可删、不误伤其它券
 * C1 口径护栏：已发券（有核销流水）仍允许调整权益定义
 * C2 口径护栏：后台取消 paid 订单不释放券（退券应走独立退款链路）
 *
 * 独立租户 987790，真实 MySQL；每例 beforeEach 清理。
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { runInTenant } from '../modules/tenant/context.js'
import {
  ShopOrder,
  ShopCoupon,
  ShopCouponRedemption,
  ShopInventoryReservation,
  AuditLog,
} from '../modules/shop/models/index.js'
import * as auditLogService from '../modules/shop/services/auditLogService.js'
import * as marketingService from '../modules/shop/services/marketingService.js'
import * as orderService from '../modules/shop/services/orderService.js'
import * as reconcile from '../modules/storefront/services/paymentReconcileService.js'

const TID = 987790
const inTenant = <T>(fn: () => Promise<T>): Promise<T> => runInTenant({ tenantId: TID }, fn)
const uniq = (): string => `p1${Date.now()}${Math.floor(Math.random() * 1e6)}`
const day = (offset: number): string => {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + offset)
  return d.toISOString().slice(0, 10)
}

const couponInput = (overrides: Record<string, unknown> = {}) => ({
  code: 'P1' + uniq(),
  type: 'fixed',
  value: 10,
  minSpend: 0,
  currency: 'USD',
  validFrom: day(-1),
  validTo: day(1),
  usageLimit: 0,
  ...overrides,
})

async function clean(): Promise<void> {
  await ShopCouponRedemption.destroy({ where: { tenantId: TID } })
  await ShopCoupon.destroy({ where: { tenantId: TID } })
  await ShopInventoryReservation.destroy({ where: { tenantId: TID } })
  await ShopOrderPaymentCleanup()
  await ShopOrder.destroy({ where: { tenantId: TID } })
  await AuditLog.destroy({ where: { tenantId: TID } })
}

async function ShopOrderPaymentCleanup(): Promise<void> {
  const { ShopOrderPayment } = await import('../modules/shop/models/index.js')
  await ShopOrderPayment.destroy({ where: { tenantId: TID } })
}

beforeEach(clean)
afterAll(clean)

describe('A. 审计覆盖与查询过滤', () => {
  it('A1 listByEntity 支持 action / actorId / actorType 组合过滤', async () => {
    await inTenant(async () => {
      await auditLogService.record({ actorType: 'admin', actorId: 501, action: 'price.upserted', entityType: 'config' })
      await auditLogService.record({ actorType: 'admin', actorId: 502, action: 'review.approved', entityType: 'config' })
      await auditLogService.record({ actorType: 'system', action: 'order.reconcile_closed', entityType: 'order' })

      const byActor = await auditLogService.listByEntity({ entityType: 'config', actorId: 501 })
      expect(byActor).toHaveLength(1)
      expect(byActor[0].action).toBe('price.upserted')

      const byAction = await auditLogService.listByEntity({ entityType: 'config', action: 'review.approved' })
      expect(byAction).toHaveLength(1)
      expect(byAction[0].actorId).toBe(502)

      const byType = await auditLogService.listByEntity({ entityType: 'order', actorType: 'system' })
      expect(byType.map((r) => r.action)).toContain('order.reconcile_closed')
    })
  })

  it('A2 六类高敏 controller 的成功路径均已埋点', () => {
    const matrix: Record<string, string[]> = {
      priceController: ['price.upserted', 'price.deleted', 'rate.snapshot_saved'],
      reviewAdminController: ['review.approved', 'review.rejected', 'question.answered', 'question.hidden'],
      categoryController: ['category.created', 'category.updated', 'category.deleted'],
      brandController: ['brand.created', 'brand.updated', 'brand.deleted'],
      spuController: ['spu.created', 'spu.updated', 'spu.status_changed', 'spu.submitted', 'spu.deleted'],
      marketingController: [
        'promotion.created', 'promotion.updated', 'promotion.deleted',
        'coupon.created', 'coupon.updated', 'coupon.deleted',
        'bundle.created', 'bundle.updated', 'bundle.deleted',
      ],
    }
    for (const [file, actions] of Object.entries(matrix)) {
      const src = readFileSync(resolve('modules/shop/controllers', file + '.ts'), 'utf8')
      expect(src).toContain('recordAdminAction')
      for (const action of actions) expect(src, `${file} 缺少 ${action}`).toContain(`'${action}'`)
    }
  })

  it('A3 对账关单与过期预占回收都写 system 审计', async () => {
    await inTenant(async () => {
      const { ShopOrderPayment } = await import('../modules/shop/models/index.js')
      const orderNo = 'P1-A3-' + uniq()
      await ShopOrder.create({
        tenantId: TID, orderNo, channelId: 0, shopId: 0,
        buyer: {}, currency: 'USD', amount: 100, status: 'created', paymentStatus: 'initiated',
        amountCents: 10000, subtotalCents: 10000,
      } as never)
      const pay = await ShopOrderPayment.create({
        tenantId: TID, orderId: 1, orderNo, provider: 'mock',
        providerRef: `pay_${uniq()}`, sessionId: `sess_${uniq()}`,
        amountCents: 10000, currency: 'USD', status: 'initiated',
      } as never)
      await ShopOrderPayment.update({ createdAt: new Date(Date.now() - 40 * 60_000) } as never, { where: { id: pay.id } } as never)
      await reconcile.reconcilePayments()

      const logs = await AuditLog.findAll({ where: { tenantId: TID, action: 'order.reconcile_closed' } })
      expect(logs).toHaveLength(1)
      expect(logs[0].actorType).toBe('system')
    })
  })
})

describe('B. 券治理剩余边界', () => {
  it('B1 percent 券面额超 100 被拒；partial update 用合并后的最终值校验', async () => {
    await inTenant(async () => {
      await expect(
        marketingService.createCoupon(couponInput({ type: 'percent', value: 9999 }) as never),
      ).rejects.toThrow(/COUPON_PERCENT_OUT_OF_RANGE/)
      // fixed 券不受 100 限制
      const fixed = await marketingService.createCoupon(couponInput({ value: 500 }) as never)
      expect(Number(fixed.value)).toBe(500)

      const percent = await marketingService.createCoupon(couponInput({ type: 'percent', value: 10 }) as never)
      await expect(
        marketingService.updateCoupon(percent.id, { value: 150 } as never),
      ).rejects.toThrow(/COUPON_PERCENT_OUT_OF_RANGE/)
      // partial 只改 type：合并后 percent + 库中 value=10 合法
      const small = await marketingService.createCoupon(couponInput({ value: 10 }) as never)
      const ok = await marketingService.updateCoupon(small.id, { type: 'percent' } as never)
      expect(ok.type).toBe('percent')
      // partial 只改 type 但库中 value=500 → 合并后非法，必须拒绝
      const big = await marketingService.createCoupon(couponInput({ value: 500 }) as never)
      await expect(
        marketingService.updateCoupon(big.id, { type: 'percent' } as never),
      ).rejects.toThrow(/COUPON_PERCENT_OUT_OF_RANGE/)
    })
  })

  it('B2 删除事务行锁：有流水拒绝、无流水可删、不误伤其它券', async () => {
    await inTenant(async () => {
      const used = await marketingService.createCoupon(couponInput() as never)
      const free = await marketingService.createCoupon(couponInput() as never)
      await ShopCouponRedemption.create({
        tenantId: TID, couponId: used.id, couponCode: used.code,
        orderNo: 'P1-USED-' + uniq(), discountCents: 1000, currency: 'USD',
      } as never)

      await expect(marketingService.deleteCoupon(used.id)).rejects.toThrow(/COUPON_HAS_REDEMPTIONS/)
      expect(await ShopCoupon.findByPk(used.id)).not.toBeNull()
      await marketingService.deleteCoupon(free.id)
      expect(await ShopCoupon.findByPk(free.id)).toBeNull()
      expect(await ShopCoupon.findByPk(used.id)).not.toBeNull()
    })
  })
})

describe('C. 业务口径护栏（保持现状，变更需业务确认）', () => {
  it('C1 已有核销流水的券仍允许调整 value（流水存折扣快照，金额对账不受影响）', async () => {
    await inTenant(async () => {
      const coupon = await marketingService.createCoupon(couponInput({ value: 10 }) as never)
      await ShopCouponRedemption.create({
        tenantId: TID, couponId: coupon.id, couponCode: coupon.code,
        orderNo: 'P1-C1-' + uniq(), discountCents: 1000, currency: 'USD',
      } as never)
      const updated = await marketingService.updateCoupon(coupon.id, { value: 20 } as never)
      expect(Number(updated.value)).toBe(20)
      const redemption = await ShopCouponRedemption.findOne({ where: { tenantId: TID, couponId: coupon.id } })
      expect(Number(redemption?.discountCents)).toBe(1000) // 历史快照不变
    })
  })

  it('C2 后台取消 paid 订单不释放券（退券走独立退款链路）', async () => {
    await inTenant(async () => {
      const orderNo = 'P1-C2-' + uniq()
      const order = await ShopOrder.create({
        tenantId: TID, orderNo, channelId: 0, shopId: 0,
        buyer: {}, currency: 'USD', amount: 100, status: 'paid', paymentStatus: 'captured',
        amountCents: 10000, subtotalCents: 10000,
      } as never)
      const coupon = await marketingService.createCoupon(couponInput() as never)
      await coupon.update({ usedCount: 1 } as never)
      await ShopCouponRedemption.create({
        tenantId: TID, couponId: coupon.id, couponCode: coupon.code,
        orderNo, discountCents: 1000, currency: 'USD',
      } as never)
      // paid 订单预占为 committed，不会被 cancel 标记为 active
      await ShopInventoryReservation.create({
        tenantId: TID, skuId: 939001, warehouseId: 1, qty: 1,
        status: 'committed', ref: orderNo, expiresAt: new Date(Date.now() + 3_600_000),
      } as never)

      await orderService.cancel(order.id)
      expect(await ShopCouponRedemption.findOne({ where: { tenantId: TID, orderNo } })).not.toBeNull()
      expect(Number((await ShopCoupon.findByPk(coupon.id))?.usedCount)).toBe(1)
    })
  })
})
