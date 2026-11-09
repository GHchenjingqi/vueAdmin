// @vitest-environment node
/**
 * 报价 → 订单快照一致性实证
 *
 * 审计对象：
 * - server/modules/storefront/services/checkoutService.ts#createOrder 的 policySnapshot.taxRate
 * - server/modules/storefront/services/quoteService.ts#createQuote 的重复 SKU 库存校验
 *
 * 1. 订单快照税率取自死配置 STORE_TAX_RATE，而非实际计税的 quote.taxRate；
 * 2. items 中同一 skuId 重复出现时按行独立校验库存，总需求超可用仍返回可成交报价。
 *
 * 专属租户 987697，自建商品/价格/库存/税率；afterAll 按租户清理。
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { runInTenant } from '../modules/tenant/context.js'
import * as categoryService from '../modules/shop/services/categoryService.js'
import * as brandService from '../modules/shop/services/brandService.js'
import * as spuService from '../modules/shop/services/spuService.js'
import * as skuService from '../modules/shop/services/skuService.js'
import * as priceService from '../modules/shop/services/priceService.js'
import * as warehouseService from '../modules/shop/services/warehouseService.js'
import * as inventoryService from '../modules/shop/services/inventoryService.js'
import {
  ShopTaxRate,
  ShopOrder,
  ShopOrderItem,
  ShopInventory,
  ShopInventoryLog,
  ShopInventoryReservation,
} from '../modules/shop/models/index.js'
import * as quoteService from '../modules/storefront/services/quoteService.js'
import * as checkoutService from '../modules/storefront/services/checkoutService.js'
import type { StorefrontSite } from '../modules/storefront/middleware/siteContext.js'

const TID = 987697
const uniq = (): string => `qs${Date.now()}${Math.floor(Math.random() * 1e6)}`
const inTenant = <T>(fn: () => Promise<T>): Promise<T> => runInTenant({ tenantId: TID }, fn)

let skuId = 0
let smallSkuId = 0
let site: StorefrontSite

const address = { country: 'DE', city: 'Berlin', address1: '1 Main' }

function snapshotOf(row: ShopOrder | null): Record<string, unknown> {
  const raw = row?.policySnapshot as unknown
  if (!raw) return {}
  return (typeof raw === 'string' ? JSON.parse(raw) : raw) as Record<string, unknown>
}

beforeAll(async () => {
  await inTenant(async () => {
    const category = await categoryService.createCategory({
      parentId: 0, name: { 'en-US': 'QS Cat ' + uniq() }, level: 1, sort: 0,
    })
    const brand = await brandService.createBrand({ name: 'QS Brand ' + uniq() })
    const warehouse = await warehouseService.createWarehouse({
      name: 'QS WH ' + uniq(), type: 'overseas', country: 'US',
    })
    const spu = await spuService.createSpu({
      categoryId: category.id,
      brandId: brand.id,
      name: { 'en-US': 'QS Wig ' + uniq() },
      description: { 'en-US': 'quote snapshot fixture' },
    })
    const sku = await skuService.createSku({ spuId: spu.id, code: 'QSSKU' + uniq(), spec: { color: '1B' } })
    skuId = sku.id
    await priceService.upsertPrice(sku.id, { currency: 'USD', amount: 100 })
    await inventoryService.adjust(sku.id, warehouse.id, 100)

    const small = await skuService.createSku({ spuId: spu.id, code: 'QSSMALL' + uniq(), spec: { color: '2' } })
    smallSkuId = small.id
    await priceService.upsertPrice(small.id, { currency: 'USD', amount: 100 })
    await inventoryService.adjust(small.id, warehouse.id, 10)

    await ShopTaxRate.create({
      tenantId: TID, country: 'DE', rate: 0.08, isDefault: false, priority: 99, active: true,
    } as never)
    site = { tenantId: TID, channelId: null, shopId: null, defaultCurrency: 'USD', defaultLocale: 'en-US' }
  })
})

afterAll(async () => {
  await inTenant(async () => {
    await ShopOrderItem.destroy({ where: { tenantId: TID } })
    await ShopOrder.destroy({ where: { tenantId: TID } })
    await ShopInventoryLog.destroy({ where: { tenantId: TID } })
    await ShopInventoryReservation.destroy({ where: { tenantId: TID } })
    await ShopInventory.destroy({ where: { tenantId: TID } })
    await ShopTaxRate.destroy({ where: { tenantId: TID } })
  })
})

describe('订单快照税率 = 实际计税率', () => {
  it('目的国税率 8%：快照税率须与 quote.taxRate 一致，而非环境变量', async () => {
    vi.stubEnv('STORE_TAX_RATE', '0.37')
    try {
      await inTenant(async () => {
        const quote = await quoteService.createQuote(site, { items: [{ skuId, qty: 2 }], shippingAddress: address })
        const view = await checkoutService.createOrder(site, {
          items: [{ skuId, qty: 2 }],
          shippingAddress: address,
          idempotencyKey: 'QS_TAX_' + uniq(),
        })
        const row = await ShopOrder.findOne({ where: { orderNo: view.orderNo, tenantId: TID } })

        const snapshot = {
          quoteTaxRate: quote.taxRate,
          quoteTaxCents: quote.taxCents,
          orderTaxCents: Number(row?.taxCents),
          snapshotTaxRate: snapshotOf(row).taxRate,
        }
        expect(snapshot).toEqual({
          quoteTaxRate: 0.08,
          quoteTaxCents: 1600,
          orderTaxCents: 1600,
          snapshotTaxRate: 0.08,
        })
      })
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('无收货地址不计税时：快照税率须为 0（回归保护）', async () => {
    vi.stubEnv('STORE_TAX_RATE', '0.37')
    try {
      await inTenant(async () => {
        const view = await checkoutService.createOrder(site, {
          items: [{ skuId, qty: 1 }],
          idempotencyKey: 'QS_NOTAX_' + uniq(),
        })
        const row = await ShopOrder.findOne({ where: { orderNo: view.orderNo, tenantId: TID } })
        expect({ taxCents: Number(row?.taxCents), snapshotTaxRate: snapshotOf(row).taxRate }).toEqual({
          taxCents: 0,
          snapshotTaxRate: 0,
        })
      })
    } finally {
      vi.unstubAllEnvs()
    }
  })
})

describe('重复 SKU 行的库存校验', () => {
  it('同 SKU 两行各 6 件（可用 10）：报价须拒绝，不得给出可成交假象', async () => {
    await inTenant(async () => {
      const available = await inventoryService.available(smallSkuId)
      let outcome: Record<string, unknown>
      try {
        const q = await quoteService.createQuote(site, {
          items: [{ skuId: smallSkuId, qty: 6 }, { skuId: smallSkuId, qty: 6 }],
        })
        outcome = {
          rejected: false,
          lines: q.items.length,
          subtotalCents: q.subtotalCents,
          available,
        }
      } catch (err) {
        outcome = { rejected: true, statusCode: (err as { statusCode?: number }).statusCode, available }
      }
      expect(outcome).toEqual({ rejected: true, statusCode: 400, available: 10 })
    })
  })

  it('合计不超可用的重复行 / 单行报价仍正常（不得误伤）', async () => {
    await inTenant(async () => {
      const split = await quoteService.createQuote(site, {
        items: [{ skuId: smallSkuId, qty: 3 }, { skuId: smallSkuId, qty: 4 }],
      })
      const single = await quoteService.createQuote(site, { items: [{ skuId, qty: 2 }] })
      expect({ splitLines: split.items.length, splitSubtotal: split.subtotalCents, singleSubtotal: single.subtotalCents }).toEqual({
        splitLines: 2,
        splitSubtotal: 70000,
        singleSubtotal: 20000,
      })
    })
  })

  it('报价拒绝后建单不会产生孤儿订单 / 预占', async () => {
    await inTenant(async () => {
      const idem = 'QS_DUP_' + uniq()
      const before = await ShopOrder.count({ where: { tenantId: TID, idempotencyKey: idem } })
      const results = await Promise.allSettled([
        checkoutService.createOrder(site, {
          items: [{ skuId: smallSkuId, qty: 6 }, { skuId: smallSkuId, qty: 6 }],
          idempotencyKey: idem,
        }),
      ])
      const after = await ShopOrder.count({ where: { tenantId: TID, idempotencyKey: idem } })
      const active = await ShopInventoryReservation.count({ where: { tenantId: TID, skuId: smallSkuId, status: 'active' } })
      expect({ rejected: results.filter((r) => r.status === 'rejected').length, before, after, active }).toEqual({
        rejected: 1,
        before: 0,
        after: 0,
        active: 0,
      })
    })
  })
})
