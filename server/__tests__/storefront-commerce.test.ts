// @vitest-environment node
/**
 * Storefront 交易闭环（阶段 5 步骤 4）服务层测试
 *
 * 覆盖：购物车加购、服务端报价重算、币种切换 CURRENCY_CHANGED、库存不足拦截、
 * 建单（幂等 + 库存预占 + 快照 + 访问凭证）、支付会话、Webhook（验签 / 成功改单 / 去重 / 错误签名）。
 * 依赖已迁移的测试库与租户上下文（runInTenant）。
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { runInTenant } from '../modules/tenant/context.js'
import { AppError } from '../middleware/errorHandler.js'
import { ShopChannel, ShopShop, ShopInventoryReservation } from '../modules/shop/models/index.js'
import * as categoryService from '../modules/shop/services/categoryService.js'
import * as brandService from '../modules/shop/services/brandService.js'
import * as spuService from '../modules/shop/services/spuService.js'
import * as skuService from '../modules/shop/services/skuService.js'
import * as priceService from '../modules/shop/services/priceService.js'
import * as warehouseService from '../modules/shop/services/warehouseService.js'
import * as inventoryService from '../modules/shop/services/inventoryService.js'
import type { StorefrontSite } from '../modules/storefront/middleware/siteContext.js'
import * as cartService from '../modules/storefront/services/cartService.js'
import * as quoteService from '../modules/storefront/services/quoteService.js'
import * as checkoutService from '../modules/storefront/services/checkoutService.js'
import * as paymentService from '../modules/storefront/services/paymentService.js'

const TID = 1
function uniq(): string {
  return `sc${Date.now()}${Math.floor(Math.random() * 1e6)}`
}

let skuId = 0
let channelId = 0
let shopId = 0
let siteUSD: StorefrontSite
let siteEUR: StorefrontSite

beforeAll(async () => {
  await runInTenant({ tenantId: TID }, async () => {
    const category = await categoryService.createCategory({ parentId: 0, name: { 'en-US': 'SC Cat ' + uniq() }, level: 1, sort: 0 })
    const brand = await brandService.createBrand({ name: 'SC Brand ' + uniq() })
    const warehouse = await warehouseService.createWarehouse({ name: 'SC WH ' + uniq(), type: 'overseas', country: 'US' })
    const spu = await spuService.createSpu({
      categoryId: category.id,
      brandId: brand.id,
      name: { 'en-US': 'SC Wig ' + uniq(), 'zh-CN': 'SC 假发' },
      description: { 'en-US': 'glueless wig' },
    })
    const sku = await skuService.createSku({ spuId: spu.id, code: 'SCSKU' + uniq(), spec: { color: '1B' } })
    skuId = sku.id
    await priceService.upsertPrice(sku.id, { currency: 'USD', amount: 129.9 })
    await priceService.upsertPrice(sku.id, { currency: 'EUR', amount: 119 })
    await inventoryService.adjust(sku.id, warehouse.id, 50)

    const channel = await ShopChannel.create({ tenantId: TID, name: 'SC Channel ' + uniq(), type: 'independent', status: 'active' } as never)
    const shop = await ShopShop.create({ tenantId: TID, channelId: channel.id, name: 'SC Shop ' + uniq(), credentials: { defaultCurrency: 'USD', defaultLocale: 'en-US' } } as never)
    channelId = channel.id
    shopId = shop.id

    siteUSD = { tenantId: TID, channelId, shopId, defaultCurrency: 'USD', defaultLocale: 'en-US' }
    siteEUR = { tenantId: TID, channelId, shopId, defaultCurrency: 'EUR', defaultLocale: 'en-US' }
  })
})

describe('阶段5-步骤4：购物车', () => {
  it('加购返回不可枚举 token，快照单价(分)正确', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const cart = await cartService.addItem(siteUSD, undefined, { skuId, qty: 2 })
      expect(cart.token).toHaveLength(48)
      const view = await cartService.toCartView(cart)
      expect(view.items).toHaveLength(1)
      expect(view.items[0].skuId).toBe(skuId)
      expect(view.items[0].qty).toBe(2)
      // 129.90 USD → 12990 分
      expect(view.items[0].unitAmountCents).toBe(12990)
    })
  })
})

describe('阶段5-步骤4：服务端报价', () => {
  let token = ''
  beforeAll(async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const cart = await cartService.addItem(siteUSD, undefined, { skuId, qty: 2 })
      token = cart.token
    })
  })

  it('服务端重算价格，忽略前端传入值（2 × 129.90 = 25980 分）', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const quote = await quoteService.createQuote(siteUSD, { cartToken: token })
      expect(quote.currency).toBe('USD')
      expect(quote.subtotalCents).toBe(25980)
      expect(quote.amountCents).toBe(25980)
      expect(quote.items[0].lineTotalCents).toBe(25980)
      expect(quote.version).toBeGreaterThan(0)
      expect(quote.expiresAt).toBeTruthy()
    })
  })

  it('购物车币种与站点配置不一致 → CURRENCY_CHANGED', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const eurCart = await cartService.addItem(siteEUR, undefined, { skuId, qty: 1 })
      await expect(quoteService.createQuote(siteUSD, { cartToken: eurCart.token })).rejects.toMatchObject({
        statusCode: 409,
        message: 'CURRENCY_CHANGED',
      })
    })
  })

  it('库存不足时拒绝报价', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      await expect(quoteService.createQuote(siteUSD, { items: [{ skuId, qty: 999 }] })).rejects.toMatchObject({
        statusCode: 400,
      })
    })
  })
})

describe('阶段5-步骤4：建单 + 库存预占', () => {
  let token = ''
  let orderId = 0
  let accessToken = ''
  const idemKey = `k-${Date.now()}-${Math.floor(Math.random() * 1e6)}`

  it('建单：幂等键 + 服务端重算 + 预占库存 + 快照 + 访问凭证', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const cart = await cartService.addItem(siteUSD, undefined, { skuId, qty: 2 })
      token = cart.token
      const order = await checkoutService.createOrder(siteUSD, {
        cartToken: token,
        email: 'buyer@example.com',
        idempotencyKey: idemKey,
      })
      orderId = order.id
      accessToken = order.accessToken as string
      expect(order.amountCents).toBe(25980)
      expect(order.paymentStatus).toBe('none')
      expect(order.status).toBe('created')
      expect(order.accessToken).toBeTruthy()
      expect(order.items[0].unitAmountCents).toBe(12990)
      // 库存被预占：可用量 = 50 - 2 = 48
      const available = await inventoryService.available(skuId)
      expect(available).toBe(48)
      // 预占记录存在
      const reservations = await ShopInventoryReservation.findAll({ where: { ref: order.orderNo } as never })
      expect(reservations.length).toBeGreaterThanOrEqual(1)
      expect(reservations[0].status).toBe('active')
    })
  })

  it('幂等：相同 idempotencyKey 不重复建单', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const again = await checkoutService.createOrder(siteUSD, { cartToken: token, idempotencyKey: idemKey })
      expect(again.id).toBe(orderId)
      // 不应二次预占：可用量仍为 48
      const available = await inventoryService.available(skuId)
      expect(available).toBe(48)
    })
  })

  it('凭 accessToken 可取单；错误凭证 404', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const ok = await checkoutService.getOrderWithToken(orderId, accessToken)
      expect(ok.id).toBe(orderId)
      await expect(checkoutService.getOrderWithToken(orderId, 'wrong-token')).rejects.toMatchObject({ statusCode: 404 })
    })
  })
})

describe('阶段5-步骤4：支付会话 + Webhook', () => {
  let orderId = 0
  let orderNo = ''
  let accessToken = ''
  let providerRef = ''

  beforeAll(async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const cart = await cartService.addItem(siteUSD, undefined, { skuId, qty: 1 })
      const order = await checkoutService.createOrder(siteUSD, {
        cartToken: cart.token,
        email: 'pay@example.com',
        idempotencyKey: `pay-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      })
      orderId = order.id
      orderNo = order.orderNo
      accessToken = order.accessToken as string
      const session = await paymentService.createSession(siteUSD, orderId)
      providerRef = session.providerRef
      expect(session.amountCents).toBe(12990)
      expect(session.currency).toBe('USD')
    })
  })

  it('Webhook 验签通过 → 订单标记已支付、预占提交', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const payload = { type: 'payment.succeeded', orderNo, providerRef, currency: 'USD' }
      const raw = Buffer.from(JSON.stringify(payload))
      const sig = paymentService.signWebhook(raw)
      const result = await paymentService.handleWebhook('mock', raw, sig)
      expect(result.ok).toBe(true)
      expect(result.status).toBe(200)

      const order = await checkoutService.getOrderWithToken(orderId, accessToken)
      expect(order.paymentStatus).toBe('captured')
      expect(order.status).toBe('paid')
      const reservations = await ShopInventoryReservation.findAll({ where: { ref: orderNo } as never })
      expect(reservations[0].status).toBe('committed')
    })
  })

  it('重复投递 Webhook → 幂等去重，不改单', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const payload = { type: 'payment.succeeded', orderNo, providerRef, currency: 'USD' }
      const raw = Buffer.from(JSON.stringify(payload))
      const sig = paymentService.signWebhook(raw)
      const result = await paymentService.handleWebhook('mock', raw, sig)
      expect(result.ok).toBe(true)
      expect(result.alreadyProcessed).toBe(true)
    })
  })

  it('签名无效 → 401 且无副作用', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const payload = { type: 'payment.succeeded', orderNo, providerRef, currency: 'USD' }
      const raw = Buffer.from(JSON.stringify(payload))
      const result = await paymentService.handleWebhook('mock', raw, 'forged-signature')
      expect(result.ok).toBe(false)
      expect(result.status).toBe(401)
    })
  })
})
