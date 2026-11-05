// @vitest-environment node
/**
 * Storefront 订阅与到货通知（阶段 5 步骤 5 首个切片）服务层测试
 *
 * 覆盖：邮件订阅（订阅/重复幂等/退订/重订/无效令牌 404）、到货提醒
 * （订阅/未知 SKU 404/库存补货触发钩子标记 notified + 去重）。
 * 依赖已迁移的测试库与租户上下文（runInTenant）。订阅服务在 import 时向
 * inventoryService 注册补货钩子，因此 adjust(+qty) 会真实触发到货通知。
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { runInTenant } from '../modules/tenant/context.js'
import { AppError } from '../middleware/errorHandler.js'
import { ShopChannel, ShopShop, ShopNewsletter, ShopRestockSubscription } from '../modules/shop/models/index.js'
import * as categoryService from '../modules/shop/services/categoryService.js'
import * as brandService from '../modules/shop/services/brandService.js'
import * as spuService from '../modules/shop/services/spuService.js'
import * as skuService from '../modules/shop/services/skuService.js'
import * as priceService from '../modules/shop/services/priceService.js'
import * as warehouseService from '../modules/shop/services/warehouseService.js'
import * as inventoryService from '../modules/shop/services/inventoryService.js'
import type { StorefrontSite } from '../modules/storefront/middleware/siteContext.js'
import * as subscriptionService from '../modules/storefront/services/subscriptionService.js'

const TID = 1
function uniq(): string {
  return `sb${Date.now()}${Math.floor(Math.random() * 1e6)}`
}

let skuId = 0
let warehouseId = 0
let site: StorefrontSite

beforeAll(async () => {
  await runInTenant({ tenantId: TID }, async () => {
    const category = await categoryService.createCategory({ parentId: 0, name: { 'en-US': 'SB Cat ' + uniq() }, level: 1, sort: 0 })
    const brand = await brandService.createBrand({ name: 'SB Brand ' + uniq() })
    const warehouse = await warehouseService.createWarehouse({ name: 'SB WH ' + uniq(), type: 'overseas', country: 'US' })
    warehouseId = warehouse.id
    const spu = await spuService.createSpu({
      categoryId: category.id,
      brandId: brand.id,
      name: { 'en-US': 'SB Wig ' + uniq(), 'zh-CN': 'SB 假发' },
      description: { 'en-US': 'glueless wig' },
    })
    const sku = await skuService.createSku({ spuId: spu.id, code: 'SBSKU' + uniq(), spec: { color: '1B' } })
    skuId = sku.id
    await priceService.upsertPrice(sku.id, { currency: 'USD', amount: 99 })
    await inventoryService.adjust(sku.id, warehouse.id, 10) // 初始库存 10（此时无等待订阅，钩子 no-op）

    const channel = await ShopChannel.create({ tenantId: TID, name: 'SB Channel ' + uniq(), type: 'independent', status: 'active' } as never)
    const shop = await ShopShop.create({
      tenantId: TID,
      channelId: channel.id,
      name: 'SB Shop ' + uniq(),
      credentials: { defaultCurrency: 'USD', defaultLocale: 'en-US' },
    } as never)
    site = { tenantId: TID, channelId: channel.id, shopId: shop.id, defaultCurrency: 'USD', defaultLocale: 'en-US' }
  })
})

describe('阶段5-步骤5：邮件订阅', () => {
  it('订阅返回 subscribed + 不可枚举 token', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const r = await subscriptionService.subscribeNewsletter(site, { email: 'a@ex.com', source: 'footer' })
      expect(r.status).toBe('subscribed')
      expect(r.token).toHaveLength(48)
      const row = await ShopNewsletter.findOne({ where: { tenantId: TID, email: 'a@ex.com' } })
      expect(row).toBeTruthy()
      expect(row!.status).toBe('subscribed')
    })
  })

  it('重复订阅同邮箱不新增行（幂等）', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      await subscriptionService.subscribeNewsletter(site, { email: 'a@ex.com' })
      const count = await ShopNewsletter.count({ where: { tenantId: TID, email: 'a@ex.com' } })
      expect(count).toBe(1)
    })
  })

  it('退订后状态 unsubscribed，再次订阅可恢复', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const { token } = await subscriptionService.subscribeNewsletter(site, { email: 'b@ex.com' })
      await subscriptionService.unsubscribeNewsletter(site, token)
      const after = await ShopNewsletter.findOne({ where: { tenantId: TID, email: 'b@ex.com' } })
      expect(after!.status).toBe('unsubscribed')
      const again = await subscriptionService.subscribeNewsletter(site, { email: 'b@ex.com' })
      expect(again.status).toBe('subscribed')
    })
  })

  it('凭无效 token 退订 → 404', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      await expect(subscriptionService.unsubscribeNewsletter(site, 'no-such-token')).rejects.toMatchObject({
        statusCode: 404,
      })
    })
  })
})

describe('阶段5-步骤5：到货提醒', () => {
  it('订阅到货提醒：waiting + 返回 inStock', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const r = await subscriptionService.subscribeRestock(site, { email: 'c@ex.com', skuId })
      expect(r.status).toBe('waiting')
      expect(r.token).toHaveLength(48)
      expect(r.inStock).toBe(true)
      const row = await ShopRestockSubscription.findOne({ where: { tenantId: TID, email: 'c@ex.com', skuId } })
      expect(row!.status).toBe('waiting')
    })
  })

  it('订阅不存在的 SKU → 404', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      await expect(subscriptionService.subscribeRestock(site, { email: 'x@ex.com', skuId: 99999999 })).rejects.toMatchObject({
        statusCode: 404,
      })
    })
  })

  it('库存补货触发钩子：waiting 订阅被标记为 notified（且去重不再返回）', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      // 先把库存清零，确保从 0 开始观察补货触发
      const before = await inventoryService.available(skuId)
      await inventoryService.adjust(skuId, warehouseId, -before)
      expect(await inventoryService.available(skuId)).toBe(0)

      const r = await subscriptionService.subscribeRestock(site, { email: 'd@ex.com', skuId })
      expect(r.status).toBe('waiting')
      expect(r.inStock).toBe(false)

      // 补货：adjust(+5) 触发 inventoryService 的补货钩子 → 标记 notified
      await inventoryService.adjust(skuId, warehouseId, 5)

      const row = await ShopRestockSubscription.findOne({ where: { tenantId: TID, email: 'd@ex.com', skuId } })
      expect(row!.status).toBe('notified')
      expect(row!.notifiedAt).toBeTruthy()

      // 已 notified 的订阅在后续 notifyRestock 中不再返回（去重）
      const targets = await subscriptionService.notifyRestock(skuId, TID)
      expect(targets.find((t) => t.email === 'd@ex.com')).toBeFalsy()
    })
  })
})
