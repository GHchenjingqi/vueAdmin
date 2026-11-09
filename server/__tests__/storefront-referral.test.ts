// @vitest-environment node
/**
 * P5-T07 Referral / Affiliate 归因与结算实证
 *
 * 断言：flag 关闭 fail-closed 不产台账；有效码且窗口内 → pending 佣金（基数=净额×比例）；
 *       窗口超时 → void 不计佣；与优惠券叠加时基数已扣券折；无效码 / 自荐 → 不计佣；
 *       佣金币种恒等于订单币种（不换算）。
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import { runInTenant } from '../modules/tenant/context.js'
import * as categoryService from '../modules/shop/services/categoryService.js'
import * as brandService from '../modules/shop/services/brandService.js'
import * as spuService from '../modules/shop/services/spuService.js'
import * as skuService from '../modules/shop/services/skuService.js'
import * as priceService from '../modules/shop/services/priceService.js'
import * as warehouseService from '../modules/shop/services/warehouseService.js'
import * as inventoryService from '../modules/shop/services/inventoryService.js'
import * as customerService from '../modules/shop/services/customerService.js'
import * as couponService from '../modules/shop/services/marketingService.js'
import * as referralService from '../modules/storefront/services/referralService.js'
import * as checkoutService from '../modules/storefront/services/checkoutService.js'
import { ShopReferralCommission } from '../modules/shop/models/index.js'
import type { StorefrontSite } from '../modules/storefront/middleware/siteContext.js'

// flag 状态用 vi.hoisted 控制（referral 门控 fail-closed 验证）
const state = vi.hoisted(() => ({ referralOn: false }))
vi.mock('../modules/featureflags/featureFlags.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../modules/featureflags/featureFlags.js')>()
  return { ...actual, isFeatureEnabled: vi.fn(async (key: string) => (key === 'referral' ? state.referralOn : false)) }
})

const TID = 1
const uniq = (): string => `rf${Date.now()}${Math.floor(Math.random() * 1e6)}`
const day = (offset: number): string => {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + offset)
  return d.toISOString().slice(0, 10)
}
const isoOffset = (offsetDays: number): string => {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + offsetDays)
  return d.toISOString()
}

let skuId = 0
let site: StorefrontSite
let referrerCode = ''
let referrerId = 0

const inTenant = <T>(fn: () => Promise<T>): Promise<T> => runInTenant({ tenantId: TID }, fn)

const addr = { country: 'US', province: 'CA', city: 'Los Angeles', line1: '1 Main St', zip: '90001' }

async function createOrder(customerId: number | undefined, attribution?: Record<string, unknown>, couponCode?: string) {
  return checkoutService.createOrder(site, {
    idempotencyKey: uniq(),
    email: customerId ? undefined : `buyer${uniq()}@test.dev`,
    customerId,
    shippingAddress: addr,
    items: [{ skuId, qty: 1 }],
    couponCode,
    attribution: attribution as never,
  })
}

async function countCommissions(): Promise<number> {
  return ShopReferralCommission.count({ where: { tenantId: TID } })
}

beforeAll(async () => {
  await inTenant(async () => {
    const category = await categoryService.createCategory({ parentId: 0, name: { 'en-US': 'RF Cat ' + uniq() }, level: 1, sort: 0 })
    const brand = await brandService.createBrand({ name: 'RF Brand ' + uniq() })
    const warehouse = await warehouseService.createWarehouse({ name: 'RF WH ' + uniq(), type: 'overseas', country: 'US' })
    const spu = await spuService.createSpu({
      categoryId: category.id,
      brandId: brand.id,
      name: { 'en-US': 'RF Wig ' + uniq(), 'zh-CN': '推荐测试商品' },
      description: { 'en-US': 'referral fixture' },
    })
    const sku = await skuService.createSku({ spuId: spu.id, code: 'RFSKU' + uniq(), spec: { color: '1B' } })
    skuId = sku.id
    await priceService.upsertPrice(skuId, { currency: 'USD', amount: 100 })
    await inventoryService.adjust(skuId, warehouse.id, 1000)
    const referrer = await customerService.registerCustomer({
      tenantId: TID,
      email: `ref${uniq()}@test.dev`,
      password: 'Secret123!',
    })
    referrerId = referrer.customer.id
    referrerCode = await referralService.ensureReferralCode(referrer.customer.id)
    site = { tenantId: TID, channelId: null, shopId: null, defaultCurrency: 'USD', defaultLocale: 'en-US' }
  })
})

beforeEach(async () => {
  // 清空历史佣金，保证用例间隔离（真实库）
  await inTenant(async () => {
    await ShopReferralCommission.destroy({ where: { tenantId: TID } })
  })
  state.referralOn = true
})

describe('P5-T07 推荐佣金门控与结算', () => {
  it('flag 关闭 → fail-closed 不产生台账', async () => {
    await inTenant(async () => {
      state.referralOn = false
      const order = await createOrder(undefined, { referralCode: referrerCode, referralTouchAt: isoOffset(0) })
      expect(order.id).toBeGreaterThan(0)
      expect(await countCommissions()).toBe(0)
    })
  })

  it('有效码且窗口内 → pending 佣金 = 净额 × 比例（10%）', async () => {
    await inTenant(async () => {
      const order = await createOrder(undefined, { referralCode: referrerCode, referralTouchAt: isoOffset(0) })
      const row = await ShopReferralCommission.findOne({ where: { tenantId: TID, orderId: order.id } })
      expect(row).not.toBeNull()
      expect(row!.status).toBe('pending')
      // 基数 = 订单净额（含运费/税、扣券折后）；佣金 = 基数 × 10%
      expect(Number(row!.orderNetAmountCents)).toBe(order.amountCents)
      expect(Number(row!.commissionCents)).toBe(Math.round((order.amountCents * 10) / 100))
      expect(row!.orderCurrency).toBe('USD')
      expect(row!.referrerCustomerId).toBe(referrerId)
    })
  })

  it('窗口超时 → void 不计佣', async () => {
    await inTenant(async () => {
      const order = await createOrder(undefined, { referralCode: referrerCode, referralTouchAt: isoOffset(-31) })
      const row = await ShopReferralCommission.findOne({ where: { tenantId: TID, orderId: order.id } })
      expect(row).not.toBeNull()
      expect(row!.status).toBe('void')
      expect(Number(row!.commissionCents)).toBe(0)
    })
  })

  it('与优惠券叠加：基数=净额（已扣券折），非原价', async () => {
    await inTenant(async () => {
      // 无券基准净额（运费/税恒定）
      const baseOrder = await createOrder(undefined, { referralCode: referrerCode, referralTouchAt: isoOffset(0) })
      const coupon = await couponService.createCoupon({
        code: 'RF' + uniq(),
        type: 'fixed',
        value: 30,
        minSpend: 0,
        currency: 'USD',
        validFrom: day(-1),
        validTo: day(1),
      })
      const order = await createOrder(undefined, { referralCode: referrerCode, referralTouchAt: isoOffset(0) }, coupon.code)
      const row = await ShopReferralCommission.findOne({ where: { tenantId: TID, orderId: order.id } })
      expect(row).not.toBeNull()
      // 券折 30 元 = 3000 分：净额较无券基准下降 3000（佣金不计入折扣部分）
      expect(order.amountCents).toBe(baseOrder.amountCents - 3000)
      expect(Number(row!.orderNetAmountCents)).toBe(order.amountCents)
      expect(Number(row!.commissionCents)).toBe(Math.round((order.amountCents * 10) / 100))
    })
  })

  it('无效推荐码 → 不计佣', async () => {
    await inTenant(async () => {
      await createOrder(undefined, { referralCode: 'REF-NOTEXIST', referralTouchAt: isoOffset(0) })
      expect(await countCommissions()).toBe(0)
    })
  })

  it('自荐（推荐人=下单顾客）→ 不计佣', async () => {
    await inTenant(async () => {
      await createOrder(referrerId, { referralCode: referrerCode, referralTouchAt: isoOffset(0) })
      expect(await countCommissions()).toBe(0)
    })
  })

  it('佣金币种恒等于订单币种（不换算）', async () => {
    await inTenant(async () => {
      const order = await createOrder(undefined, { referralCode: referrerCode, referralTouchAt: isoOffset(0) })
      const row = await ShopReferralCommission.findOne({ where: { tenantId: TID, orderId: order.id } })
      expect(row!.orderCurrency).toBe(order.currency)
    })
  })
})
