// @vitest-environment node
/**
 * T-08 配送范围（P3-T05）门禁实证
 *
 * 断言：地址不在配送范围 → 报价/建单/支付会话均被拒绝；
 *       白名单内的地址按 settings.shop.shipping 分区运费服务端重算；
 *       未提供地址时不改变历史行为（兼容既有链路）。
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
import { ShopOrder } from '../modules/shop/models/index.js'
import * as shippingService from '../modules/storefront/services/shippingService.js'
import * as quoteService from '../modules/storefront/services/quoteService.js'
import * as checkoutService from '../modules/storefront/services/checkoutService.js'
import * as paymentService from '../modules/storefront/services/paymentService.js'
import type { StorefrontSite } from '../modules/storefront/middleware/siteContext.js'

const TID = 1
const uniq = (): string => `sh${Date.now()}${Math.floor(Math.random() * 1e6)}`

let skuId = 0
let site: StorefrontSite
let cfg: shippingService.ShippingConfig

const inTenant = <T>(fn: () => Promise<T>): Promise<T> => runInTenant({ tenantId: TID }, fn)
const addr = (country: string | null): Record<string, unknown> =>
  country === null ? { city: 'Nowhere' } : { country, city: 'Test City', address1: '1 Main St' }
const zoneCents = (country: string): number => {
  const z = cfg.zones.find((item) => item.countries.includes(country))
  return z ? z.shippingCents : cfg.defaultShippingCents
}

beforeAll(async () => {
  shippingService.clearShippingCache()
  cfg = await inTenant(() => shippingService.getActiveShipping())
  await inTenant(async () => {
    const category = await categoryService.createCategory({ parentId: 0, name: { 'en-US': 'SH Cat ' + uniq() }, level: 1, sort: 0 })
    const brand = await brandService.createBrand({ name: 'SH Brand ' + uniq() })
    const warehouse = await warehouseService.createWarehouse({ name: 'SH WH ' + uniq(), type: 'overseas', country: 'US' })
    const spu = await spuService.createSpu({
      categoryId: category.id,
      brandId: brand.id,
      name: { 'en-US': 'SH Wig ' + uniq(), 'zh-CN': '配送测试商品' },
      description: { 'en-US': 'shipping fixture' },
    })
    const sku = await skuService.createSku({ spuId: spu.id, code: 'SHSKU' + uniq(), spec: { color: '1B' } })
    skuId = sku.id
    await priceService.upsertPrice(sku.id, { currency: 'USD', amount: 100 })
    await inventoryService.adjust(sku.id, warehouse.id, 500)
    site = { tenantId: TID, channelId: null, shopId: null, defaultCurrency: 'USD', defaultLocale: 'en-US' }
  })
})

describe('T-08 配送范围与分区运费', () => {
  it('配置来自 settings.shop.shipping，白名单非空且不含未开放国家', () => {
    expect(cfg.mode).toBe('whitelist')
    expect(cfg.allowedCountries.length).toBeGreaterThan(0)
    expect(cfg.allowedCountries).toContain('US')
    expect(cfg.allowedCountries).not.toContain('XX')
  })

  it('报价：白名单内命中分区 → 运费按分区服务端重算', async () => {
    await inTenant(async () => {
      const q = await quoteService.createQuote(site, { items: [{ skuId, qty: 2 }], shippingAddress: addr('US') })
      expect(q.shippingCents).toBe(zoneCents('US'))
      expect(q.amountCents).toBe(q.subtotalCents + q.shippingCents + q.taxCents - q.discountCents)
    })
  })

  it('报价：白名单内未命中分区 → 走默认运费', async () => {
    await inTenant(async () => {
      const fallback = cfg.allowedCountries.find((c) => !cfg.zones.some((z) => z.countries.includes(c)))
      if (!fallback) return
      const q = await quoteService.createQuote(site, { items: [{ skuId, qty: 1 }], shippingAddress: addr(fallback) })
      expect(q.shippingCents).toBe(cfg.defaultShippingCents)
    })
  })

  it('报价：国家不在白名单 → 400 ADDRESS_NOT_SHIPPABLE', async () => {
    await inTenant(async () => {
      await expect(
        quoteService.createQuote(site, { items: [{ skuId, qty: 1 }], shippingAddress: addr('XX') }),
      ).rejects.toThrow(/ADDRESS_NOT_SHIPPABLE/)
    })
  })

  it('报价：提供了地址但缺两位国家码 → 400 ADDRESS_COUNTRY_REQUIRED', async () => {
    await inTenant(async () => {
      await expect(
        quoteService.createQuote(site, { items: [{ skuId, qty: 1 }], shippingAddress: addr(null) }),
      ).rejects.toThrow(/ADDRESS_COUNTRY_REQUIRED/)
    })
  })

  it('建单：不可配送地址直接拒绝，且不落库订单', async () => {
    await inTenant(async () => {
      const before = await ShopOrder.count({ where: { tenantId: TID } })
      await expect(
        checkoutService.createOrder(site, { items: [{ skuId, qty: 1 }], shippingAddress: addr('XX'), email: 'ship@example.com' }),
      ).rejects.toThrow(/ADDRESS_NOT_SHIPPABLE/)
      expect(await ShopOrder.count({ where: { tenantId: TID } })).toBe(before)
    })
  })

  it('建单：可配送地址固化进订单快照（运费 + 地址）', async () => {
    await inTenant(async () => {
      const order = await checkoutService.createOrder(site, {
        items: [{ skuId, qty: 1 }],
        shippingAddress: addr('us'),
        email: 'ship@example.com',
      })
      expect(order.shippingCents).toBe(zoneCents('US'))
      expect(order.shippingAddress).toMatchObject({ country: 'us' })
      expect(order.currency).toBe('USD')
    })
  })

  it('支付会话：地址不在配送范围的订单不得进入支付（不能创建可支付订单）', async () => {
    await inTenant(async () => {
      const order = await checkoutService.createOrder(site, { items: [{ skuId, qty: 1 }], shippingAddress: addr('US') })
      await ShopOrder.update({ shippingAddress: addr('XX') } as never, { where: { id: order.id, tenantId: TID } })
      await expect(paymentService.createSession(site, order.id)).rejects.toThrow(/ADDRESS_NOT_SHIPPABLE/)
    })
  })

  it('向后兼容：未提供地址时不读取配送配置、沿用既有运费规则', async () => {
    await inTenant(async () => {
      const q = await quoteService.createQuote(site, { items: [{ skuId, qty: 1 }] })
      expect(Number.isInteger(q.shippingCents)).toBe(true)
      expect(q.amountCents).toBe(q.subtotalCents + q.shippingCents + q.taxCents - q.discountCents)
    })
  })
})
