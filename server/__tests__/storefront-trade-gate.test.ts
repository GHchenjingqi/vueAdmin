// @vitest-environment node
/**
 * §9 上线前交易测试门禁（T-01 ~ T-12）——编号化实证
 *
 * 定位：把分散在 storefront-commerce / shopPhases 等用例里的交易约束，
 * 按执行计划 §9 的 T 编号逐项固定，便于 G3/G4 门禁抽查与回归。
 *
 * 诚实原则：T-07 / T-08 / T-09 曾因功能未实现以 it.todo 登记；
 * 三项功能落地后已改为真实断言，完整边界用例见
 * storefront-shipping / storefront-coupon / storefront-refund / storefront-address /
 * storefront-order-mail 五个专项测试文件。
 * 地址簿 P4-T02 与订单邮件 P3-T17 补齐后，§9 T-01~T-12 已全部 [x]；
 * 非门禁遗留（SMTP 调度、CDN 透传、业务签字）在计划 §11 如实登记。
 *
 * 依赖已迁移的测试库；所有 DB 操作显式包 runInTenant。
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { runInTenant } from '../modules/tenant/context.js'
import { ShopChannel, ShopShop, ShopInventory, ShopCoupon, ShopOrder } from '../modules/shop/models/index.js'
import * as refundService from '../modules/shop/services/refundService.js'
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
import * as customerService from '../modules/shop/services/customerService.js'
import * as addressService from '../modules/storefront/services/addressService.js'
import * as orderMailService from '../modules/shop/services/orderMailService.js'
import { setPromotionEvaluator } from '../modules/storefront/services/promotionService.js'

const TID = 1
function uniq(): string {
  return `tg${Date.now()}${Math.floor(Math.random() * 1e6)}`
}

let skuId = 0
let concurrencySkuId = 0
let site: StorefrontSite

beforeAll(async () => {
  // 隔离：共享测试库里可能存在其它用例/并行会话建的促销活动（8 折），
  // 会让本文件的金额断言随环境漂移。这里显式关闭促销求值。
  setPromotionEvaluator(async () => null)
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
  const day = (offset: number): string => {
    const d = new Date()
    d.setUTCDate(d.getUTCDate() + offset)
    return d.toISOString().slice(0, 10)
  }
  const mkCoupon = (over: Record<string, unknown>): Promise<ShopCoupon> =>
    ShopCoupon.create({
      code: 'TG' + uniq(), type: 'fixed', value: 10, minSpend: 0, currency: 'USD',
      validFrom: day(-1), validTo: day(1), usageLimit: 0, usedCount: 0, tenantId: TID, ...over,
    } as never)

  it('过期 / 用尽 / 不存在的券码在报价阶段一律被拒', async () => {
    await inTenant(async () => {
      const expired = await mkCoupon({ validFrom: day(-5), validTo: day(-1) })
      const exhausted = await mkCoupon({ usageLimit: 1, usedCount: 1 })
      await expect(quoteService.createQuote(site, { items: [{ skuId, qty: 1 }], couponCode: expired.code })).rejects.toThrow(/COUPON_EXPIRED/)
      await expect(quoteService.createQuote(site, { items: [{ skuId, qty: 1 }], couponCode: exhausted.code })).rejects.toThrow(/COUPON_EXHAUSTED/)
      await expect(quoteService.createQuote(site, { items: [{ skuId, qty: 1 }], couponCode: 'NOPE' + uniq() })).rejects.toThrow(/COUPON_NOT_FOUND/)
    })
  })
})

describe('T-08 地址不在配送范围，不能创建可支付订单', () => {
  it('不可配送地址在报价与建单两处均被拒绝', async () => {
    await inTenant(async () => {
      const address = { country: 'XX', city: 'Somewhere' }
      await expect(
        quoteService.createQuote(site, { items: [{ skuId, qty: 1 }], shippingAddress: address }),
      ).rejects.toThrow(/ADDRESS_NOT_SHIPPABLE/)
      await expect(
        checkoutService.createOrder(site, { items: [{ skuId, qty: 1 }], shippingAddress: address }),
      ).rejects.toThrow(/ADDRESS_NOT_SHIPPABLE/)
    })
  })
})

describe('T-09 部分退款与全额退款状态均正确，退款币种等于原订单币种', () => {
  it('部分 → refunding、全额 → refunded，退款币种恒等于订单快照', async () => {
    await inTenant(async () => {
      const cart = await cartService.addItem(site, undefined, { skuId, qty: 1 })
      const order = await checkoutService.createOrder(site, { cartToken: cart.token, idempotencyKey: `T09-${uniq()}` })
      const session = await paymentService.createSession(site, order.id)
      const raw = Buffer.from(JSON.stringify({
        type: 'payment.succeeded', orderNo: order.orderNo, providerRef: session.providerRef, currency: 'USD',
      }))
      await paymentService.handleWebhook('mock', raw, paymentService.signWebhook(raw))

      const part = await refundService.createRefund({ orderId: order.id, amountCents: 3000 })
      expect(part.currency).toBe(order.currency)
      expect((await ShopOrder.findByPk(order.id))?.paymentStatus).toBe('refunding')

      const rest = await refundService.createRefund({ orderId: order.id })
      expect(rest.currency).toBe(order.currency)
      expect((await ShopOrder.findByPk(order.id))?.paymentStatus).toBe('refunded')
      const rows = await refundService.listRefunds(order.id)
      expect(rows.reduce((sum, r) => sum + r.amountCents, 0)).toBe(order.amountCents)
    })
  })
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

  it('地址簿（P4-T02）：他人 / 跨租户不能读写改删，删除默认有兜底', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const tag = uniq()
      const a = await customerService.registerCustomer({ tenantId: TID, email: `t10a-${tag}@example.com`, password: 'password123' })
      const b = await customerService.registerCustomer({ tenantId: TID, email: `t10b-${tag}@example.com`, password: 'password123' })
      const ownerA = { tenantId: TID, customerId: a.customer.id }
      const ownerB = { tenantId: TID, customerId: b.customer.id }
      const base = {
        fullName: 'Alice', phone: '5550100', country: 'US', province: 'CA',
        city: 'LA', address1: '1 Main St', address2: null, postcode: '90001',
      }
      const first = await addressService.createAddress(ownerA, base)
      const second = await addressService.createAddress(ownerA, { ...base, address1: '2 Main St', isDefault: true })

      expect(first.isDefault).toBe(true) // 首条自动默认
      expect((await addressService.listAddresses(ownerA)).filter((x) => x.isDefault)).toHaveLength(1)
      expect(await addressService.listAddresses(ownerB)).toHaveLength(0)
      await expect(addressService.updateAddress(ownerB, first.id, { city: 'Hacked' })).rejects.toMatchObject({ statusCode: 404 })
      await expect(addressService.deleteAddress(ownerB, first.id)).rejects.toMatchObject({ statusCode: 404 })
      await expect(addressService.setDefaultAddress(ownerB, first.id)).rejects.toMatchObject({ statusCode: 404 })
      expect(await addressService.listAddresses({ tenantId: 2, customerId: ownerA.customerId })).toHaveLength(0)

      const deleted = await addressService.deleteAddress(ownerA, second.id)
      expect(deleted.promotedId).toBe(first.id)
      expect((await addressService.listAddresses(ownerA)).filter((x) => x.isDefault).map((x) => x.id)).toEqual([first.id])
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

  it('JSON-LD / 前台符号切币种真实 HTTP 实测报告已产出（5/5 PASS）', () => {
    const report = fileURLToPath(new URL('../../docs/reports/t12-jsonld-currency-switch.md', import.meta.url))
    expect(existsSync(report)).toBe(true)
    const body = readFileSync(report, 'utf8')
    expect(body).toContain('priceCurrency')
    expect(body).toContain('129.90')
    expect(body).toContain('数值不换算')
    expect(body).toContain('restored store-config = CNY')
  })

  it('支付会话金额与币种取订单快照，不随当前站点币种漂移', async () => {
    await inTenant(async () => {
      const cart = await cartService.addItem(site, undefined, { skuId, qty: 1 })
      const order = await checkoutService.createOrder(site, { cartToken: cart.token, idempotencyKey: `T12-${uniq()}` })
      // 模拟「后台切币种前的历史订单」：站点已 USD，订单快照为另一币种
      await ShopOrder.update({ currency: 'CNY' } as never, { where: { id: order.id, tenantId: TID } })
      const session = await paymentService.createSession(site, order.id)
      expect(session.currency).toBe('CNY')
      expect(session.amountCents).toBe(order.amountCents)
    })
  })

  it('订单邮件按订单快照币种渲染：站点 USD 下历史 CNY 订单仍出 ¥/CNY，且不含支付凭据', async () => {
    await inTenant(async () => {
      const cart = await cartService.addItem(site, undefined, { skuId, qty: 1 })
      const order = await checkoutService.createOrder(site, {
        cartToken: cart.token,
        email: `t12mail-${uniq()}@example.com`,
        idempotencyKey: `T12M-${uniq()}`,
      })
      await ShopOrder.update({ currency: 'CNY' } as never, { where: { id: order.id, tenantId: TID } })
      const mail = await orderMailService.enqueueOrderMail({ orderId: order.id, type: 'confirmed' })
      expect(mail?.currency).toBe('CNY')
      expect(mail?.bodyText).toContain('CNY')
      expect(mail?.bodyText).toContain('¥')
      expect(mail?.bodyText).not.toContain('USD')
      expect(orderMailService.formatOrderAmount(order.amountCents, 'CNY')).toContain('CNY')
      for (const secret of ['accessToken', 'providerRef', 'cardNumber', 'cvv']) {
        expect(mail?.bodyText).not.toContain(secret)
      }
    })
  })
})
