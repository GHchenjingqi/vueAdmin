// @vitest-environment node
/**
 * §9 上线前交易测试门禁（T-01 ~ T-12）——编号化实证
 *
 * 定位：把分散在 storefront-commerce / shopPhases 等用例里的交易约束，
 * 按执行计划 §9 的 T 编号逐项固定，便于 G3/G4 门禁抽查与回归。
 *
 * 诚实原则：当前实现尚不具备的能力（T-07 优惠券校验 / T-08 配送范围 /
 * T-09 退款状态流）以 it.todo 登记，**不写假通过**，并在 §9 标注阻塞依赖。
 *
 * 依赖已迁移的测试库；所有 DB 操作显式包 runInTenant。
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { runInTenant } from '../modules/tenant/context.js'
import { ShopChannel, ShopShop, ShopInventory } from '../modules/shop/models/index.js'
import * as categoryService from '../modules/shop/services/categoryService.js'
import * as brandService from '../modules/shop/services/brandService.js'
import * as spuService from '../modules/shop/services/spuService.js'
import * as skuService from '../modules/shop/services/skuService.js'
import * as priceService from '../modules/shop/services/priceService.js'
import * as warehouseService from '../modules/shop/services/warehouseService.js'
import * as inventoryService from '../modules/shop/services/inventoryService.js'
import { ISO_META, validateCurrencyConfig } from '../modules/storefront/services/currencyConfig.js'
import type { StorefrontSite } from '../modules/storefront/middleware/siteContext.js'
import * as cartService from '../modules/storefront/services/cartService.js'
import * as quoteService from '../modules/storefront/services/quoteService.js'
import * as checkoutService from '../modules/storefront/services/checkoutService.js'
import * as paymentService from '../modules/storefront/services/paymentService.js'

const TID = 1
function uniq(): string {
  return `tg${Date.now()}${Math.floor(Math.random() * 1e6)}`
}

let skuId = 0
let concurrencySkuId = 0
let site: StorefrontSite

beforeAll(async () => {
  await runInTenant({ tenantId: TID }, async () => {
    const category = await categoryService.createCategory({ parentId: 0, name: { 'en-US': 'TG Cat ' + uniq() }, level: 1, sort: 0 })
    const brand = await brandService.createBrand({ name: 'TG Brand ' + uniq() })
    const warehouse = await warehouseService.createWarehouse({ name: 'TG WH ' + uniq(), type: 'overseas', country: 'US' })

    const spu = await spuService.createSpu({
      categoryId: category.id,
      brandId: brand.id,
      name: { 'en-US': 'TG Wig ' + uniq(), 'zh-CN': 'TG 假发' },
      description: { 'en-US': 'trade gate fixture' },
    })
    const sku = await skuService.createSku({ spuId: spu.id, code: 'TGSKU' + uniq(), spec: { color: '1B' } })
    skuId = sku.id
    await priceService.upsertPrice(sku.id, { currency: 'USD', amount: 100 })
    await inventoryService.adjust(sku.id, warehouse.id, 200)

    // T-01 专用：独立 SKU，库存恰好 10，避免与其他用例互相干扰
    const cSku = await skuService.createSku({ spuId: spu.id, code: 'TGCON' + uniq(), spec: { color: '2' } })
    concurrencySkuId = cSku.id
    await inventoryService.adjust(cSku.id, warehouse.id, 10)

    const channel = await ShopChannel.create({ tenantId: TID, name: 'TG Channel ' + uniq(), type: 'independent', status: 'active' } as never)
    const shop = await ShopShop.create({ tenantId: TID, channelId: channel.id, name: 'TG Shop ' + uniq(), credentials: { defaultCurrency: 'USD', defaultLocale: 'en-US' } } as never)
    site = { tenantId: TID, channelId: channel.id, shopId: shop.id, defaultCurrency: 'USD', defaultLocale: 'en-US' }
  })
})

const inTenant = <T>(fn: () => Promise<T>): Promise<T> => runInTenant({ tenantId: TID }, fn)

describe('T-01 同一 SKU 并发购买，不超卖', () => {
  it('并发占用 12 次（库存 10）：成功数不超过 10，locked 不超 quantity，可用量守恒', async () => {
    await inTenant(async () => {
      const capacity = 10
      const results = await Promise.allSettled(
        Array.from({ length: 12 }, (_, i) => inventoryService.occupy(concurrencySkuId, 1, `T01-${uniq()}-${i}`)),
      )
      const succeeded = results.filter((r) => r.status === 'fulfilled').length

      expect(succeeded).toBeGreaterThan(0)
      expect(succeeded).toBeLessThanOrEqual(capacity)

      const rows = await ShopInventory.findAll({ where: { skuId: concurrencySkuId, tenantId: TID } } as never)
      const totalQuantity = rows.reduce((s, r) => s + Number(r.quantity), 0)
      const totalLocked = rows.reduce((s, r) => s + Number(r.locked), 0)
      expect(totalLocked).toBeLessThanOrEqual(totalQuantity)
      expect(totalLocked).toBe(succeeded)
      expect(await inventoryService.available(concurrencySkuId)).toBe(capacity - succeeded)
    })
  })
})

describe('T-02 / T-03 / T-04 幂等建单、Webhook 去重、服务端事实改单', () => {
  it('相同 idempotencyKey 不重复建单、不二次预占；Webhook 重复投递不改单；成功状态由服务端回写', async () => {
    await inTenant(async () => {
      const cart = await cartService.addItem(site, undefined, { skuId, qty: 2 })
      const idemKey = `T02-${uniq()}`
      const order = await checkoutService.createOrder(site, { cartToken: cart.token, email: 'gate@example.com', idempotencyKey: idemKey })
      const afterFirst = await inventoryService.available(skuId)

      const again = await checkoutService.createOrder(site, { cartToken: cart.token, idempotencyKey: idemKey })
      expect(again.id).toBe(order.id)
      expect(await inventoryService.available(skuId)).toBe(afterFirst)

      const session = await paymentService.createSession(site, order.id)
      const payload = { type: 'payment.succeeded', orderNo: order.orderNo, providerRef: session.providerRef, currency: 'USD' }
      const raw = Buffer.from(JSON.stringify(payload))
      const sig = paymentService.signWebhook(raw)

      // T-04：不依赖浏览器回跳，Webhook 独立把订单推到已支付
      const first = await paymentService.handleWebhook('mock', raw, sig)
      expect(first.ok).toBe(true)
      const paid = await checkoutService.getOrderWithToken(order.id, order.accessToken as string)
      expect(paid.paymentStatus).toBe('captured')
      expect(paid.status).toBe('paid')

      // T-03：同一事件重复投递幂等
      const duplicate = await paymentService.handleWebhook('mock', raw, sig)
      expect(duplicate.ok).toBe(true)
      expect(duplicate.alreadyProcessed).toBe(true)
      const stillPaid = await checkoutService.getOrderWithToken(order.id, order.accessToken as string)
      expect(stillPaid.paymentStatus).toBe('captured')
    })
  })
})

describe('T-05 支付失败或超时，库存预占能释放', () => {
  it('occupy → release 后可用量恢复，locked 回落到占用前', async () => {
    await inTenant(async () => {
      const ref = `T05-${uniq()}`
      const before = await inventoryService.available(skuId)
      await inventoryService.occupy(skuId, 3, ref)
      expect(await inventoryService.available(skuId)).toBe(before - 3)
      await inventoryService.release(skuId, 3, ref)
      expect(await inventoryService.available(skuId)).toBe(before)
    })
  })
})

describe('T-06 商品价格在加购后变化，结算能提示并重新报价', () => {
  it('服务端重算：改价后新报价采用新单价，前端旧总价被忽略', async () => {
    await inTenant(async () => {
      const cart = await cartService.addItem(site, undefined, { skuId, qty: 1 })
      const beforeQuote = await quoteService.createQuote(site, { cartToken: cart.token })
      const oldUnit = beforeQuote.items[0].unitAmountCents

      await priceService.upsertPrice(skuId, { currency: 'USD', amount: 150 })
      const afterQuote = await quoteService.createQuote(site, { cartToken: cart.token, items: [{ skuId, qty: 1 }] })

      expect(afterQuote.items[0].unitAmountCents).toBe(15000)
      expect(afterQuote.items[0].unitAmountCents).not.toBe(oldUnit)
      expect(afterQuote.amountCents).toBe(afterQuote.subtotalCents + afterQuote.shippingCents + afterQuote.taxCents)
      expect(afterQuote.version).toBeGreaterThan(0)
      expect(new Date(afterQuote.expiresAt).getTime()).toBeGreaterThan(Date.now())

      // 还原价格，避免影响后续用例
      await priceService.upsertPrice(skuId, { currency: 'USD', amount: 100 })
    })
  })
})

describe('T-07 优惠券过期或用尽，服务端拒绝使用', () => {
  // 阻塞：P3-T07 未实现。quoteService.createQuote 中 discountCents 恒为 0，且无券码校验入口。
  it.todo('阻塞于 P3-T07：需先实现服务端优惠券校验（过期/用尽/不适用市场/不适用币种），再补此用例')
})

describe('T-08 地址不在配送范围，不能创建可支付订单', () => {
  // 阻塞：P3-T05 未实现。createQuote 只接收 cartToken/items，无 shippingAddress 与配送范围判定。
  it.todo('阻塞于 P3-T05：需先实现 ShippingProvider 与 ADDRESS_NOT_SHIPPABLE 错误码，再补此用例')
})

describe('T-09 部分退款与全额退款状态均正确，退款币种等于原订单币种', () => {
  // 阻塞：paymentService 无 refund 流程；rmaService 只计算退款金额，订单 paymentStatus 的
  // refunding/refunded 由 admin 侧推进，且币种虽取 order.currency 快照，缺少状态流回归。
  it.todo('阻塞于 P3-T14/T17：需先实现退款状态流与部分退款金额校验，再补此用例')
})

describe('T-10 顾客不能访问其他顾客的订单、地址和购物车', () => {
  it('订单访问凭证错误一律 404；伪造购物车 token 404；token 不可枚举', async () => {
    await inTenant(async () => {
      const cart = await cartService.addItem(site, undefined, { skuId, qty: 1 })
      const order = await checkoutService.createOrder(site, {
        cartToken: cart.token,
        email: 'owner@example.com',
        idempotencyKey: `T10-${uniq()}`,
      })

      await expect(checkoutService.getOrderWithToken(order.id, 'forged-token')).rejects.toMatchObject({ statusCode: 404 })
      await expect(quoteService.createQuote(site, { cartToken: 'forged-cart-token' })).rejects.toMatchObject({ statusCode: 404 })
      expect(cart.token).toHaveLength(48)
      expect(cart.token).not.toMatch(/^\d+$/)
    })
  })
})

describe('T-11 CDN 不缓存账户、购物车和结算数据', () => {
  it('nuxt routeRules 对敏感路径全部 private, no-store', () => {
    const configPath = fileURLToPath(new URL('../../shops/nuxt.config.ts', import.meta.url))
    expect(existsSync(configPath)).toBe(true)
    const source = readFileSync(configPath, 'utf8')
    for (const path of ['/cart', '/checkout/**', '/account/**', '/track']) {
      expect(source).toContain(`'${path}': { headers: { 'cache-control': 'private, no-store' } }`)
    }
  })
})

describe('T-12 币种切换 fail-closed 与元数据一致性', () => {
  it('非法/缺失配置抛 503，合法配置规范化；ISO 白名单与前端预设一致', () => {
    expect(() => validateCurrencyConfig(null)).toThrow(/SHOP_CURRENCY_CONFIG_MISSING/)
    expect(() => validateCurrencyConfig({ code: 'XXX' })).toThrow(/SHOP_CURRENCY_CONFIG_INVALID/)
    const cfg = validateCurrencyConfig({ code: 'cny', symbol: '', decimalDigits: 9, symbolPosition: 'after' })
    expect(cfg.code).toBe('CNY')
    expect(cfg.symbol).toBe('¥')
    expect(cfg.decimalDigits).toBe(2)
    expect(Object.keys(ISO_META)).toEqual(['USD', 'CNY', 'EUR', 'GBP', 'CAD', 'AUD'])
  })

  it('T-12 全链路实测报告已产出（含二次确认、四处口径、回滚与旧购物车重建）', () => {
    const report = fileURLToPath(new URL('../../docs/reports/t12-currency-switch.md', import.meta.url))
    expect(existsSync(report)).toBe(true)
    const body = readFileSync(report, 'utf8')
    expect(body).toContain('CURRENCY_CHANGED')
    expect(body).toContain('confirmImpact')
  })
})
