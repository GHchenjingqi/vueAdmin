// @vitest-environment node
/**
 * P5-T05 Bundle / 搭配购实证
 *
 * 断言：组件 SKU 全部命中（qty ≥ 组件 qty）且币种价齐备时才打折；
 *       缺组件 / 未生效 / 已过期 / 停用 / 币种不符 → 不打折（fail-safe 不误折扣）；
 *       fixed 与 percent 折扣由服务端重算并封顶；命中行标记 bundleId；
 *       推荐位按 placement 返回 active Bundle。
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { runInTenant } from '../modules/tenant/context.js'
import * as categoryService from '../modules/shop/services/categoryService.js'
import * as brandService from '../modules/shop/services/brandService.js'
import * as spuService from '../modules/shop/services/spuService.js'
import * as skuService from '../modules/shop/services/skuService.js'
import * as priceService from '../modules/shop/services/priceService.js'
import * as warehouseService from '../modules/shop/services/warehouseService.js'
import * as inventoryService from '../modules/shop/services/inventoryService.js'
import * as marketingService from '../modules/shop/services/marketingService.js'
import { ShopBundle } from '../modules/shop/models/index.js'
import * as quoteService from '../modules/storefront/services/quoteService.js'
import * as bundleService from '../modules/storefront/services/bundleService.js'
import type { StorefrontSite } from '../modules/storefront/middleware/siteContext.js'
import { setPromotionEvaluator } from '../modules/storefront/services/promotionService.js'

const TID = 1
const uniq = (): string => `bd${Date.now()}${Math.floor(Math.random() * 1e6)}`
const day = (offset: number): string => {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + offset)
  return d.toISOString().slice(0, 10)
}

let skuA = 0
let skuB = 0
let site: StorefrontSite

const inTenant = <T>(fn: () => Promise<T>): Promise<T> => runInTenant({ tenantId: TID }, fn)

interface BundleOverrides {
  discountType?: 'fixed' | 'percent'
  discountValue?: number
  currency?: string
  active?: boolean
  startAt?: string
  endAt?: string
  placement?: string
}

async function createBundle(components: { skuId: number; qty: number }[], overrides: BundleOverrides = {}): Promise<ShopBundle> {
  return marketingService.createBundle({
    name: { 'en-US': 'Bundle ' + uniq() },
    currency: overrides.currency ?? 'USD',
    components,
    discountType: overrides.discountType ?? 'fixed',
    discountValue: overrides.discountValue ?? 5,
    active: overrides.active ?? true,
    startAt: overrides.startAt ?? day(-1),
    endAt: overrides.endAt ?? day(1),
    placement: overrides.placement ?? null,
  })
}

beforeAll(async () => {
  // 隔离：共享测试库里可能存在其它用例/并行会话建的促销活动（8 折），
  // 会让本文件的金额断言随环境漂移。这里显式关闭促销求值。
  setPromotionEvaluator(async () => null)
  await inTenant(async () => {
    const category = await categoryService.createCategory({ parentId: 0, name: { 'en-US': 'BD Cat ' + uniq() }, level: 1, sort: 0 })
    const brand = await brandService.createBrand({ name: 'BD Brand ' + uniq() })
    const warehouse = await warehouseService.createWarehouse({ name: 'BD WH ' + uniq(), type: 'overseas', country: 'US' })
    const spuA = await spuService.createSpu({
      categoryId: category.id,
      brandId: brand.id,
      name: { 'en-US': 'BD Wig A ' + uniq(), 'zh-CN': '搭配购测试 A' },
      description: { 'en-US': 'bundle fixture A' },
    })
    const spuB = await spuService.createSpu({
      categoryId: category.id,
      brandId: brand.id,
      name: { 'en-US': 'BD Wig B ' + uniq(), 'zh-CN': '搭配购测试 B' },
      description: { 'en-US': 'bundle fixture B' },
    })
    const a = await skuService.createSku({ spuId: spuA.id, code: 'BDSKUA' + uniq(), spec: { color: '1B' } })
    const b = await skuService.createSku({ spuId: spuB.id, code: 'BDSKUB' + uniq(), spec: { color: '2C' } })
    skuA = a.id
    skuB = b.id
    await priceService.upsertPrice(skuA, { currency: 'USD', amount: 100 })
    await priceService.upsertPrice(skuB, { currency: 'USD', amount: 60 })
    await inventoryService.adjust(skuA, warehouse.id, 1000)
    await inventoryService.adjust(skuB, warehouse.id, 1000)
    site = { tenantId: TID, channelId: null, shopId: null, defaultCurrency: 'USD', defaultLocale: 'en-US' }
  })
})

// 每个用例前停用既有 bundle，避免共享组件命中先前创建的 bundle（首条匹配）
beforeEach(async () => {
  await inTenant(async () => {
    await ShopBundle.update({ active: false }, { where: { tenantId: TID } })
  })
})

describe('P5-T05 Bundle 报价', () => {
  it('组件全命中（fixed）→ 应用折扣、标记行 bundleId', async () => {
    await inTenant(async () => {
      const b = await createBundle(
        [
          { skuId: skuA, qty: 1 },
          { skuId: skuB, qty: 1 },
        ],
        { discountType: 'fixed', discountValue: 5 },
      )
      const q = await quoteService.createQuote(site, {
        items: [
          { skuId: skuA, qty: 1 },
          { skuId: skuB, qty: 1 },
        ],
      })
      // 小计 10000 + 6000 = 16000 分；fixed 5 → 500 分
      expect(q.bundleDiscountCents).toBe(500)
      expect(q.bundle).toMatchObject({ id: b.id })
      expect(q.items.find((i) => i.skuId === skuA)?.bundleId).toBe(b.id)
      expect(q.amountCents).toBe(q.subtotalCents + q.shippingCents + q.taxCents - q.discountCents)
    })
  })

  it('percent 折扣按组件小计计算', async () => {
    await inTenant(async () => {
      await createBundle(
        [
          { skuId: skuA, qty: 1 },
          { skuId: skuB, qty: 1 },
        ],
        { discountType: 'percent', discountValue: 10 },
      )
      const q = await quoteService.createQuote(site, {
        items: [
          { skuId: skuA, qty: 1 },
          { skuId: skuB, qty: 1 },
        ],
      })
      expect(q.bundleDiscountCents).toBe(1600) // 16000 * 10%
    })
  })

  it('缺组件 → 不打折', async () => {
    await inTenant(async () => {
      await createBundle([
        { skuId: skuA, qty: 1 },
        { skuId: skuB, qty: 1 },
      ])
      const q = await quoteService.createQuote(site, { items: [{ skuId: skuA, qty: 1 }] })
      expect(q.bundleDiscountCents).toBe(0)
      expect(q.bundle).toBeNull()
    })
  })

  it('组件数量不足（qty < 组件 qty）→ 不打折', async () => {
    await inTenant(async () => {
      await createBundle([{ skuId: skuA, qty: 2 }], { discountValue: 5 })
      const q = await quoteService.createQuote(site, { items: [{ skuId: skuA, qty: 1 }] })
      expect(q.bundleDiscountCents).toBe(0)
    })
  })

  it('未生效 / 已过期 / 停用 / 币种不符 → 不打折', async () => {
    await inTenant(async () => {
      await createBundle([{ skuId: skuA, qty: 1 }], { startAt: day(2), endAt: day(5) })
      await createBundle([{ skuId: skuA, qty: 1 }], { startAt: day(-5), endAt: day(-1) })
      await createBundle([{ skuId: skuA, qty: 1 }], { active: false })
      await createBundle([{ skuId: skuA, qty: 1 }], { currency: 'EUR' })
      const q = await quoteService.createQuote(site, { items: [{ skuId: skuA, qty: 1 }] })
      expect(q.bundleDiscountCents).toBe(0)
    })
  })

  it('折扣封顶不超过组件小计', async () => {
    await inTenant(async () => {
      await createBundle([{ skuId: skuA, qty: 1 }], { discountType: 'fixed', discountValue: 999999 })
      const q = await quoteService.createQuote(site, { items: [{ skuId: skuA, qty: 1 }] })
      expect(q.bundleDiscountCents).toBe(10000) // 组件小计 100 元 = 10000 分
    })
  })
})

describe('P5-T05 Bundle 推荐位', () => {
  it('placement 命中 → 返回 active Bundle（含组件摘要）', async () => {
    await inTenant(async () => {
      const slot = 'home_' + uniq()
      const b = await createBundle(
        [
          { skuId: skuA, qty: 1 },
          { skuId: skuB, qty: 2 },
        ],
        { placement: slot, discountValue: 10 },
      )
      const list = await bundleService.listRecommendedBundles(slot, 'USD')
      expect(list.length).toBe(1)
      expect(list[0].id).toBe(b.id)
      expect(list[0].components).toHaveLength(2)
      expect(list[0].components.find((c) => c.skuId === skuB)?.qty).toBe(2)
    })
  })

  it('placement 不匹配 → 空', async () => {
    await inTenant(async () => {
      const slot = 'home_' + uniq()
      await createBundle([{ skuId: skuA, qty: 1 }], { placement: slot })
      const list = await bundleService.listRecommendedBundles(slot + '_x', 'USD')
      expect(list.length).toBe(0)
    })
  })
})
