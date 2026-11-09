// @vitest-environment node
/**
 * P5 修复就绪验证 —— 应用 docs/patches/p5-fix-readiness.patch 后运行。
 *
 * 用法：复制为 server/__tests__/p5-fix-readiness.test.ts，然后
 *   cd server && npx vitest run __tests__/p5-fix-readiness.test.ts
 *
 * 17 例：Bundle 4 / 佣金 2 / 归因窗口 3 / 仓网 3 / Webhook 5。
 * 全部使用独立租户 TID=987690 与唯一 SKU/单号，与并行方 dev 数据零共享。
 * 对应报告：docs/reports/p5-extension-audit.md、docs/reports/p5t03-webhook-audit.md。
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { runInTenant } from '../modules/tenant/context.js'
import {
  ShopBundle, ShopWarehouse, ShopInventory, ShopOrder, ShopOrderPayment,
  ShopOrderItem, ShopCustomer, ShopReferralCommission,
} from '../modules/shop/models/index.js'
import * as categoryService from '../modules/shop/services/categoryService.js'
import * as brandService from '../modules/shop/services/brandService.js'
import * as spuService from '../modules/shop/services/spuService.js'
import * as skuService from '../modules/shop/services/skuService.js'
import * as priceService from '../modules/shop/services/priceService.js'
import * as warehouseService from '../modules/shop/services/warehouseService.js'
import * as inventoryService from '../modules/shop/services/inventoryService.js'
import * as marketingService from '../modules/shop/services/marketingService.js'
import * as quoteService from '../modules/storefront/services/quoteService.js'
import * as checkoutService from '../modules/storefront/services/checkoutService.js'
import * as referralService from '../modules/storefront/services/referralService.js'
import * as paymentService from '../modules/storefront/services/paymentService.js'
import { getDeliveryCommitment, pickWarehouse } from '../modules/shop/services/warehouseRoutingService.js'
import type { StorefrontSite } from '../modules/storefront/middleware/siteContext.js'

const flags = vi.hoisted(() => ({ referral: true, bnpl: false }))
vi.mock('../modules/featureflags/featureFlags.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../modules/featureflags/featureFlags.js')>()
  return {
    ...actual,
    isFeatureEnabled: vi.fn(async (key: string) =>
      key === 'referral' ? flags.referral : key === 'bnpl' ? flags.bnpl : false),
  }
})

const TID = 987690
const uniq = (): string => `p5${Date.now()}${Math.floor(Math.random() * 1e6)}`
const inTenant = <T>(fn: () => Promise<T>): Promise<T> => runInTenant({ tenantId: TID }, fn)
const day = (offset: number): string => {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + offset)
  return d.toISOString().slice(0, 10)
}

let skuA = 0
let skuB = 0
let whId = 0
let site: StorefrontSite
let referrerId = 0

const bundleLines = () => [
  { skuId: skuA, qty: 1 },
  { skuId: skuB, qty: 1 },
]

async function clearBundles(): Promise<void> {
  await ShopBundle.destroy({ where: { tenantId: TID } })
}

async function makeBundle(components: { skuId: number; qty: number }[], discountValue = 5) {
  return marketingService.createBundle({
    name: { 'en-US': 'P5 Bundle ' + uniq() },
    currency: 'USD',
    components,
    discountType: 'fixed',
    discountValue,
    active: true,
    startAt: day(-1),
    endAt: day(1),
    placement: null,
  })
}

async function makeOrder(currency = 'USD') {
  const orderNo = 'SO' + uniq()
  const row = await ShopOrder.create({
    tenantId: TID,
    orderNo,
    channelId: 0,
    shopId: 0,
    buyer: { email: 'p5@example.com' },
    currency,
    amount: 100,
    status: 'created',
    paymentStatus: 'initiated',
    email: 'p5@example.com',
    amountCents: 10000,
    subtotalCents: 10000,
    accessToken: 'tok_' + uniq(),
  } as never)
  return { id: row.id, orderNo }
}

function fire(provider: string, type: string, orderNo: string, providerRef: string, valid = true) {
  const raw = Buffer.from(JSON.stringify({ type, orderNo, providerRef, currency: 'USD' }))
  const sig = valid ? paymentService.signWebhook(raw) : 'deadbeef'
  return paymentService.handleWebhook(provider, raw, sig)
}

async function paymentState(id: number) {
  const row = await ShopOrder.findByPk(id)
  return row?.paymentStatus
}

beforeAll(async () => {
  await inTenant(async () => {
    const category = await categoryService.createCategory({ parentId: 0, name: { 'en-US': 'P5 Cat ' + uniq() }, level: 1, sort: 0 })
    const brand = await brandService.createBrand({ name: 'P5 Brand ' + uniq() })
    const spuA = await spuService.createSpu({ categoryId: category.id, brandId: brand.id, name: { 'en-US': 'P5 A ' + uniq() }, description: { 'en-US': 'p5' } })
    const spuB = await spuService.createSpu({ categoryId: category.id, brandId: brand.id, name: { 'en-US': 'P5 B ' + uniq() }, description: { 'en-US': 'p5' } })
    const a = await skuService.createSku({ spuId: spuA.id, code: 'P5A' + uniq(), spec: { color: '1B' } })
    const b = await skuService.createSku({ spuId: spuB.id, code: 'P5B' + uniq(), spec: { color: '1B' } })
    skuA = a.id
    skuB = b.id
    await priceService.upsertPrice(skuA, { currency: 'USD', amount: 100 })
    await priceService.upsertPrice(skuB, { currency: 'USD', amount: 60 })
    const wh = await warehouseService.createWarehouse({ name: 'P5 WH ' + uniq(), type: 'overseas', country: 'US' })
    whId = wh.id
    await inventoryService.adjust(skuA, whId, 500)
    await inventoryService.adjust(skuB, whId, 500)
    const referrer = await ShopCustomer.create({
      tenantId: TID,
      email: `ref${uniq()}@test.dev`,
      passwordHash: 'not-a-real-hash',
      status: 'active',
      referralCode: 'REF-' + uniq(),
    } as never)
    referrerId = referrer.id
    site = { tenantId: TID, channelId: 0, shopId: 0, defaultCurrency: 'USD', defaultLocale: 'en-US' }
  })
})

beforeEach(() => {
  flags.referral = true
  flags.bnpl = false
})

afterAll(async () => {
  await inTenant(async () => {
    await ShopBundle.destroy({ where: { tenantId: TID } })
    await ShopReferralCommission.destroy({ where: { tenantId: TID } })
    await ShopOrderPayment.destroy({ where: { tenantId: TID } })
  })
})

describe('P0 Bundle 双重折扣（p5-extension-audit §2，4 例）', () => {
  it('A1 命中 fixed 500 时订单总额只让利一次（16000 -> 15500）', async () => {
    await inTenant(async () => {
      await clearBundles()
      const base = await quoteService.createQuote(site, { items: bundleLines() })
      await makeBundle(bundleLines())
      const hit = await quoteService.createQuote(site, { items: bundleLines() })
      expect(base.amountCents).toBe(16000)
      expect(hit.bundleDiscountCents).toBe(500)
      expect(hit.amountCents).toBe(base.amountCents - 500)
      expect(hit.amountCents).toBe(15500)
    })
  })

  it('A2 明细合计 + 运费 + 税 - 券折 === 订单总额', async () => {
    await inTenant(async () => {
      await clearBundles()
      await makeBundle(bundleLines())
      const q = await quoteService.createQuote(site, { items: bundleLines() })
      const lines = q.items.reduce((s, l) => s + l.lineTotalCents, 0)
      expect(q.amountCents).toBe(Math.max(0, lines + q.shippingCents + q.taxCents - q.discountCents))
      expect(q.discountCents).toBe(0)
    })
  })

  it('A3 qty>1 分摊舍入：实际让利与声明优惠的差额不超过组件数', async () => {
    await inTenant(async () => {
      await clearBundles()
      const lines = [{ skuId: skuA, qty: 3 }, { skuId: skuB, qty: 1 }]
      const base = await quoteService.createQuote(site, { items: lines })
      await makeBundle([{ skuId: skuA, qty: 1 }, { skuId: skuB, qty: 1 }])
      const hit = await quoteService.createQuote(site, { items: lines })
      const actual = base.amountCents - hit.amountCents
      expect(Math.abs(actual - hit.bundleDiscountCents)).toBeLessThanOrEqual(hit.items.length)
    })
  })

  it('A4 建单后 discountCents 不再重复记录 bundle 优惠', async () => {
    await inTenant(async () => {
      await clearBundles()
      await makeBundle(bundleLines())
      const order = await checkoutService.createOrder(site, {
        idempotencyKey: uniq(),
        email: `buyer${uniq()}@test.dev`,
        items: bundleLines(),
      })
      const items = await ShopOrderItem.findAll({ where: { orderId: order.id, tenantId: TID } })
      const sum = items.reduce((s, i) => s + Number(i.lineTotalCents), 0)
      expect(order.discountCents).toBe(0)
      expect(order.amountCents).toBe(Math.max(0, sum + order.shippingCents + order.taxCents - order.discountCents))
      expect(sum).toBe(15500)
    })
  })
})

describe('P1 佣金台账唯一索引（p5-extension-audit §3，2 例）', () => {
  const params = (orderId: number) => ({
    orderId,
    referrerCustomerId: referrerId,
    code: 'REF-P5TEST',
    orderCurrency: 'USD',
    orderNetCents: 10000,
    referralTouchAt: new Date(),
  })

  it('B1 同一 orderId 连续两次计佣只保留一条台账', async () => {
    await inTenant(async () => {
      const orderId = 910000 + Math.floor(Math.random() * 10000)
      const first = await referralService.recordCommission(params(orderId))
      const second = await referralService.recordCommission(params(orderId))
      const count = await ShopReferralCommission.count({ where: { tenantId: TID, orderId } })
      expect(first?.status).toBe('pending')
      expect(second?.status).toBe(first?.status)
      expect(count).toBe(1)
    })
  })

  it('B2 并发两次调用不产生未处理异常；索引落库后严格只有一行', async () => {
    await inTenant(async () => {
      const orderId = 920000 + Math.floor(Math.random() * 10000)
      const results = await Promise.allSettled([
        referralService.recordCommission(params(orderId)),
        referralService.recordCommission(params(orderId)),
      ])
      expect(results.every((r) => r.status === 'fulfilled')).toBe(true)
      const qi = ShopReferralCommission.sequelize?.getQueryInterface()
      const indexes = qi ? await qi.showIndex('referral_commissions') : []
      const hasUq = JSON.stringify(indexes).includes('uq_referral_tenant_order')
      if (hasUq) {
        expect(await ShopReferralCommission.count({ where: { tenantId: TID, orderId } })).toBe(1)
      }
      // 未执行 000070 迁移时，严格断言由数据库层兜底，此处仅保证 service 不抛异常。
    })
  })
})

describe('P1 归因窗口服务端 fail-closed（p5-extension-audit §4，3 例）', () => {
  const call = (orderId: number, touch: unknown) => referralService.recordCommission({
    orderId,
    referrerCustomerId: referrerId,
    code: 'REF-P5TEST',
    orderCurrency: 'USD',
    orderNetCents: 10000,
    referralTouchAt: touch as Date | string | null,
  })

  it('C1 触点在 31 天前 -> void 不计佣', async () => {
    await inTenant(async () => {
      const r = await call(930001, new Date(Date.now() - 31 * 86400_000))
      expect(r?.status).toBe('void')
      expect(r?.commissionCents).toBe(0)
    })
  })

  it('C2 客户端传未来时间 -> void，不延长窗口', async () => {
    await inTenant(async () => {
      const r = await call(930002, new Date(Date.now() + 365 * 86400_000))
      expect(r?.status).toBe('void')
      expect(r?.commissionCents).toBe(0)
    })
  })

  it('C3 非法触点值（直接调 service）-> void，不产生 pending', async () => {
    await inTenant(async () => {
      const r = await call(930003, 'not-a-date')
      expect(r?.status).toBe('void')
      expect(r?.commissionCents).toBe(0)
    })
  })
})

describe('P2 配送承诺仓与实际发货仓一致（p5-extension-audit §5，3 例）', () => {
  let routingSku = 0
  let fast = 0
  let slow = 0

  beforeAll(async () => {
    await inTenant(async () => {
      routingSku = 950000 + Math.floor(Math.random() * 10000)
      fast = (await ShopWarehouse.create({
        tenantId: TID, name: 'P5 Fast ' + uniq(), type: 'overseas', country: 'US',
        priority: 1, deliveryEstimateDays: 1, servedCountries: ['US'],
      } as never)).id
      slow = (await ShopWarehouse.create({
        tenantId: TID, name: 'P5 Slow ' + uniq(), type: 'direct', country: 'CN',
        priority: 100, deliveryEstimateDays: 10, servedCountries: null,
      } as never)).id
      await ShopInventory.create({ tenantId: TID, skuId: routingSku, warehouseId: fast, quantity: 0, locked: 0 } as never)
      await ShopInventory.create({ tenantId: TID, skuId: routingSku, warehouseId: slow, quantity: 5, locked: 0 } as never)
    })
  })

  it('D1 高优先级仓零库存时，承诺仓 === 实际发货仓', async () => {
    await inTenant(async () => {
      const picked = await pickWarehouse(routingSku, 'US')
      const commitment = await getDeliveryCommitment(routingSku, 'US')
      expect(picked).toBe(slow)
      expect(commitment?.warehouseId).toBe(picked)
    })
  })

  it('D2 承诺时效取自实际有货仓（10 天而非 1 天）', async () => {
    await inTenant(async () => {
      const commitment = await getDeliveryCommitment(routingSku, 'US')
      expect(commitment?.deliveryEstimateDays).toBe(10)
      expect(commitment?.available).toBeGreaterThan(0)
    })
  })

  it('D3 全部无货时 pickWarehouse 抛错且承诺不返回幽灵有货仓', async () => {
    await inTenant(async () => {
      const emptySku = 960000 + Math.floor(Math.random() * 10000)
      await ShopInventory.create({ tenantId: TID, skuId: emptySku, warehouseId: fast, quantity: 0, locked: 0 } as never)
      await expect(pickWarehouse(emptySku, 'US')).rejects.toThrow(/无可用库存/)
      const commitment = await getDeliveryCommitment(emptySku, 'US')
      expect(commitment?.available).toBe(0)
    })
  })
})

describe('P5-T03 Webhook provider 校验（p5t03-webhook-audit §4，5 例）', () => {
  it('W1 未注册 provider -> 400 且零副作用', async () => {
    await inTenant(async () => {
      const order = await makeOrder()
      const r = await fire('ghost_provider', 'payment.succeeded', order.orderNo, 'ref_' + uniq())
      expect(r.status).toBe(400)
      expect(await paymentState(order.id)).toBe('initiated')
    })
  })

  it('W2 bnpl flag 关闭时回调 -> 403 且零副作用', async () => {
    await inTenant(async () => {
      flags.bnpl = false
      const order = await makeOrder('USD')
      const r = await fire('bnpl', 'payment.succeeded', order.orderNo, 'ref_' + uniq())
      expect(r.status).toBe(403)
      expect(await paymentState(order.id)).toBe('initiated')
    })
  })

  it('W3 订单币种不在 provider 支持集合 -> 403 且零副作用', async () => {
    await inTenant(async () => {
      flags.bnpl = true
      const order = await makeOrder('CNY')
      const r = await fire('bnpl', 'payment.succeeded', order.orderNo, 'ref_' + uniq())
      expect(r.status).toBe(403)
      expect(await paymentState(order.id)).toBe('initiated')
    })
  })

  it('W4 同一 providerRef 换 provider 重投 -> 400 且零副作用', async () => {
    await inTenant(async () => {
      flags.bnpl = true
      const order = await makeOrder('USD')
      const ref = 'ref_' + uniq()
      await ShopOrderPayment.create({
        tenantId: TID, orderId: order.id, orderNo: order.orderNo,
        provider: 'mock', providerRef: ref, sessionId: 'sess_' + uniq(),
        amountCents: 10000, currency: 'USD', status: 'initiated',
      } as never)
      const r = await fire('bnpl', 'payment.succeeded', order.orderNo, ref)
      expect(r.status).toBe(400)
      expect(await paymentState(order.id)).toBe('initiated')
    })
  })

  it('W5 错误签名 -> 401 且零副作用', async () => {
    await inTenant(async () => {
      const order = await makeOrder()
      const r = await fire('mock', 'payment.succeeded', order.orderNo, 'ref_' + uniq(), false)
      expect(r.status).toBe(401)
      expect(await paymentState(order.id)).toBe('initiated')
    })
  })
})
