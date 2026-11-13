// @vitest-environment node
/**
 * 优惠叠加导致运费/税费被侵蚀 —— 实证测试
 *
 * 审计对象：server/modules/storefront/services/quoteService.ts#createQuote
 *
 * 缺陷：
 *   券折扣与会员等级折扣各自独立以「商品小计」为上限，二者相加可超过小计；
 *   而应付公式从「小计 + 运费 + 税费」中直接减去两项折扣，导致商品级优惠
 *   侵蚀到运费与税费上（与代码注释「按商品小计打折，不含运费/税费」相悖）。
 *
 * 复现场景（商品 100 元、券面额 100 元、会员 95 折、运费 20 元）：
 *   修复前应付 = 100 + 20 - 100 - 5 = 15 元  → 运费被会员折吃掉 5 元
 *   修复后应付 = 100 + 20 - 100 - 0  = 20 元  → 券抵满商品，运费照收
 *
 * 专属租户 987698，自建商品/价格/库存/会员等级/顾客/优惠券；afterAll 按租户清理。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { runInTenant } from '../modules/tenant/context.js'
import * as categoryService from '../modules/shop/services/categoryService.js'
import * as brandService from '../modules/shop/services/brandService.js'
import * as spuService from '../modules/shop/services/spuService.js'
import * as skuService from '../modules/shop/services/skuService.js'
import * as priceService from '../modules/shop/services/priceService.js'
import * as warehouseService from '../modules/shop/services/warehouseService.js'
import * as inventoryService from '../modules/shop/services/inventoryService.js'
import * as membershipService from '../modules/shop/services/membershipService.js'
import {
  ShopCoupon,
  ShopCustomer,
  ShopMembershipTier,
  ShopInventory,
  ShopInventoryLog,
} from '../modules/shop/models/index.js'
import * as quoteService from '../modules/storefront/services/quoteService.js'
import config from '../config/index.js'
import type { StorefrontSite } from '../modules/storefront/middleware/siteContext.js'

const TID = 987698
const uniq = (): string => `ds${Date.now()}${Math.floor(Math.random() * 1e6)}`
const inTenant = <T>(fn: () => Promise<T>): Promise<T> => runInTenant({ tenantId: TID }, fn)

const PRODUCT_CENTS = 10000 // 商品 100 元
const SHIPPING_CENTS = 2000 // 运费 20 元

let skuId = 0
let customerId = 0
let couponCode = ''
let site: StorefrontSite

beforeAll(async () => {
  await inTenant(async () => {
    const category = await categoryService.createCategory({
      parentId: 0, name: { 'en-US': 'DS Cat ' + uniq() }, level: 1, sort: 0,
    })
    const brand = await brandService.createBrand({ name: 'DS Brand ' + uniq() })
    const warehouse = await warehouseService.createWarehouse({
      name: 'DS WH ' + uniq(), type: 'overseas', country: 'US',
    })
    const spu = await spuService.createSpu({
      categoryId: category.id,
      brandId: brand.id,
      name: { 'en-US': 'DS Wig ' + uniq() },
      description: { 'en-US': 'discount stacking fixture' },
    })
    const sku = await skuService.createSku({ spuId: spu.id, code: 'DSSKU' + uniq(), spec: { color: '1B' } })
    skuId = sku.id
    await priceService.upsertPrice(sku.id, { currency: 'USD', amount: PRODUCT_CENTS / 100 })
    await inventoryService.adjust(sku.id, warehouse.id, 100)

    // 会员等级：discountPct=95 → 打 95 折（优惠 5%）
    const tier = await membershipService.createTier(TID, {
      name: 'DS Tier ' + uniq(), level: 1, growthThreshold: 0, loginFrequency: 0,
      orderCountThreshold: 0, discountPct: 95, matchStrategy: 'any',
    })

    const customer = await ShopCustomer.create({
      tenantId: TID,
      email: `ds-${uniq()}@example.com`,
      passwordHash: 'x',
      status: 'active',
      points: 0,
      growthValue: 0,
      orderCount: 0,
      membershipTierId: tier.id,
    } as never)
    customerId = customer.id

    // 优惠券：固定面额 = 商品价（100 元），抵满商品小计
    const coupon = await ShopCoupon.create({
      tenantId: TID,
      code: 'DS' + uniq(),
      type: 'fixed',
      value: PRODUCT_CENTS / 100,
      minSpend: 0,
      currency: 'USD',
      validFrom: '2000-01-01',
      validTo: '2999-12-31',
      usageLimit: 0,
      usedCount: 0,
    } as never)
    couponCode = coupon.code

    site = { tenantId: TID, channelId: null, shopId: null, defaultCurrency: 'USD', defaultLocale: 'en-US' }
  })
})

afterAll(async () => {
  await inTenant(async () => {
    await ShopCoupon.destroy({ where: { tenantId: TID } })
    await ShopCustomer.destroy({ where: { tenantId: TID } })
    await ShopMembershipTier.destroy({ where: { tenantId: TID } })
    await ShopInventoryLog.destroy({ where: { tenantId: TID } })
    await ShopInventory.destroy({ where: { tenantId: TID } })
  })
})

describe('券折扣 + 会员折扣叠加不得侵蚀运费/税费', () => {
  it('券抵满商品小计后，会员折不应继续抵扣运费（应付须等于运费）', async () => {
    const original = config.checkout.shippingCents
    config.checkout.shippingCents = SHIPPING_CENTS
    try {
      await inTenant(async () => {
        const quote = await quoteService.createQuote(site, {
          items: [{ skuId, qty: 1 }],
          customerId,
          couponCode,
        })

        // 券抵满商品小计 → 商品实付 0；会员折只针对商品小计，不得侵蚀运费
        expect({
          subtotalCents: quote.subtotalCents,
          discountCents: quote.discountCents,
          tierDiscountCents: quote.tierDiscountCents,
          shippingCents: quote.shippingCents,
          amountCents: quote.amountCents,
        }).toEqual({
          subtotalCents: PRODUCT_CENTS,
          discountCents: PRODUCT_CENTS,
          tierDiscountCents: 0,
          shippingCents: SHIPPING_CENTS,
          amountCents: SHIPPING_CENTS,
        })
      })
    } finally {
      config.checkout.shippingCents = original
    }
  })

  it('券未抵满小计时，会员折仍正常生效（不得误伤既有折扣行为）', async () => {
    const original = config.checkout.shippingCents
    config.checkout.shippingCents = SHIPPING_CENTS
    try {
      await inTenant(async () => {
        const smallCoupon = await ShopCoupon.create({
          tenantId: TID,
          code: 'DS' + uniq(),
          type: 'fixed',
          value: 10, // 10 元券
          minSpend: 0,
          currency: 'USD',
          validFrom: '2000-01-01',
          validTo: '2999-12-31',
          usageLimit: 0,
          usedCount: 0,
        } as never)

        const quote = await quoteService.createQuote(site, {
          items: [{ skuId, qty: 1 }],
          customerId,
          couponCode: smallCoupon.code,
        })

        // 小计 100 - 券 10 - 会员 5 + 运费 20 = 105 元
        expect({
          discountCents: quote.discountCents,
          tierDiscountCents: quote.tierDiscountCents,
          shippingCents: quote.shippingCents,
          amountCents: quote.amountCents,
        }).toEqual({
          discountCents: 1000,
          tierDiscountCents: 500,
          shippingCents: SHIPPING_CENTS,
          amountCents: PRODUCT_CENTS - 1000 - 500 + SHIPPING_CENTS,
        })
      })
    } finally {
      config.checkout.shippingCents = original
    }
  })

  it('无券时会员折照常按小计计算，不得回归', async () => {
    const original = config.checkout.shippingCents
    config.checkout.shippingCents = SHIPPING_CENTS
    try {
      await inTenant(async () => {
        const quote = await quoteService.createQuote(site, {
          items: [{ skuId, qty: 1 }],
          customerId,
        })
        expect({
          tierDiscountCents: quote.tierDiscountCents,
          amountCents: quote.amountCents,
        }).toEqual({
          tierDiscountCents: 500,
          amountCents: PRODUCT_CENTS - 500 + SHIPPING_CENTS,
        })
      })
    } finally {
      config.checkout.shippingCents = original
    }
  })
})
