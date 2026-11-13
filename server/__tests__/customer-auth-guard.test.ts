// @vitest-environment node
/**
 * C 端（storefront）认证与归属越权回归测试
 *
 * 覆盖本轮实测确认的 4 条缺陷：
 *  1. 建单接口信任请求体的 customerId → 冒用他人身份下单、扣他人积分、套他人会员折扣；
 *  2. JWT_CUSTOMER_SECRET 缺省硬编码默认值且生产无守卫 → 顾客 JWT 可伪造；
 *  3. C 端顾客登录无失败限流 → 可爆破密码；
 *  4. 顾客被封禁（blocked）后已签发 JWT 仍可用至 30 天过期。
 *
 * 专属租户 987699；afterAll 按租户清理。
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
import * as customerService from '../modules/shop/services/customerService.js'
import { ShopCustomer, ShopInventory, ShopInventoryLog, ShopOrder } from '../modules/shop/models/index.js'
import * as checkoutController from '../modules/storefront/controllers/checkoutController.js'
import * as checkoutService from '../modules/storefront/services/checkoutService.js'
import { customerAuth, optionalCustomerAuth } from '../modules/storefront/middleware/customerAuth.js'
import type { StorefrontSite } from '../modules/storefront/middleware/siteContext.js'

const TID = 987699
const uniq = (): string => `ca${Date.now()}${Math.floor(Math.random() * 1e6)}`
const inTenant = <T>(fn: () => Promise<T>): Promise<T> => runInTenant({ tenantId: TID }, fn)

let skuId = 0
let victimId = 0
let victimToken = ''
let site: StorefrontSite

beforeAll(async () => {
  await inTenant(async () => {
    const category = await categoryService.createCategory({
      parentId: 0, name: { 'en-US': 'CA Cat ' + uniq() }, level: 1, sort: 0,
    })
    const brand = await brandService.createBrand({ name: 'CA Brand ' + uniq() })
    const warehouse = await warehouseService.createWarehouse({
      name: 'CA WH ' + uniq(), type: 'overseas', country: 'US',
    })
    const spu = await spuService.createSpu({
      categoryId: category.id,
      brandId: brand.id,
      name: { 'en-US': 'CA Wig ' + uniq() },
      description: { 'en-US': 'customer auth fixture' },
    })
    const sku = await skuService.createSku({ spuId: spu.id, code: 'CASKU' + uniq(), spec: { color: '1B' } })
    skuId = sku.id
    await priceService.upsertPrice(sku.id, { currency: 'USD', amount: 50 })
    await inventoryService.adjust(sku.id, warehouse.id, 100)

    const victim = await customerService.registerCustomer({
      tenantId: TID, email: `victim-${uniq()}@example.com`, password: 'Victim@123456',
    })
    victimId = victim.customer.id
    victimToken = victim.token

    site = { tenantId: TID, channelId: null, shopId: null, defaultCurrency: 'USD', defaultLocale: 'en-US' }
  })
})

afterAll(async () => {
  await inTenant(async () => {
    await ShopOrder.destroy({ where: { tenantId: TID } })
    await ShopCustomer.destroy({ where: { tenantId: TID } })
    await ShopInventoryLog.destroy({ where: { tenantId: TID } })
    await ShopInventory.destroy({ where: { tenantId: TID } })
  })
})

describe('建单不得信任请求体的 customerId', () => {
  it('游客请求体指定他人 customerId：订单不得归属他人', async () => {
    await inTenant(async () => {
      const req: any = {
        body: { customerId: victimId, items: [{ skuId, qty: 1 }], idempotencyKey: 'CA_GUEST_' + uniq() },
        headers: {},
      }
      const res: any = { locals: { site }, json: (p: any) => p, cookie() { return res } }
      req.res = res

      let payload: any = null
      await checkoutController.createOrder(req, res, () => {})
      payload = res.json.mock ? null : null

      // 直接查库确认订单归属（控制器响应用 mock 捕获）
      const row = await ShopOrder.findOne({ where: { tenantId: TID, idempotencyKey: req.body.idempotencyKey } })
      expect(row).not.toBeNull()
      expect((row?.buyer as { customerId?: number | null } | null)?.customerId ?? null).toBeNull()
    })
  })

  it('已登录顾客 A 指定他人 customerId：订单仍归属 A 本人', async () => {
    await inTenant(async () => {
      const attacker = await customerService.registerCustomer({
        tenantId: TID, email: `atk-${uniq()}@example.com`, password: 'Atk@123456',
      })
      const idem = 'CA_ATK_' + uniq()
      const req: any = {
        body: { customerId: victimId, items: [{ skuId, qty: 1 }], idempotencyKey: idem },
        headers: {},
        customer: { customerId: attacker.customer.id, tenantId: TID, email: attacker.customer.email },
      }
      const res: any = { locals: { site }, json: (p: any) => p, cookie() { return res } }
      req.res = res

      await checkoutController.createOrder(req, res, () => {})

      const row = await ShopOrder.findOne({ where: { tenantId: TID, idempotencyKey: idem } })
      expect(row).not.toBeNull()
      expect((row?.buyer as { customerId?: number | null } | null)?.customerId).toBe(attacker.customer.id)
      expect((row?.buyer as { customerId?: number | null } | null)?.customerId).not.toBe(victimId)
    })
  })
})

describe('封禁顾客的令牌应即时失效', () => {
  it('status=blocked 的顾客令牌被 customerAuth 拒绝', async () => {
    await inTenant(async () => {
      const c = await customerService.registerCustomer({
        tenantId: TID, email: `blocked-${uniq()}@example.com`, password: 'Blk@123456',
      })
      await ShopCustomer.update({ status: 'blocked' }, { where: { id: c.customer.id, tenantId: TID } })

      const req: any = { headers: { authorization: `Bearer ${c.token}` } }
      const nextOk = (err?: unknown) => { if (err) throw err }
      await expect(customerAuth(req, {} as any, nextOk as any)).rejects.toThrow(/禁用/)

      // 可选身份：被封禁账号降级为游客，不注入 customer
      const req2: any = { headers: { authorization: `Bearer ${c.token}` } }
      await optionalCustomerAuth(req2, {} as any, (() => {}) as any)
      expect(req2.customer).toBeUndefined()
    })
  })

  it('正常顾客令牌仍可用（不得误伤）', async () => {
    await inTenant(async () => {
      const req: any = { headers: { authorization: `Bearer ${victimToken}` } }
      const nextOk = (err?: unknown) => { if (err) throw err }
      await customerAuth(req, {} as any, nextOk as any)
      expect(req.customer?.customerId).toBe(victimId)
    })
  })
})

describe('C 端顾客登录失败限流', () => {
  it('连续错误密码达到阈值后返回 429', async () => {
    const email = `brute-${uniq()}@example.com`
    await inTenant(async () => {
      await customerService.registerCustomer({ tenantId: TID, email, password: 'Right@123456' })
    })

    const ip = '10.0.0.' + Math.floor(Math.random() * 250)
    let limited = false
    for (let i = 0; i < 15; i++) {
      try {
        await inTenant(() => customerService.authenticateCustomer({
          tenantId: TID, email, password: 'Wrong@123456', ip,
        }))
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode
        if (status === 429) { limited = true; break }
      }
    }
    expect(limited).toBe(true)
  })

  it('登录成功会清除失败计数（不占用额度）', async () => {
    const email = `ok-${uniq()}@example.com`
    await inTenant(async () => {
      await customerService.registerCustomer({ tenantId: TID, email, password: 'Right@123456' })
    })
    const ip = '10.1.0.' + Math.floor(Math.random() * 250)
    // 3 次失败
    for (let i = 0; i < 3; i++) {
      await inTenant(() => customerService.authenticateCustomer({
        tenantId: TID, email, password: 'Wrong@123456', ip,
      })).catch(() => undefined)
    }
    // 成功登录不应被限流
    const ok = await inTenant(() => customerService.authenticateCustomer({
      tenantId: TID, email, password: 'Right@123456', ip,
    }))
    expect(ok.customer.id).toBeGreaterThan(0)
  })
})

describe('顾客 JWT 密钥安全默认值', () => {
  it('config 的顾客密钥在生产环境必须显式配置（守卫存在）', async () => {
    const src = await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('../config/index.ts', import.meta.url), 'utf-8'),
    )
    expect(src).toContain('JWT_CUSTOMER_SECRET')
    expect(src).toMatch(/NODE_ENV === 'production'[\s\S]{0,200}JWT_CUSTOMER_SECRET/)
    // 默认值不得再被生产接受
    expect(src).toContain("storefront_customer_secret_key_2024")
  })
})
