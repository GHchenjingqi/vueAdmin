// @vitest-environment node
/**
 * 核心资金链路不变量回归
 *
 * 对应 docs/reports/core-fund-integrity-audit.md：
 * 1. 券核销幂等必须核对券一致，同 orderNo 换券不得静默成功；
 * 2. 并发同券核销仍守恒（回归保护，不改变既有幂等语义）；
 * 3. 税率 0..1 契约 fail-closed，越界配置阻断报价；
 * 4. 退款死锁重试时外部通道最多调用一次，且不改变正常退款结果。
 *
 * 使用独立 tenantId + 唯一券码，与其余套件零共享行。
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { runInTenant } from '../modules/tenant/context.js'
import {
  ShopCoupon,
  ShopCouponRedemption,
  ShopTaxRate,
  ShopOrder,
  ShopOrderRefund,
} from '../modules/shop/models/index.js'
import * as couponService from '../modules/storefront/services/couponService.js'
import * as taxService from '../modules/storefront/services/taxService.js'
import * as refundService from '../modules/shop/services/refundService.js'

const TID = 987655
const inTenant = <T>(fn: () => Promise<T>): Promise<T> => runInTenant({ tenantId: TID }, fn)
const uniq = (): string => `fi${Date.now()}${Math.floor(Math.random() * 1e6)}`
const day = (offset: number): string => {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + offset)
  return d.toISOString().slice(0, 10)
}

async function mkCoupon(discountCents: number): Promise<ShopCoupon> {
  return ShopCoupon.create({
    code: 'FI' + uniq(),
    type: 'fixed',
    value: discountCents / 100,
    minSpend: 0,
    currency: 'USD',
    validFrom: day(-1),
    validTo: day(1),
    usageLimit: 0,
    usedCount: 0,
    tenantId: TID,
  } as never)
}

function evOf(c: ShopCoupon, discountCents: number) {
  return { couponId: c.id, couponCode: c.code, discountCents, currency: 'USD' }
}

async function clean(): Promise<void> {
  await inTenant(async () => {
    await ShopCouponRedemption.destroy({ where: { tenantId: TID } })
    await ShopCoupon.destroy({ where: { tenantId: TID } })
    await ShopTaxRate.destroy({ where: { tenantId: TID } })
    await ShopOrderRefund.destroy({ where: { tenantId: TID } })
    await ShopOrder.destroy({ where: { tenantId: TID } })
  })
}

beforeAll(clean)
afterAll(async () => {
  refundService.setRefundProvider(null)
  await clean()
})

describe('券核销幂等与对账口径', () => {
  it('同 orderNo 换券重放被拒绝，不静默视为幂等成功', async () => {
    await inTenant(async () => {
      const a = await mkCoupon(1000)
      const b = await mkCoupon(2000)
      const orderNo = 'FI-SWAP-' + uniq()
      await couponService.redeemCoupon(evOf(a, 1000), orderNo)

      await expect(couponService.redeemCoupon(evOf(b, 2000), orderNo)).rejects.toMatchObject({
        statusCode: 409,
        message: expect.stringContaining('COUPON_REDEMPTION_CONFLICT'),
      })

      const rows = await ShopCouponRedemption.findAll({ where: { tenantId: TID, orderNo } })
      expect(rows).toHaveLength(1)
      expect(Number(rows[0].couponId)).toBe(a.id)
      expect(Number((await ShopCoupon.findByPk(a.id))?.usedCount)).toBe(1)
      expect(Number((await ShopCoupon.findByPk(b.id))?.usedCount)).toBe(0)
    })
  })

  it('并发同 orderNo 使用不同券：不允许两个请求都成功', async () => {
    await inTenant(async () => {
      const a = await mkCoupon(1000)
      const b = await mkCoupon(2000)
      const orderNo = 'FI-RACE-' + uniq()
      const results = await Promise.allSettled([
        couponService.redeemCoupon(evOf(a, 1000), orderNo),
        couponService.redeemCoupon(evOf(b, 2000), orderNo),
      ])
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)

      const rows = await ShopCouponRedemption.findAll({ where: { tenantId: TID, orderNo } })
      expect(rows).toHaveLength(1)
      const winnerId = Number(rows[0].couponId)
      const winner = await ShopCoupon.findByPk(winnerId)
      const loser = await ShopCoupon.findByPk(winnerId === a.id ? b.id : a.id)
      expect(Number(winner?.usedCount)).toBe(1)
      expect(Number(loser?.usedCount)).toBe(0)
    })
  })

  it('同券幂等重放与并发核销仍守恒（回归保护）', async () => {
    await inTenant(async () => {
      const c = await mkCoupon(1000)
      const ev = evOf(c, 1000)
      const orderNo = 'FI-IDEM-' + uniq()
      const results = await Promise.allSettled(
        Array.from({ length: 8 }, () => couponService.redeemCoupon(ev, orderNo)),
      )
      expect(results.every((r) => r.status === 'fulfilled')).toBe(true)
      expect(await ShopCouponRedemption.count({ where: { tenantId: TID, orderNo } })).toBe(1)
      expect(Number((await ShopCoupon.findByPk(c.id))?.usedCount)).toBe(1)
    })
  })
})

describe('税率契约 fail-closed', () => {
  it('越界税率阻断报价，不产生 5 倍税费', async () => {
    await inTenant(async () => {
      await ShopTaxRate.create({
        tenantId: TID, country: 'XX', rate: 5, isDefault: false, priority: 99, active: true,
      } as never)
      await expect(
        taxService.resolveTax({ country: 'XX', subtotalCents: 10000, currency: 'USD' }),
      ).rejects.toMatchObject({ statusCode: 422, message: expect.stringContaining('TAX_RATE_INVALID') })
    })
  })

  it('合法边界税率 0 / 1 仍正常计算（回归保护）', async () => {
    await inTenant(async () => {
      await ShopTaxRate.create({
        tenantId: TID, country: 'ZZ', rate: 0, isDefault: false, priority: 99, active: true,
      } as never)
      await ShopTaxRate.create({
        tenantId: TID, country: 'YY', rate: 1, isDefault: false, priority: 99, active: true,
      } as never)
      const zero = await taxService.resolveTax({ country: 'ZZ', subtotalCents: 10000, currency: 'USD' })
      const full = await taxService.resolveTax({ country: 'YY', subtotalCents: 10000, currency: 'USD' })
      expect(zero.taxCents).toBe(0)
      expect(full.taxCents).toBe(10000)
    })
  })
})

describe('退款死锁重试的外部副作用', () => {
  async function paidOrder(): Promise<ShopOrder> {
    const orderNo = 'FI-RF-' + uniq()
    return ShopOrder.create({
      tenantId: TID,
      orderNo,
      channelId: 0,
      shopId: 0,
      buyer: { email: 'fi@example.com' },
      currency: 'USD',
      amount: 100,
      status: 'paid',
      paymentStatus: 'captured',
      email: 'fi@example.com',
      amountCents: 10000,
      subtotalCents: 10000,
      accessToken: 'tok_' + orderNo,
    } as never)
  }

  it('死锁回滚后重试：外部通道只调用一次，库里只落一条退款', async () => {
    await inTenant(async () => {
      const order = await paidOrder()
      let calls = 0
      refundService.setRefundProvider(async () => {
        calls++
        return { providerRef: 'probe-' + calls }
      })
      const deadlock = Object.assign(new Error('Deadlock found when trying to get lock'), {
        name: 'SequelizeDatabaseError',
      })
      const spy = vi.spyOn(ShopOrderRefund, 'create').mockRejectedValueOnce(deadlock as never)
      try {
        const view = await refundService.createRefund({
          orderId: order.id, amountCents: 1000, idempotencyKey: order.orderNo + '-idem',
        })
        expect(view.status).toBe('succeeded')
      } finally {
        spy.mockRestore()
        refundService.setRefundProvider(null)
      }
      expect(calls).toBe(1)
      const rows = await ShopOrderRefund.findAll({ where: { tenantId: TID, orderId: order.id } })
      expect(rows).toHaveLength(1)
      expect(Number(rows[0].amountCents)).toBe(1000)
      expect(String((await ShopOrder.findByPk(order.id))?.paymentStatus)).toBe('refunding')
    })
  })

  it('provider 失败整笔回滚，不重试、不落退款记录（回归保护）', async () => {
    await inTenant(async () => {
      const order = await paidOrder()
      let calls = 0
      refundService.setRefundProvider(() => {
        calls++
        throw new Error('gateway down')
      })
      try {
        await expect(refundService.createRefund({
          orderId: order.id, amountCents: 1000, idempotencyKey: order.orderNo + '-fail',
        })).rejects.toMatchObject({ statusCode: 502 })
      } finally {
        refundService.setRefundProvider(null)
      }
      expect(calls).toBe(1)
      expect(await ShopOrderRefund.count({ where: { tenantId: TID, orderId: order.id } })).toBe(0)
    })
  })
})
