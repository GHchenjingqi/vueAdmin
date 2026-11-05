// @vitest-environment node
/**
 * P3-T06 税费计算（可插拔 TaxProvider）
 *
 * 覆盖：规则表税率解析（目的国 > 默认）、币种与报价一致、反向征收、
 * fail-closed 未配置即阻断（不静默按 0）、Provider 可替换、报价集成。
 * 依赖已迁移的测试库与租户上下文（runInTenant）。
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { runInTenant } from '../modules/tenant/context.js'
import { AppError } from '../middleware/errorHandler.js'
import { ShopTaxRate } from '../modules/shop/models/index.js'
import * as taxService from '../modules/storefront/services/taxService.js'
import type { StorefrontSite } from '../modules/storefront/middleware/siteContext.js'
import * as quoteService from '../modules/storefront/services/quoteService.js'
import * as skuService from '../modules/shop/services/skuService.js'
import * as spuService from '../modules/shop/services/spuService.js'
import * as priceService from '../modules/shop/services/priceService.js'
import * as warehouseService from '../modules/shop/services/warehouseService.js'
import * as inventoryService from '../modules/shop/services/inventoryService.js'
import * as categoryService from '../modules/shop/services/categoryService.js'
import * as brandService from '../modules/shop/services/brandService.js'

const TID = 1
function uniq(): string {
  return `tx${Date.now()}${Math.floor(Math.random() * 1e6)}`
}

let skuId = 0
let site: StorefrontSite

beforeAll(async () => {
  await runInTenant({ tenantId: TID }, async () => {
    const category = await categoryService.createCategory({ parentId: 0, name: { 'en-US': 'TX Cat ' + uniq() }, level: 1, sort: 0 })
    const brand = await brandService.createBrand({ name: 'TX Brand ' + uniq() })
    const warehouse = await warehouseService.createWarehouse({ name: 'TX WH ' + uniq(), type: 'overseas', country: 'US' })
    const spu = await spuService.createSpu({
      categoryId: category.id,
      brandId: brand.id,
      name: { 'en-US': 'TX Wig ' + uniq() },
      description: { 'en-US': 'glueless wig' },
    })
    const sku = await skuService.createSku({ spuId: spu.id, code: 'TXSKU' + uniq(), spec: { color: '1B' } })
    skuId = sku.id
    await priceService.upsertPrice(sku.id, { currency: 'USD', amount: 100 })
    await inventoryService.adjust(sku.id, warehouse.id, 50)
    site = { tenantId: TID, channelId: null, shopId: null, defaultCurrency: 'USD', defaultLocale: 'en-US' }
  })
})

describe('P3-T06 税费计算', () => {
  it('目的国具体税率优先于默认税率，且税费币种与报价一致', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      await ShopTaxRate.create({ tenantId: TID, country: 'DE', rate: 0.19, isDefault: false, priority: 0, active: true } as never)
      const line = await taxService.resolveTax({ country: 'DE', subtotalCents: 10000, currency: 'USD' })
      expect(line.rate).toBe(0.19)
      expect(line.taxCents).toBe(1900) // 100.00 * 19%
      expect(line.currency).toBe('USD') // 与入参币种一致
    })
  })

  it('仅默认税率配置时，未单列国家回落默认税率', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const line = await taxService.resolveTax({ country: 'JP', subtotalCents: 5000, currency: 'USD' })
      // tenant 1 种子默认税率为 0
      expect(line.rate).toBe(0)
      expect(line.taxCents).toBe(0)
      expect(line.reason).toBe('default')
    })
  })

  it('企业买家提供有效税号 → 反向征收，税率 0', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const line = await taxService.resolveTax({
        country: 'DE',
        subtotalCents: 10000,
        currency: 'USD',
        customerType: 'business',
        taxId: 'DE123456789',
      })
      expect(line.rate).toBe(0)
      expect(line.taxCents).toBe(0)
      expect(line.reason).toBe('reverse_charge')
    })
  })

  it('未配置税率的租户 → fail-closed 阻断报价（不静默按 0）', async () => {
    await runInTenant({ tenantId: 999 }, async () => {
      // 租户 999 没有任何税率配置
      await expect(
        taxService.resolveTax({ country: 'US', subtotalCents: 10000, currency: 'USD' }),
      ).rejects.toMatchObject({ statusCode: 422, message: expect.stringContaining('TAX_UNAVAILABLE') })
    })
  })

  it('Provider 可插拔替换（第三方税务 API 模拟）', async () => {
    const original = taxService.getTaxProvider()
    try {
      taxService.setTaxProvider({
        name: 'mock-api',
        async calculate(ctx) {
          return { rate: 0.05, taxCents: Math.round(ctx.subtotalCents * 0.05), currency: ctx.currency, reason: 'mock' }
        },
      })
      const line = await taxService.resolveTax({ country: 'US', subtotalCents: 20000, currency: 'USD' })
      expect(line.rate).toBe(0.05)
      expect(line.taxCents).toBe(1000)
    } finally {
      taxService.setTaxProvider(original)
    }
  })

  it('报价集成：带目的国地址时计入税费；无地址时不计税费', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const noAddr = await quoteService.createQuote(site, { items: [{ skuId, qty: 1 }] })
      expect(noAddr.taxCents).toBe(0)
      expect(noAddr.taxRate).toBe(0)

      const withAddr = await quoteService.createQuote(site, {
        items: [{ skuId, qty: 2 }],
        shippingAddress: { country: 'DE', city: 'Berlin', address1: '1 Main' },
      })
      // 100 * 2 = 200.00 → 19% = 38.00
      expect(withAddr.taxCents).toBe(3800)
      expect(withAddr.taxRate).toBe(0.19)
      expect(withAddr.currency).toBe('USD')
    })
  })

  it('报价集成：未配置税率的租户带地址 → 报价被阻断', async () => {
    await runInTenant({ tenantId: 999 }, async () => {
      await expect(
        quoteService.createQuote(site, {
          items: [{ skuId, qty: 1 }],
          shippingAddress: { country: 'US', city: 'X', address1: '1' },
        }),
      ).rejects.toBeInstanceOf(AppError)
    })
  })
})
