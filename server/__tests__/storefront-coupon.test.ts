// @vitest-environment node
/**
 * T-07 优惠券门禁（P3-T07）实证
 *
 * 断言：过期 / 未生效 / 用尽 / 币种不符 / 未达最低消费一律服务端拒绝；
 *       折扣由服务端重算并封顶（忽略前端传入金额）；建单原子占用、幂等不重复占用、
 *       取消可回退、并发不超发。
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { runInTenant } from '../modules/tenant/context.js'
import * as categoryService from '../modules/shop/services/categoryService.js'
import * as brandService from '../modules/shop/services/brandService.js'
import * as spuService from '../modules/shop/services/spuService.js'
import * as skuService from '../modules/shop/services/skuService.js'
import * as priceService from '../modules/shop/services/priceService.js'
import * as warehouseService from '../modules/shop/services/warehouseService.js'
import * as inventoryService from '../modules/shop/services/inventoryService.js'
import { ShopCoupon, ShopCouponRedemption } from '../modules/shop/models/index.js'
import * as couponService from '../modules/storefront/services/couponService.js'
import * as quoteService from '../modules/storefront/services/quoteService.js'
import * as checkoutService from '../modules/storefront/services/checkoutService.js'
import type { StorefrontSite } from '../modules/storefront/middleware/siteContext.js'

const TID = 1
const uniq = (): string => `cp${Date.now()}${Math.floor(Math.random() * 1e6)}`
const day = (offset: number): string => {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + offset)
  return d.toISOString().slice(0, 10)
}

let skuId = 0
let site: StorefrontSite

const inTenant = <T>(fn: () => Promise<T>): Promise<T> => runInTenant({ tenantId: TID }, fn)

interface CouponOverrides {
  type?: 'fixed' | 'percent'
  value?: number
  minSpend?: number
  currency?: string
  validFrom?: string
  validTo?: string
  usageLimit?: number
}

async function createCoupon(overrides: CouponOverrides = {}): Promise<ShopCoupon> {
  return ShopCoupon.create({
    code: 'C' + uniq(),
    type: overrides.type ?? 'fixed',
    value: overrides.value ?? 10,
    minSpend: overrides.minSpend ?? 0,
    currency: overrides.currency ?? 'USD',
    validFrom: overrides.validFrom ?? day(-1),
    validTo: overrides.validTo ?? day(1),
    usageLimit: overrides.usageLimit ?? 0,
    usedCount: 0,
    tenantId: TID,
  } as never)
}

beforeAll(async () => {
  await inTenant(async () => {
    const category = await categoryService.createCategory({ parentId: 0, name: { 'en-US': 'CP Cat ' + uniq() }, level: 1, sort: 0 })
    const brand = await brandService.createBrand({ name: 'CP Brand ' + uniq() })
    const warehouse = await warehouseService.createWarehouse({ name: 'CP WH ' + uniq(), type: 'overseas', country: 'US' })
    const spu = await spuService.createSpu({
      categoryId: category.id,
      brandId: brand.id,
      name: { 'en-US': 'CP Wig ' + uniq(), 'zh-CN': '优惠券测试商品' },
      description: { 'en-US': 'coupon fixture' },
    })
    const sku = await skuService.createSku({ spuId: spu.id, code: 'CPSKU' + uniq(), spec: { color: '1B' } })
    skuId = sku.id
    await priceService.upsertPrice(sku.id, { currency: 'USD', amount: 100 })
    await inventoryService.adjust(sku.id, warehouse.id, 1000)
    site = { tenantId: TID, channelId: null, shopId: null, defaultCurrency: 'USD', defaultLocale: 'en-US' }
  })
})

describe('T-07 优惠券服务端校验', () => {
  it('券码不存在 → COUPON_NOT_FOUND', async () => {
    await inTenant(async () => {
      await expect(
        quoteService.createQuote(site, { items: [{ skuId, qty: 1 }], couponCode: 'NO-SUCH-' + uniq() }),
      ).rejects.toThrow(/COUPON_NOT_FOUND/)
    })
  })

  it('未生效 / 已过期 → COUPON_NOT_ACTIVE / COUPON_EXPIRED', async () => {
    await inTenant(async () => {
      const future = await createCoupon({ validFrom: day(2), validTo: day(5) })
      const expired = await createCoupon({ validFrom: day(-5), validTo: day(-1) })
      await expect(quoteService.createQuote(site, { items: [{ skuId, qty: 1 }], couponCode: future.code })).rejects.toThrow(/COUPON_NOT_ACTIVE/)
      await expect(quoteService.createQuote(site, { items: [{ skuId, qty: 1 }], couponCode: expired.code })).rejects.toThrow(/COUPON_EXPIRED/)
    })
  })

  it('币种不匹配 / 未达最低消费 → 拒绝', async () => {
    await inTenant(async () => {
      const eur = await createCoupon({ currency: 'EUR' })
      const high = await createCoupon({ minSpend: 99999 })
      await expect(quoteService.createQuote(site, { items: [{ skuId, qty: 1 }], couponCode: eur.code })).rejects.toThrow(/COUPON_CURRENCY_MISMATCH/)
      await expect(quoteService.createQuote(site, { items: [{ skuId, qty: 1 }], couponCode: high.code })).rejects.toThrow(/COUPON_MIN_SPEND_NOT_MET/)
    })
  })

  it('fixed 折扣由服务端重算，前端伪造金额被忽略', async () => {
    await inTenant(async () => {
      const coupon = await createCoupon({ value: 10 })
      const q = await quoteService.createQuote(site, {
        items: [{ skuId, qty: 1 }],
        couponCode: coupon.code,
        discountCents: 999999,
        amountCents: 1,
      } as never)
      expect(q.discountCents).toBe(1000)
      expect(q.couponCode).toBe(coupon.code)
      expect(q.amountCents).toBe(q.subtotalCents + q.shippingCents + q.taxCents - q.discountCents)
    })
  })

  it('percent 折扣按小计计算并四舍五入', async () => {
    await inTenant(async () => {
      const coupon = await createCoupon({ type: 'percent', value: 15 })
      const q = await quoteService.createQuote(site, { items: [{ skuId, qty: 2 }], couponCode: coupon.code })
      expect(q.discountCents).toBe(Math.round((q.subtotalCents * 15) / 100))
    })
  })

  it('折扣封顶不超过小计，应付金额不为负', async () => {
    await inTenant(async () => {
      const coupon = await createCoupon({ value: 99999 })
      const q = await quoteService.createQuote(site, { items: [{ skuId, qty: 1 }], couponCode: coupon.code })
      expect(q.discountCents).toBe(q.subtotalCents)
      expect(q.amountCents).toBe(q.shippingCents + q.taxCents)
    })
  })
})

describe('T-07 优惠券占用与状态', () => {
  it('用量上限为 1：首次建单占用后，再次报价报 COUPON_EXHAUSTED', async () => {
    await inTenant(async () => {
      const coupon = await createCoupon({ usageLimit: 1 })
      const order = await checkoutService.createOrder(site, { items: [{ skuId, qty: 1 }], couponCode: coupon.code })
      expect(order.couponCode).toBe(coupon.code)
      expect(order.discountCents).toBe(1000)
      expect(await ShopCouponRedemption.count({ where: { tenantId: TID, orderNo: order.orderNo } })).toBe(1)

      const fresh = await ShopCoupon.findByPk(coupon.id)
      expect(Number(fresh?.usedCount)).toBe(1)
      await expect(quoteService.createQuote(site, { items: [{ skuId, qty: 1 }], couponCode: coupon.code })).rejects.toThrow(/COUPON_EXHAUSTED/)
    })
  })

  it('幂等重放不重复占用（同 idempotencyKey 返回首单，用量仍为 1）', async () => {
    await inTenant(async () => {
      const coupon = await createCoupon({ usageLimit: 5 })
      const idem = 'CPIDEM-' + uniq()
      const first = await checkoutService.createOrder(site, { items: [{ skuId, qty: 1 }], couponCode: coupon.code, idempotencyKey: idem })
      const again = await checkoutService.createOrder(site, { items: [{ skuId, qty: 1 }], couponCode: coupon.code, idempotencyKey: idem })
      expect(again.id).toBe(first.id)
      expect(await ShopCouponRedemption.count({ where: { tenantId: TID, orderNo: first.orderNo } })).toBe(1)
      const fresh = await ShopCoupon.findByPk(coupon.id)
      expect(Number(fresh?.usedCount)).toBe(1)
    })
  })

  it('取消订单回退用量（usedCount -1、流水删除）', async () => {
    await inTenant(async () => {
      const coupon = await createCoupon({ usageLimit: 1 })
      const order = await checkoutService.createOrder(site, { items: [{ skuId, qty: 1 }], couponCode: coupon.code })
      await checkoutService.cancelOrder(order.id, order.accessToken as string)
      const fresh = await ShopCoupon.findByPk(coupon.id)
      expect(Number(fresh?.usedCount)).toBe(0)
      expect(await ShopCouponRedemption.count({ where: { tenantId: TID, orderNo: order.orderNo } })).toBe(0)
    })
  })

  it('并发占用限额券：只有一个成功，不超发', async () => {
    await inTenant(async () => {
      const coupon = await createCoupon({ usageLimit: 1 })
      const evaluation = await couponService.evaluateCoupon(coupon.code, { currency: 'USD', subtotalCents: 10000 })
      expect(evaluation).not.toBeNull()
      const results = await Promise.allSettled([
        couponService.redeemCoupon(evaluation!, 'CP-CON-A-' + uniq()),
        couponService.redeemCoupon(evaluation!, 'CP-CON-B-' + uniq()),
      ])
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
      const fresh = await ShopCoupon.findByPk(coupon.id)
      expect(Number(fresh?.usedCount)).toBe(1)
    })
  })
})
