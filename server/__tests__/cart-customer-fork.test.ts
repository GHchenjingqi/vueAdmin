// @vitest-environment node
/**
 * 登录顾客购物车分叉实证（cartService.getOrCreateCart）
 *
 * 背景：`getOrCreateCart` 只在 token 有效时查已有车；token 缺失/无效时无条件
 * `ShopCart.create`，即使请求已带 customerId。而 `mergeCartOnLogin` 按
 * (tenantId, customerId) order id ASC 只取最早一辆，`carts` 表上
 * (tenantId, customerId) 也只是非唯一索引 → 登录顾客每次「无 token」加购
 * 都会新建一辆绑定同一顾客的车，旧车里的商品在购物车视图中消失。
 *
 * 断言：同一登录顾客的无 token 加购应复用同一辆车，商品累加不丢。
 * 专属租户 987701，避免与既有购物车用例共用数据。
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { runInTenant } from '../modules/tenant/context.js'
import * as categoryService from '../modules/shop/services/categoryService.js'
import * as brandService from '../modules/shop/services/brandService.js'
import * as spuService from '../modules/shop/services/spuService.js'
import * as skuService from '../modules/shop/services/skuService.js'
import { ShopCart } from '../modules/shop/models/index.js'
import * as cartService from '../modules/storefront/services/cartService.js'
import type { StorefrontSite } from '../modules/storefront/middleware/siteContext.js'

const TID = 987701
const uniq = (): string => `cf${Date.now()}${Math.floor(Math.random() * 1e6)}`
const inTenant = <T>(fn: () => Promise<T>): Promise<T> => runInTenant({ tenantId: TID }, fn)
// 每次运行用全新顾客 ID，避免上一轮（尤其失败轮）遗留的购物车被复用而污染断言
const cidBase = 771000000 + Math.floor(Math.random() * 1000000)
let cidSeq = 0
const nextCid = (): number => cidBase + ++cidSeq

let skuA = 0
let skuB = 0
let site: StorefrontSite

beforeAll(async () => {
  await inTenant(async () => {
    const category = await categoryService.createCategory({
      parentId: 0, name: { 'en-US': 'CF Cat ' + uniq() }, level: 1, sort: 0,
    })
    const brand = await brandService.createBrand({ name: 'CF Brand ' + uniq() })
    const spu = await spuService.createSpu({
      categoryId: category.id,
      brandId: brand.id,
      name: { 'en-US': 'CF Wig ' + uniq() },
      description: { 'en-US': 'cart customer fork fixture' },
    })
    skuA = (await skuService.createSku({ spuId: spu.id, code: 'CFSKU_A' + uniq(), spec: { color: '1B' } })).id
    skuB = (await skuService.createSku({ spuId: spu.id, code: 'CFSKU_B' + uniq(), spec: { color: '613' } })).id
    site = {
      tenantId: TID, channelId: null, shopId: null,
      defaultCurrency: 'USD', defaultLocale: 'en-US',
    }
  })
})

const skusOf = (cart: ShopCart): Promise<number[]> =>
  cartService.toCartView(cart).then((v) => v.items.map((i) => i.skuId).sort((a, b) => a - b))

describe('登录顾客购物车分叉（cartService.getOrCreateCart）', () => {
  it('同一顾客两次无 token 加购不同 SKU：复用同一辆车、两行都在', async () => {
    await inTenant(async () => {
      const cid = nextCid()
      const first = await cartService.addItem(site, undefined, { skuId: skuA, qty: 1 }, cid)
      const second = await cartService.addItem(site, undefined, { skuId: skuB, qty: 2 }, cid)

      const result = {
        carts: await ShopCart.count({ where: { tenantId: TID, customerId: cid } }),
        sameCart: first.id === second.id,
        lines: (await cartService.toCartView(second)).items.length,
        skus: await skusOf(second),
      }
      expect(result).toEqual({
        carts: 1,
        sameCart: true,
        lines: 2,
        skus: [skuA, skuB].sort((a, b) => a - b),
      })
    })
  })

  it('mergeCartOnLogin 之后再次无 token 加购：合并成果不丢、数量累加', async () => {
    await inTenant(async () => {
      const cid = nextCid()
      await cartService.addItem(site, undefined, { skuId: skuA, qty: 1 }, cid)
      const guest = await cartService.addItem(site, undefined, { skuId: skuB, qty: 2 })
      const merged = await cartService.mergeCartOnLogin(site, cid, guest.token)

      const after = await cartService.addItem(site, undefined, { skuId: skuA, qty: 1 }, cid)
      const view = await cartService.toCartView(after)

      const result = {
        carts: await ShopCart.count({ where: { tenantId: TID, customerId: cid } }),
        sameAsMerged: after.id === merged.id,
        lines: view.items.length,
        qtyA: view.items.find((i) => i.skuId === skuA)?.qty ?? 0,
        qtyB: view.items.find((i) => i.skuId === skuB)?.qty ?? 0,
      }
      expect(result).toEqual({ carts: 1, sameAsMerged: true, lines: 2, qtyA: 2, qtyB: 2 })
    })
  })

  it('阴性对照：游客无 token 加购仍是各自独立的车', async () => {
    await inTenant(async () => {
      const a = await cartService.addItem(site, undefined, { skuId: skuA, qty: 1 })
      const b = await cartService.addItem(site, undefined, { skuId: skuB, qty: 1 })
      expect(a.id).not.toBe(b.id)
      expect(a.customerId).toBeNull()
      expect(b.customerId).toBeNull()
      expect(await skusOf(a)).toEqual([skuA])
      expect(await skusOf(b)).toEqual([skuB])
    })
  })

  it('阴性对照：带有效 token 时复用该车，不新建、不串车', async () => {
    await inTenant(async () => {
      const cid = nextCid()
      const first = await cartService.addItem(site, undefined, { skuId: skuA, qty: 1 }, cid)
      const second = await cartService.addItem(site, first.token, { skuId: skuB, qty: 1 }, cid)
      expect(second.id).toBe(first.id)
      expect(await ShopCart.count({ where: { tenantId: TID, customerId: cid } })).toBe(1)
      expect(await skusOf(second)).toEqual([skuA, skuB].sort((a, b) => a - b))
    })
  })

  it('阴性对照：不同顾客的购物车互不串用', async () => {
    await inTenant(async () => {
      const a = await cartService.addItem(site, undefined, { skuId: skuA, qty: 1 }, nextCid())
      const b = await cartService.addItem(site, undefined, { skuId: skuB, qty: 1 }, nextCid())
      expect(a.id).not.toBe(b.id)
      expect(await skusOf(a)).toEqual([skuA])
      expect(await skusOf(b)).toEqual([skuB])
    })
  })
})
