// @vitest-environment node
/**
 * P3-T03 登录后购物车合并（服务层 + 控制器集成）
 *
 * 覆盖：游客→登录合并、同 SKU 累加封顶、游客独有 SKU 迁入、冲突优先级
 * （既有顾客行属性优先、仅合并数量）、不丢行、无效 token 不合并、已归属游客车不合并。
 * 依赖已迁移的测试库与租户上下文（runInTenant）。
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { runInTenant } from '../modules/tenant/context.js'
import { ShopChannel, ShopShop, ShopInventoryReservation } from '../modules/shop/models/index.js'
import * as categoryService from '../modules/shop/services/categoryService.js'
import * as brandService from '../modules/shop/services/brandService.js'
import * as spuService from '../modules/shop/services/spuService.js'
import * as skuService from '../modules/shop/services/skuService.js'
import * as priceService from '../modules/shop/services/priceService.js'
import * as warehouseService from '../modules/shop/services/warehouseService.js'
import * as inventoryService from '../modules/shop/services/inventoryService.js'
import { ShopCustomer } from '../modules/shop/models/index.js'
import * as customerService from '../modules/shop/services/customerService.js'
import type { StorefrontSite } from '../modules/storefront/middleware/siteContext.js'
import * as cartService from '../modules/storefront/services/cartService.js'
import * as authController from '../modules/storefront/controllers/authController.js'

const TID = 1
function uniq(): string {
  return `cm${Date.now()}${Math.floor(Math.random() * 1e6)}`
}

let skuA = 0
let skuB = 0
let channelId = 0
let shopId = 0
let site: StorefrontSite

async function seedCustomer(email: string): Promise<number> {
  const c = await customerService.registerCustomer({ tenantId: TID, email, password: 'Password123', nickname: email })
  return c.customer.id
}

beforeAll(async () => {
  await runInTenant({ tenantId: TID }, async () => {
    const category = await categoryService.createCategory({ parentId: 0, name: { 'en-US': 'CM Cat ' + uniq() }, level: 1, sort: 0 })
    const brand = await brandService.createBrand({ name: 'CM Brand ' + uniq() })
    const warehouse = await warehouseService.createWarehouse({ name: 'CM WH ' + uniq(), type: 'overseas', country: 'US' })
    const spu = await spuService.createSpu({
      categoryId: category.id,
      brandId: brand.id,
      name: { 'en-US': 'CM Wig ' + uniq(), 'zh-CN': 'CM 假发' },
      description: { 'en-US': 'glueless wig' },
    })
    const a = await skuService.createSku({ spuId: spu.id, code: 'CMSKU_A' + uniq(), spec: { color: '1B' } })
    const b = await skuService.createSku({ spuId: spu.id, code: 'CMSKU_B' + uniq(), spec: { color: '613' } })
    skuA = a.id
    skuB = b.id
    await priceService.upsertPrice(skuA, { currency: 'USD', amount: 129.9 })
    await priceService.upsertPrice(skuB, { currency: 'USD', amount: 59.0 })
    await inventoryService.adjust(skuA, warehouse.id, 50)
    await inventoryService.adjust(skuB, warehouse.id, 50)

    const channel = await ShopChannel.create({ tenantId: TID, name: 'CM Channel ' + uniq(), type: 'independent', status: 'active' } as never)
    const shop = await ShopShop.create({ tenantId: TID, channelId: channel.id, name: 'CM Shop ' + uniq(), credentials: { defaultCurrency: 'USD', defaultLocale: 'en-US' } } as never)
    channelId = channel.id
    shopId = shop.id
    site = { tenantId: TID, channelId, shopId, defaultCurrency: 'USD', defaultLocale: 'en-US' }
  })
})

describe('P3-T03 购物车合并', () => {
  it('游客车有 A×2，登录后合并到空顾客车，且游客车被销毁', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const guest = await cartService.addItem(site, undefined, { skuId: skuA, qty: 2 })
      const cid = await seedCustomer(`guest-merge-${uniq()}@example.com`)

      const merged = await cartService.mergeCartOnLogin(site, cid, guest.token)
      expect(merged.customerId).toBe(cid)
      const view = await cartService.toCartView(merged)
      expect(view.items).toHaveLength(1)
      expect(view.items[0].skuId).toBe(skuA)
      expect(view.items[0].qty).toBe(2)

      // 游客车已销毁
      expect(await cartService.getCart(guest.token)).toBeNull()
    })
  })

  it('同 SKU 在两边各 3 → 合并为 6（累加）', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const guest = await cartService.addItem(site, undefined, { skuId: skuA, qty: 3 })
      const cid = await seedCustomer(`same-sku-${uniq()}@example.com`)
      // 先给顾客车加 3
      const cust = await cartService.addItem(site, undefined, { skuId: skuA, qty: 3 }, cid)
      // 把顾客车绑定到该顾客
      await cust.update({ customerId: cid } as never)

      const merged = await cartService.mergeCartOnLogin(site, cid, guest.token)
      const view = await cartService.toCartView(merged)
      expect(view.items).toHaveLength(1)
      expect(view.items[0].qty).toBe(6)
    })
  })

  it('合并数量封顶 CART_LINE_MAX（3+1000 → 99），不丢行', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const guest = await cartService.addItem(site, undefined, { skuId: skuA, qty: 1000 })
      const cid = await seedCustomer(`cap-${uniq()}@example.com`)
      const cust = await cartService.addItem(site, undefined, { skuId: skuA, qty: 3 }, cid)
      await cust.update({ customerId: cid } as never)

      const merged = await cartService.mergeCartOnLogin(site, cid, guest.token)
      const view = await cartService.toCartView(merged)
      expect(view.items).toHaveLength(1)
      expect(view.items[0].qty).toBe(cartService.CART_LINE_MAX)
    })
  })

  it('游客独有 SKU 整体迁入，既有顾客行属性优先（冲突优先级）', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      // 顾客车有 A×1（既有快照价格 12990）
      const cust = await cartService.addItem(site, undefined, { skuId: skuA, qty: 1 })
      const cid = await seedCustomer(`conflict-${uniq()}@example.com`)
      await cust.update({ customerId: cid } as never)

      // 游客车有 A×2（不同快照）与 B×4
      const guest = await cartService.addItem(site, undefined, { skuId: skuA, qty: 2 })
      await cartService.addItem(site, guest.token, { skuId: skuB, qty: 4 })

      const merged = await cartService.mergeCartOnLogin(site, cid, guest.token)
      const view = await cartService.toCartView(merged)
      expect(view.items).toHaveLength(2)
      const bySku = Object.fromEntries(view.items.map((i) => [i.skuId, i]))
      expect(bySku[skuA].qty).toBe(3) // 1 + 2，累加
      expect(bySku[skuA].unitAmountCents).toBe(12990) // 保留顾客既有快照价格，不被游客覆盖
      expect(bySku[skuB].qty).toBe(4) // 游客独有迁入
    })
  })

  it('无 guestToken / token 无效 → 不合并，仅返回（或新建）顾客车', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const cid = await seedCustomer(`no-token-${uniq()}@example.com`)
      const merged = await cartService.mergeCartOnLogin(site, cid) // 无 token
      expect(merged.customerId).toBe(cid)
      expect(merged.token).toHaveLength(48)

      const cid2 = await seedCustomer(`bad-token-${uniq()}@example.com`)
      const merged2 = await cartService.mergeCartOnLogin(site, cid2, 'nonexistent-token')
      expect(merged2.customerId).toBe(cid2)
    })
  })

  it('游客车已归属某顾客 → 不视为游客车，跳过合并', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const owner = await seedCustomer(`owner-${uniq()}@example.com`)
      const guest = await cartService.addItem(site, undefined, { skuId: skuA, qty: 2 })
      await guest.update({ customerId: owner } as never) // 已归属，非游客车

      const cid = await seedCustomer(`other-${uniq()}@example.com`)
      const merged = await cartService.mergeCartOnLogin(site, cid, guest.token)
      const view = await cartService.toCartView(merged)
      expect(view.items).toHaveLength(0) // 未合并
      // 原车仍存在且仍归属 owner
      expect(await cartService.getCart(guest.token)).not.toBeNull()
    })
  })

  it('控制器 login 透传 cartToken 并回传合并后的 cartToken', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const email = `ctrl-${uniq()}@example.com`
      await customerService.registerCustomer({ tenantId: TID, email, password: 'Password123' })
      const guest = await cartService.addItem(site, undefined, { skuId: skuA, qty: 1 })

      const req: any = { body: { email, password: 'Password123', cartToken: guest.token }, res: { cookie() {} }, headers: {} }
      let payload: any = null
      const res: any = {
        locals: { site },
        json: (p: any) => {
          payload = p
          return res
        },
        cookie() {
          return res
        },
      }
      req.res = res
      await authController.login(req, res, () => {})

      expect(payload.code).toBe(0)
      expect(payload.data.cartToken).toHaveLength(48)
      expect(payload.data.cartToken).not.toBe(guest.token) // 已落到顾客车
      const mergedCart = await cartService.getCart(payload.data.cartToken)
      expect(mergedCart).not.toBeNull()
      const view = await cartService.toCartView(mergedCart!)
      expect(view.items).toHaveLength(1)
      expect(view.items[0].skuId).toBe(skuA)
    })
  })
})
