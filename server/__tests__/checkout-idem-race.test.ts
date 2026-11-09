// @vitest-environment node
/**
 * 建单幂等并发竞态实证（checkoutService.createOrder）
 *
 * 背景：`findOne(idempotencyKey)` 与 `ShopOrder.create` 非原子；券核销与库存预占
 * 都以「每次新生成的 orderNo」为幂等键。并发提交同一 idempotencyKey 时，
 * 两个请求会各自占用一次券与库存，随后一个 create 撞 uq_orders_idempotency_key
 * 抛错且占位不回滚 → 券用量虚高、库存被孤儿占用、请求 500。
 *
 * 断言：并发两请求都应返回首单，且券核销 / usedCount / active 预占 / 库存扣减
 * 都只发生一次。专属租户 987693，避免与既有并发用例共用库存。
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
import {
  ShopCoupon,
  ShopCouponRedemption,
  ShopInventoryReservation,
  ShopOrder,
} from '../modules/shop/models/index.js'
import * as checkoutService from '../modules/storefront/services/checkoutService.js'
import type { StorefrontSite } from '../modules/storefront/middleware/siteContext.js'

const TID = 987693
const uniq = (): string => `ir${Date.now()}${Math.floor(Math.random() * 1e6)}`
const inTenant = <T>(fn: () => Promise<T>): Promise<T> => runInTenant({ tenantId: TID }, fn)
const day = (offset: number): string => {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + offset)
  return d.toISOString().slice(0, 10)
}

let skuId = 0
let site: StorefrontSite

async function makeCoupon(): Promise<ShopCoupon> {
  return ShopCoupon.create({
    code: 'IR' + uniq(),
    type: 'fixed',
    value: 10,
    minSpend: 0,
    currency: 'USD',
    validFrom: day(-1),
    validTo: day(1),
    usageLimit: 0,
    usedCount: 0,
    tenantId: TID,
  } as never)
}

beforeAll(async () => {
  await inTenant(async () => {
    const category = await categoryService.createCategory({
      parentId: 0, name: { 'en-US': 'IR Cat ' + uniq() }, level: 1, sort: 0,
    })
    const brand = await brandService.createBrand({ name: 'IR Brand ' + uniq() })
    const warehouse = await warehouseService.createWarehouse({
      name: 'IR WH ' + uniq(), type: 'overseas', country: 'US',
    })
    const spu = await spuService.createSpu({
      categoryId: category.id,
      brandId: brand.id,
      name: { 'en-US': 'IR Wig ' + uniq() },
      description: { 'en-US': 'checkout idem race fixture' },
    })
    const sku = await skuService.createSku({
      spuId: spu.id, code: 'IRSKU' + uniq(), spec: { color: '1B' },
    })
    skuId = sku.id
    await priceService.upsertPrice(sku.id, { currency: 'USD', amount: 100 })
    await inventoryService.adjust(sku.id, warehouse.id, 100)
    site = {
      tenantId: TID, channelId: null, shopId: null,
      defaultCurrency: 'USD', defaultLocale: 'en-US',
    }
  })
})

describe('建单幂等并发竞态（checkoutService）', () => {
  it('带券并发同 idempotencyKey：均返回首单，券/预占/库存只占一次', async () => {
    await inTenant(async () => {
      const coupon = await makeCoupon()
      const idem = 'IRIDEM-C-' + uniq()
      const availableBefore = await inventoryService.available(skuId)
      const activeBefore = await ShopInventoryReservation.count({
        where: { tenantId: TID, skuId, status: 'active' },
      })

      const results = await Promise.allSettled([
        checkoutService.createOrder(site, {
          items: [{ skuId, qty: 1 }], couponCode: coupon.code, idempotencyKey: idem,
        }),
        checkoutService.createOrder(site, {
          items: [{ skuId, qty: 1 }], couponCode: coupon.code, idempotencyKey: idem,
        }),
      ])

      const fulfilled = results.filter((r) => r.status === 'fulfilled')
      const first = fulfilled[0]?.status === 'fulfilled' ? fulfilled[0].value : null
      const snapshot = {
        orders: await ShopOrder.count({ where: { tenantId: TID, idempotencyKey: idem } }),
        fulfilled: fulfilled.length,
        rejected: results.filter((r) => r.status === 'rejected').length,
        sameOrder: fulfilled.length === 2 && fulfilled.every(
          (r) => r.status === 'fulfilled' && first !== null && r.value.id === first.id,
        ),
        redemptions: await ShopCouponRedemption.count({ where: { tenantId: TID, couponId: coupon.id } }),
        usedCount: Number((await ShopCoupon.findByPk(coupon.id))?.usedCount),
        activeReservations: await ShopInventoryReservation.count({
          where: { tenantId: TID, skuId, status: 'active' },
        }) - activeBefore,
        available: await inventoryService.available(skuId),
        rejectReason: results
          .filter((r) => r.status === 'rejected')
          .map((r) => String((r as PromiseRejectedResult).reason).slice(0, 120))
          .join(' | '),
      }

      expect(snapshot).toEqual({
        orders: 1,
        fulfilled: 2,
        rejected: 0,
        sameOrder: true,
        redemptions: 1,
        usedCount: 1,
        activeReservations: 1,
        available: availableBefore - 1,
        rejectReason: '',
      })
    })
  })

  it('无券并发同 idempotencyKey：均返回首单，预占/库存只占一次', async () => {
    await inTenant(async () => {
      const idem = 'IRIDEM-N-' + uniq()
      const availableBefore = await inventoryService.available(skuId)
      const activeBefore = await ShopInventoryReservation.count({
        where: { tenantId: TID, skuId, status: 'active' },
      })

      const results = await Promise.allSettled([
        checkoutService.createOrder(site, { items: [{ skuId, qty: 1 }], idempotencyKey: idem }),
        checkoutService.createOrder(site, { items: [{ skuId, qty: 1 }], idempotencyKey: idem }),
      ])

      const fulfilled = results.filter((r) => r.status === 'fulfilled')
      const first = fulfilled[0]?.status === 'fulfilled' ? fulfilled[0].value : null
      const snapshot = {
        orders: await ShopOrder.count({ where: { tenantId: TID, idempotencyKey: idem } }),
        fulfilled: fulfilled.length,
        rejected: results.filter((r) => r.status === 'rejected').length,
        sameOrder: fulfilled.length === 2 && fulfilled.every(
          (r) => r.status === 'fulfilled' && first !== null && r.value.id === first.id,
        ),
        activeReservations: await ShopInventoryReservation.count({
          where: { tenantId: TID, skuId, status: 'active' },
        }) - activeBefore,
        available: await inventoryService.available(skuId),
        rejectReason: results
          .filter((r) => r.status === 'rejected')
          .map((r) => String((r as PromiseRejectedResult).reason).slice(0, 120))
          .join(' | '),
      }

      expect(snapshot).toEqual({
        orders: 1,
        fulfilled: 2,
        rejected: 0,
        sameOrder: true,
        activeReservations: 1,
        available: availableBefore - 1,
        rejectReason: '',
      })
    })
  })

  it('顺序重放仍返回首单且不二次占位（回归保护）', async () => {
    await inTenant(async () => {
      const coupon = await makeCoupon()
      const idem = 'IRIDEM-R-' + uniq()
      const first = await checkoutService.createOrder(site, {
        items: [{ skuId, qty: 2 }], couponCode: coupon.code, idempotencyKey: idem,
      })
      const availableAfterFirst = await inventoryService.available(skuId)

      // 重放时故意换商品数量与券，仍应返回首单且不产生任何新副作用
      const again = await checkoutService.createOrder(site, {
        items: [{ skuId, qty: 5 }], idempotencyKey: idem,
      })

      expect(again.id).toBe(first.id)
      expect(again.items[0].qty).toBe(2)
      expect(await inventoryService.available(skuId)).toBe(availableAfterFirst)
      expect(await ShopCouponRedemption.count({ where: { tenantId: TID, couponId: coupon.id } })).toBe(1)
      expect(await ShopOrder.count({ where: { tenantId: TID, idempotencyKey: idem } })).toBe(1)
    })
  })
})
