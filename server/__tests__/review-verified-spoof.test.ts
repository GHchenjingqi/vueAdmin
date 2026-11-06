// @vitest-environment node
/**
 * 已购标记（verified）越权回归。
 *
 * 缺陷：verifyPurchase 在 skuId 省略时只判断「订单存在任意明细」，
 * 导致买过任意商品的顾客能给任何商品刷出「已购」标记。
 * 修复：skuId 省略时按被评价 SPU 下的全部 SKU 集合匹配订单明细。
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { runInTenant } from '../modules/tenant/context.js'
import {
  ShopChannel,
  ShopShop,
  ShopSku,
  ShopReview,
  ShopCustomer,
  ShopOrder,
  ShopOrderItem,
} from '../modules/shop/models/index.js'
import * as categoryService from '../modules/shop/services/categoryService.js'
import * as brandService from '../modules/shop/services/brandService.js'
import * as spuService from '../modules/shop/services/spuService.js'
import * as skuService from '../modules/shop/services/skuService.js'
import type { StorefrontSite } from '../modules/storefront/middleware/siteContext.js'
import * as reviewService from '../modules/storefront/services/reviewService.js'

const TID = 1
const uniq = (): string => `rvs${Date.now()}${Math.floor(Math.random() * 1e6)}`

let site: StorefrontSite
let categoryId = 0
let brandId = 0

beforeAll(async () => {
  await runInTenant({ tenantId: TID }, async () => {
    const category = await categoryService.createCategory({
      parentId: 0,
      name: { 'en-US': 'RVS Cat ' + uniq() },
      level: 1,
      sort: 0,
    })
    categoryId = category.id
    const brand = await brandService.createBrand({ name: 'RVS Brand ' + uniq() })
    brandId = brand.id
    const channel = await ShopChannel.create({
      tenantId: TID,
      name: 'RVS Channel ' + uniq(),
      type: 'independent',
      status: 'active',
    } as never)
    const shop = await ShopShop.create({
      tenantId: TID,
      channelId: channel.id,
      name: 'RVS Shop ' + uniq(),
      credentials: { defaultCurrency: 'USD', defaultLocale: 'en-US' },
    } as never)
    site = {
      tenantId: TID,
      channelId: channel.id,
      shopId: shop.id,
      defaultCurrency: 'USD',
      defaultLocale: 'en-US',
    }
  })
})

async function makeSpu(extraSku = false): Promise<{ spuId: number; skuIds: number[] }> {
  const spu = await spuService.createSpu({
    categoryId,
    brandId,
    name: { 'en-US': 'RVS SPU ' + uniq() },
    description: { 'en-US': 'verified spoof test' },
  })
  const a = await skuService.createSku({ spuId: spu.id, code: 'RVSA' + uniq(), spec: { color: '1B' } })
  const skuIds = [a.id]
  if (extraSku) {
    const b = await skuService.createSku({ spuId: spu.id, code: 'RVSB' + uniq(), spec: { color: '2' } })
    skuIds.push(b.id)
  }
  return { spuId: spu.id, skuIds }
}

async function makeOrder(
  email: string,
  skuIds: number[],
  opts: { status?: string; tenantId?: number } = {},
): Promise<number> {
  const tenantId = opts.tenantId ?? TID
  const order = await ShopOrder.create({
    tenantId,
    orderNo: 'RVS' + uniq(),
    channelId: site.channelId,
    shopId: site.shopId,
    buyer: { email },
    currency: 'USD',
    amount: 99 * skuIds.length,
    status: opts.status ?? 'paid',
    email,
    amountCents: 9900 * skuIds.length,
    subtotalCents: 9900 * skuIds.length,
    accessToken: 'tok' + uniq(),
  } as never)
  for (const skuId of skuIds) {
    await ShopOrderItem.create({
      orderId: order.id,
      skuId,
      qty: 1,
      price: 99,
      tenantId,
      unitAmountCents: 9900,
      lineTotalCents: 9900,
      currency: 'USD',
    } as never)
  }
  return order.id
}

async function makeCustomer(email: string): Promise<number> {
  const c = await ShopCustomer.create({
    tenantId: TID,
    email,
    passwordHash: 'x',
    status: 'active',
  } as never)
  return c.id
}

async function submit(
  spuId: number,
  orderId: number,
  email: string,
  customerId: number,
  skuId?: number,
): Promise<boolean> {
  const r = await reviewService.submitReview(
    site,
    { spuId, skuId, rating: 5, content: 'RVS ' + uniq(), orderId },
    { customerId, email },
  )
  const row = await ShopReview.findOne({ where: { id: r.id, tenantId: TID } })
  expect(row).toBeTruthy()
  return row!.verified
}

describe('已购标记：跨商品伪造防护', () => {
  it('买过 B、对未购买的 A 省略 skuId → verified=false（核心回归）', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const bought = await makeSpu()
      const target = await makeSpu()
      const email = `buyer_${uniq()}@ex.com`
      const customerId = await makeCustomer(email)
      const orderId = await makeOrder(email, bought.skuIds)
      await expect(submit(target.spuId, orderId, email, customerId)).resolves.toBe(false)
    })
  })

  it('买过 B、对 A 带 skuId(A) → verified=false', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const bought = await makeSpu()
      const target = await makeSpu()
      const email = `buyer_${uniq()}@ex.com`
      const customerId = await makeCustomer(email)
      const orderId = await makeOrder(email, bought.skuIds)
      await expect(submit(target.spuId, orderId, email, customerId, target.skuIds[0])).resolves.toBe(false)
    })
  })

  it('买过 B、对 B 省略 skuId → verified=true（合法路径不误伤）', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const bought = await makeSpu()
      const email = `buyer_${uniq()}@ex.com`
      const customerId = await makeCustomer(email)
      const orderId = await makeOrder(email, bought.skuIds)
      await expect(submit(bought.spuId, orderId, email, customerId)).resolves.toBe(true)
    })
  })

  it('买过 B、对 B 带 skuId(B) → verified=true（既有行为）', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const bought = await makeSpu()
      const email = `buyer_${uniq()}@ex.com`
      const customerId = await makeCustomer(email)
      const orderId = await makeOrder(email, bought.skuIds)
      await expect(submit(bought.spuId, orderId, email, customerId, bought.skuIds[0])).resolves.toBe(true)
    })
  })

  it('多 SKU 商品：订单只含其中一个 SKU，省略 skuId → verified=true', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const spu = await makeSpu(true)
      const email = `buyer_${uniq()}@ex.com`
      const customerId = await makeCustomer(email)
      const orderId = await makeOrder(email, [spu.skuIds[1]])
      await expect(submit(spu.spuId, orderId, email, customerId)).resolves.toBe(true)
      const skus = await ShopSku.findAll({ where: { spuId: spu.spuId, tenantId: TID } })
      expect(skus.length).toBeGreaterThanOrEqual(2)
    })
  })

  it('多 SKU 商品：订单含别的商品、却带本 SPU 的 skuId → verified=false', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const bought = await makeSpu()
      const target = await makeSpu(true)
      const email = `buyer_${uniq()}@ex.com`
      const customerId = await makeCustomer(email)
      const orderId = await makeOrder(email, bought.skuIds)
      await expect(submit(target.spuId, orderId, email, customerId, target.skuIds[1])).resolves.toBe(false)
    })
  })

  it('订单 email 与登录顾客不符 → verified=false', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const target = await makeSpu()
      const email = `buyer_${uniq()}@ex.com`
      const customerId = await makeCustomer(email)
      const orderId = await makeOrder(`other_${uniq()}@ex.com`, target.skuIds)
      await expect(submit(target.spuId, orderId, email, customerId)).resolves.toBe(false)
    })
  })

  it('订单未支付（created）→ verified=false', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const target = await makeSpu()
      const email = `buyer_${uniq()}@ex.com`
      const customerId = await makeCustomer(email)
      const orderId = await makeOrder(email, target.skuIds, { status: 'created' })
      await expect(submit(target.spuId, orderId, email, customerId)).resolves.toBe(false)
    })
  })

  it('跨租户订单不可用于已购验证 → verified=false', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const target = await makeSpu()
      const email = `buyer_${uniq()}@ex.com`
      const customerId = await makeCustomer(email)
      const orderId = await makeOrder(email, target.skuIds, { tenantId: TID + 900 })
      await expect(submit(target.spuId, orderId, email, customerId)).resolves.toBe(false)
    })
  })

  it('未登录（无 auth）带 orderId → verified=false', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const target = await makeSpu()
      const email = `buyer_${uniq()}@ex.com`
      const orderId = await makeOrder(email, target.skuIds)
      const r = await reviewService.submitReview(site, {
        spuId: target.spuId,
        rating: 5,
        content: 'guest ' + uniq(),
        orderId,
      })
      const row = await ShopReview.findOne({ where: { id: r.id, tenantId: TID } })
      expect(row!.verified).toBe(false)
    })
  })
})
