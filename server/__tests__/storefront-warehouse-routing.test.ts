// @vitest-environment node
/**
 * P5-T04 多仓与更精细配送策略 测试
 *
 * 覆盖：仓库路由规则（区域白名单 → priority → 可用量）、按仓配送承诺、
 * 多仓库存口径一致性（available = Σ(quantity-locked)，occupy 跨仓聚合）、
 * 报价暴露订单级/行级配送承诺。
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { runInTenant } from '../modules/tenant/context.js'
import { ShopWarehouse, ShopInventory } from '../modules/shop/models/index.js'
import * as categoryService from '../modules/shop/services/categoryService.js'
import * as brandService from '../modules/shop/services/brandService.js'
import * as spuService from '../modules/shop/services/spuService.js'
import * as skuService from '../modules/shop/services/skuService.js'
import * as priceService from '../modules/shop/services/priceService.js'
import * as inventoryService from '../modules/shop/services/inventoryService.js'
import { routeWarehouses, pickWarehouse, getDeliveryCommitment } from '../modules/shop/services/warehouseRoutingService.js'
import * as quoteService from '../modules/storefront/services/quoteService.js'
import type { StorefrontSite } from '../modules/storefront/middleware/siteContext.js'

const TID = 1
function uniq(): string {
  return `wr${Date.now()}${Math.floor(Math.random() * 1e6)}`
}

let skuId = 0
let site: StorefrontSite
let whUS: number // 优先级 10，服务 US，3 天
let whEU: number // 优先级 50，服务 EU，7 天
let whAny: number // 优先级 100，无白名单，5 天

beforeAll(async () => {
  await runInTenant({ tenantId: TID }, async () => {
    const category = await categoryService.createCategory({ parentId: 0, name: { 'en-US': 'WR Cat ' + uniq() }, level: 1, sort: 0 })
    const brand = await brandService.createBrand({ name: 'WR Brand ' + uniq() })
    const spu = await spuService.createSpu({
      categoryId: category.id,
      brandId: brand.id,
      name: { 'en-US': 'WR Wig ' + uniq(), 'zh-CN': 'WR 假发' },
      description: { 'en-US': 'routing wig' },
    })
    const sku = await skuService.createSku({ spuId: spu.id, code: 'WRSKU' + uniq(), spec: { color: '1B' } })
    skuId = sku.id
    await priceService.upsertPrice(sku.id, { currency: 'USD', amount: 99.9 })

    whUS = (await ShopWarehouse.create({ tenantId: TID, name: 'US-A ' + uniq(), type: 'overseas', country: 'US', priority: 10, deliveryEstimateDays: 3, servedCountries: ['US'] } as never)).id
    whEU = (await ShopWarehouse.create({ tenantId: TID, name: 'EU-B ' + uniq(), type: 'bonded', country: 'DE', priority: 50, deliveryEstimateDays: 7, servedCountries: ['DE', 'FR'] } as never)).id
    whAny = (await ShopWarehouse.create({ tenantId: TID, name: 'Any-C ' + uniq(), type: 'direct', country: 'CN', priority: 100, deliveryEstimateDays: 5, servedCountries: null } as never)).id

    await inventoryService.adjust(skuId, whUS, 10)
    await inventoryService.adjust(skuId, whEU, 20)
    await inventoryService.adjust(skuId, whAny, 5)
    site = { tenantId: TID, channelId: 0, shopId: 0, defaultCurrency: 'USD', defaultLocale: 'en-US' }
  })
})

describe('P5-T04 仓库路由规则', () => {
  it('区域白名单命中优先：US 目的国 → whUS（priority 10）', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const rows = await routeWarehouses(skuId, 'US')
      expect(rows[0].warehouseId).toBe(whUS)
      expect(rows[0].servesCountry).toBe(true)
    })
  })

  it('区域白名单命中优先：DE 目的国 → whEU（priority 50）', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const rows = await routeWarehouses(skuId, 'DE')
      expect(rows[0].warehouseId).toBe(whEU)
    })
  })

  it('目的国不在任何区域白名单 → 仅「服务全部」仓可达，优先级兜底（whAny < whUS < whEU）', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const rows = await routeWarehouses(skuId, 'CN')
      // whUS/whEU 白名单仅 US/DE/FR，CN 不可达 → 服务全部的 whAny 优先，其余按 priority
      expect(rows.map((r) => r.warehouseId)).toEqual([whAny, whUS, whEU])
      expect(rows[0].servesCountry).toBe(true)
    })
  })

  it('pickWarehouse 按目的国返回区域命中仓；getDeliveryCommitment 按仓返回承诺天数', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      expect(await pickWarehouse(skuId, 'US')).toBe(whUS)
      expect(await pickWarehouse(skuId, 'FR')).toBe(whEU)
      const c = await getDeliveryCommitment(skuId, 'US')
      expect(c?.warehouseId).toBe(whUS)
      expect(c?.deliveryEstimateDays).toBe(3)
      const c2 = await getDeliveryCommitment(skuId, 'DE')
      expect(c2?.deliveryEstimateDays).toBe(7)
    })
  })
})

describe('P5-T04 多仓库存口径一致 + 报价承诺', () => {
  it('多仓聚合 available = Σ(quantity-locked)，occupy 不重复计', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const before = await inventoryService.available(skuId)
      expect(before).toBe(35) // 10 + 20 + 5
      // 跨仓占用 8（优先扣 whUS 10 → 余 2，再扣 whEU 20 → 余 14）
      await inventoryService.occupy(skuId, 8, 'wr-ref-' + uniq())
      const after = await inventoryService.available(skuId)
      expect(after).toBe(27)
      const rows = await ShopInventory.findAll({ where: { skuId, tenantId: TID } })
      const totalLocked = rows.reduce((s, r) => s + r.locked, 0)
      expect(totalLocked).toBe(8)
      // 口径一致：available == Σquantity - Σlocked
      const totalQty = rows.reduce((s, r) => s + r.quantity, 0)
      expect(after).toBe(totalQty - totalLocked)
    })
  })

  it('报价暴露行级与订单级按仓配送承诺（取最长/最不利）', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const quote = await quoteService.createQuote(site, {
        items: [{ skuId, qty: 1 }],
        shippingAddress: { country: 'US', city: 'LA', address1: '1 St' },
      })
      expect(quote.items[0].deliveryCommitment?.warehouseId).toBe(whUS)
      expect(quote.items[0].deliveryCommitment?.deliveryEstimateDays).toBe(3)
      expect(quote.deliveryCommitment?.deliveryEstimateDays).toBe(3)
    })
  })
})
