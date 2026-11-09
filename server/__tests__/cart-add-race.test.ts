// @vitest-environment node
/**
 * 购物车并发加购竞态实证（cartService.addItem）
 *
 * 背景：`addItem` 先 `ShopCartItem.findOne` 再 `create` / `existing.qty + input.qty`
 * 读后写，而 `cart_items` 上有 (tenantId, cartId, skuId) 唯一索引。并发同一 SKU 时：
 * - 空车：多个请求都未命中，随后 create 撞 uq_cart_items_cart_sku 抛
 *   SequelizeUniqueConstraintError → 请求 500，且失败方的数量直接丢失；
 * - 已有行：多个请求各自读到同一 qty 后写回，产生丢更新，数量少于实际加购次数。
 *
 * 断言：并发加购应全部成功、单 SKU 仅一行、数量等于各次 qty 之和。
 * 专属租户 987699，避免与既有购物车用例共用数据。
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { runInTenant } from '../modules/tenant/context.js'
import * as categoryService from '../modules/shop/services/categoryService.js'
import * as brandService from '../modules/shop/services/brandService.js'
import * as spuService from '../modules/shop/services/spuService.js'
import * as skuService from '../modules/shop/services/skuService.js'
import * as priceService from '../modules/shop/services/priceService.js'
import { ShopCartItem } from '../modules/shop/models/index.js'
import * as cartService from '../modules/storefront/services/cartService.js'
import type { StorefrontSite } from '../modules/storefront/middleware/siteContext.js'

const TID = 987699
const uniq = (): string => `cr${Date.now()}${Math.floor(Math.random() * 1e6)}`
const inTenant = <T>(fn: () => Promise<T>): Promise<T> => runInTenant({ tenantId: TID }, fn)

let skuA = 0
let skuB = 0
let site: StorefrontSite

beforeAll(async () => {
  await inTenant(async () => {
    const category = await categoryService.createCategory({
      parentId: 0, name: { 'en-US': 'CR Cat ' + uniq() }, level: 1, sort: 0,
    })
    const brand = await brandService.createBrand({ name: 'CR Brand ' + uniq() })
    const spu = await spuService.createSpu({
      categoryId: category.id,
      brandId: brand.id,
      name: { 'en-US': 'CR Wig ' + uniq() },
      description: { 'en-US': 'cart add race fixture' },
    })
    const a = await skuService.createSku({ spuId: spu.id, code: 'CRSKU_A' + uniq(), spec: { color: '1B' } })
    const b = await skuService.createSku({ spuId: spu.id, code: 'CRSKU_B' + uniq(), spec: { color: '613' } })
    skuA = a.id
    skuB = b.id
    await priceService.upsertPrice(skuA, { currency: 'USD', amount: 100 })
    await priceService.upsertPrice(skuB, { currency: 'USD', amount: 60 })
    site = {
      tenantId: TID, channelId: null, shopId: null,
      defaultCurrency: 'USD', defaultLocale: 'en-US',
    }
  })
})

/** 一次性快照，避免失败后重复查询时被后续写入干扰 */
async function snapshot(cartId: number, skuId: number) {
  const lines = await ShopCartItem.findAll({ where: { tenantId: TID, cartId } })
  return {
    lines: lines.length,
    qty: lines.filter((l) => l.skuId === skuId).reduce((sum, l) => sum + l.qty, 0),
  }
}

describe('购物车并发加购竞态（cartService.addItem）', () => {
  it('空车并发同 SKU 各 1 件：全部成功、单行、数量为并发次数', async () => {
    await inTenant(async () => {
      const cart = await cartService.getOrCreateCart(site)
      const calls = Array.from({ length: 8 }, () => cartService.addItem(site, cart.token, { skuId: skuA, qty: 1 }))
      const results = await Promise.allSettled(calls)

      const rejected = results.filter((r) => r.status === 'rejected')
      const result = {
        fulfilled: results.filter((r) => r.status === 'fulfilled').length,
        rejected: rejected.length,
        firstError: rejected.length ? (rejected[0] as PromiseRejectedResult).reason?.name ?? '' : '',
        ...(await snapshot(cart.id, skuA)),
      }
      expect(result).toEqual({
        fulfilled: 8, rejected: 0, firstError: '', lines: 1, qty: 8,
      })
    })
  })

  it('已有行并发累加：数量精确等于「初始 + 各次 qty 之和」', async () => {
    await inTenant(async () => {
      const cart = await cartService.getOrCreateCart(site)
      await cartService.addItem(site, cart.token, { skuId: skuA, qty: 1 })

      const quantities = [1, 2, 3, 1, 1, 2, 1, 1] // 合计 12
      const results = await Promise.allSettled(
        quantities.map((qty) => cartService.addItem(site, cart.token, { skuId: skuA, qty })),
      )

      const result = {
        fulfilled: results.filter((r) => r.status === 'fulfilled').length,
        rejected: results.filter((r) => r.status === 'rejected').length,
        ...(await snapshot(cart.id, skuA)),
      }
      expect(result).toEqual({ fulfilled: 8, rejected: 0, lines: 1, qty: 13 })
    })
  })

  it('顺序重放（阴性对照）：无并发时数量正确，缺陷只在并发窗口暴露', async () => {
    await inTenant(async () => {
      const cart = await cartService.getOrCreateCart(site)
      for (let i = 0; i < 8; i++) {
        await cartService.addItem(site, cart.token, { skuId: skuA, qty: 1 })
      }
      expect(await snapshot(cart.id, skuA)).toEqual({ lines: 1, qty: 8 })
    })
  })

  it('并发不同 SKU：各自单行且互不串数量', async () => {
    await inTenant(async () => {
      const cart = await cartService.getOrCreateCart(site)
      const calls = Array.from({ length: 8 }, (_, i) =>
        cartService.addItem(site, cart.token, { skuId: i % 2 === 0 ? skuA : skuB, qty: 1 }),
      )
      const results = await Promise.allSettled(calls)

      expect(results.filter((r) => r.status === 'rejected')).toHaveLength(0)
      expect(await snapshot(cart.id, skuA)).toEqual({ lines: 2, qty: 4 })
      const all = await ShopCartItem.findAll({ where: { tenantId: TID, cartId: cart.id } })
      expect(all.find((l) => l.skuId === skuB)?.qty).toBe(4)
    })
  })
})
