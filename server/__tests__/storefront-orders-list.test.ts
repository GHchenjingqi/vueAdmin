// @vitest-environment node
/**
 * P4-T03 顾客订单列表（listMyOrders）
 *
 * 覆盖：仅返回本人订单（buyer.customerId 归属）、金额按订单快照币种展示、
 * 分页与空态、他人订单不可见（归属隔离）、返回本人 accessToken 供详情双要素复用。
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { runInTenant } from '../modules/tenant/context.js'
import { ShopChannel, ShopShop } from '../modules/shop/models/index.js'
import * as categoryService from '../modules/shop/services/categoryService.js'
import * as brandService from '../modules/shop/services/brandService.js'
import * as spuService from '../modules/shop/services/spuService.js'
import * as skuService from '../modules/shop/services/skuService.js'
import * as priceService from '../modules/shop/services/priceService.js'
import * as warehouseService from '../modules/shop/services/warehouseService.js'
import * as inventoryService from '../modules/shop/services/inventoryService.js'
import * as customerService from '../modules/shop/services/customerService.js'
import type { StorefrontSite } from '../modules/storefront/middleware/siteContext.js'
import * as cartService from '../modules/storefront/services/cartService.js'
import * as checkoutService from '../modules/storefront/services/checkoutService.js'

const TID = 1
function uniq(): string {
  return `ol${Date.now()}${Math.floor(Math.random() * 1e6)}`
}

let skuId = 0
let site: StorefrontSite

async function seedCustomer(email: string): Promise<number> {
  const c = await customerService.registerCustomer({ tenantId: TID, email, password: 'Password123', nickname: email })
  return c.customer.id
}

beforeAll(async () => {
  await runInTenant({ tenantId: TID }, async () => {
    const category = await categoryService.createCategory({ parentId: 0, name: { 'en-US': 'OL Cat ' + uniq() }, level: 1, sort: 0 })
    const brand = await brandService.createBrand({ name: 'OL Brand ' + uniq() })
    const warehouse = await warehouseService.createWarehouse({ name: 'OL WH ' + uniq(), type: 'overseas', country: 'US' })
    const spu = await spuService.createSpu({
      categoryId: category.id,
      brandId: brand.id,
      name: { 'en-US': 'OL Wig ' + uniq(), 'zh-CN': 'OL 假发' },
      description: { 'en-US': 'glueless wig' },
    })
    const sku = await skuService.createSku({ spuId: spu.id, code: 'OLSKU' + uniq(), spec: { color: '1B' } })
    skuId = sku.id
    await priceService.upsertPrice(sku.id, { currency: 'USD', amount: 129.9 })
    await inventoryService.adjust(sku.id, warehouse.id, 50)

    const channel = await ShopChannel.create({ tenantId: TID, name: 'OL Channel ' + uniq(), type: 'independent', status: 'active' } as never)
    const shop = await ShopShop.create({ tenantId: TID, channelId: channel.id, name: 'OL Shop ' + uniq(), credentials: { defaultCurrency: 'USD', defaultLocale: 'en-US' } } as never)
    site = { tenantId: TID, channelId: channel.id, shopId: shop.id, defaultCurrency: 'USD', defaultLocale: 'en-US' }
  })
})

describe('P4-T03 listMyOrders', () => {
  let customerId = 0
  let orderId = 0

  it('建单归属顾客（buyer.customerId）', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      customerId = await seedCustomer(`buyer-${uniq()}@example.com`)
      const cart = await cartService.addItem(site, undefined, { skuId, qty: 2 })
      const order = await checkoutService.createOrder(site, {
        cartToken: cart.token,
        email: 'buyer@example.com',
        customerId,
        idempotencyKey: `ol-${uniq()}`,
      })
      orderId = order.id
      expect(order.id).toBeGreaterThan(0)
    })
  })

  it('列表返回本人订单且金额按快照币种（USD 分）', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const res = await checkoutService.listMyOrders({ tenantId: TID, customerId }, 1, 10)
      expect(res.total).toBeGreaterThanOrEqual(1)
      const mine = res.items.find((o) => o.id === orderId)
      expect(mine).toBeTruthy()
      expect(mine!.currency).toBe('USD')
      expect(mine!.amountCents).toBe(25980)
      expect(mine!.items[0].unitAmountCents).toBe(12990)
      // 详情双要素复用：列表返回本人 accessToken
      expect(mine!.accessToken).toBeTruthy()
    })
  })

  it('他人订单不可见（归属隔离）', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const other = await seedCustomer(`other-${uniq()}@example.com`)
      const res = await checkoutService.listMyOrders({ tenantId: TID, customerId: other }, 1, 10)
      expect(res.items.some((o) => o.id === orderId)).toBe(false)
    })
  })

  it('分页与空态：超大 page 返回空列表', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const res = await checkoutService.listMyOrders({ tenantId: TID, customerId }, 999, 10)
      expect(res.items).toHaveLength(0)
      expect(res.page).toBe(999)
    })
  })

  it('未登录（无归属）场景由控制器 401，服务层空归属返回空列表', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const res = await checkoutService.listMyOrders({ tenantId: TID, customerId: -1 }, 1, 10)
      expect(res.total).toBe(0)
    })
  })
})
