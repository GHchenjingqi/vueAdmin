// @vitest-environment node
/**
 * 售后退货 / 换货回补库存 + 全额退款恢复优惠券用量（缺陷修复回归）
 *
 * 背景（2026-11-14 实证）：此前 RMA 退货退款 / 换货全程不回补库存，
 * 退款也不恢复优惠券用量，导致账实不符（退货后系统库存永久少于实际、
 * 换货净少一件、券无法复用）。本次修复：
 *  - refundService 驱动 RMA→refunded 时按 items 回补库存（affected 守卫保证恰好一次）；
 *  - rmaAdminService.approveRmaAsExchange 回补旧物库存；
 *  - refundService 全额退款后调用 releaseCoupon 恢复券用量。
 *
 * 断言：
 * 1. 退货退款后，对应 SKU 可用库存按退货数回补；
 * 2. 换货审批后，旧物 SKU 可用库存回补；
 * 3. 幂等重放退款，库存只回补一次（不重复）；
 * 4. 全额退款后，订单所用优惠券用量被恢复（usedCount 回退、兑换记录删除）。
 *
 * 独立租户 770011，真实 MySQL。
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import { runInTenant } from '../modules/tenant/context.js'
import {
  ShopRmaRequest,
  ShopOrder,
  ShopOrderItem,
  ShopOrderRefund,
  ShopSku,
  ShopSpu,
  ShopCategory,
  ShopChannel,
  ShopShop,
  ShopProductPrice,
  ShopCoupon,
  ShopCouponRedemption,
  ShopInventory,
} from '../modules/shop/models/index.js'
import * as rmaAdminService from '../modules/shop/services/rmaAdminService.js'
import * as refundService from '../modules/shop/services/refundService.js'
import * as inventoryService from '../modules/shop/services/inventoryService.js'

const TID = 770011
const RUN = Date.now().toString(36)
const inTenant = <T>(fn: () => Promise<T>): Promise<T> => runInTenant({ tenantId: TID }, fn)

let skuId = 0
let channelId = 0
let shopId = 0
let fixtureReady = false

async function ensureFixture(): Promise<void> {
  if (fixtureReady) return
  const channel = await ShopChannel.create({ name: `RS Ch ${RUN}`, type: 'independent', tenantId: TID } as never)
  const shop = await ShopShop.create({ name: `RS Shop ${RUN}`, channelId: channel.id, tenantId: TID } as never)
  const cat = await ShopCategory.create({
    name: { 'en-US': `RS Cat ${RUN}` },
    parentId: 0,
    level: 1,
    sort: 0,
    tenantId: TID,
    slug: `rs-cat-${RUN}`,
  } as never)
  const spu = await ShopSpu.create({ name: { 'en-US': `RS Spu ${RUN}` }, categoryId: cat.id, tenantId: TID, status: 'published' } as never)
  const sku = await ShopSku.create({ spuId: spu.id, code: `RSSKU${RUN}`, tenantId: TID } as never)
  skuId = sku.id
  channelId = channel.id
  shopId = shop.id
  await ShopProductPrice.findOrCreate({
    where: { skuId, currency: 'USD', tenantId: TID } as never,
    defaults: { skuId, currency: 'USD', amount: 129.9, tenantId: TID } as never,
  })
  fixtureReady = true
}

async function seedOrder(amountCents = 12990): Promise<{ id: number; orderNo: string }> {
  const orderNo = `RS${Date.now()}${Math.floor(Math.random() * 1e6)}`
  const order = await ShopOrder.create({
    orderNo,
    channelId,
    shopId,
    buyer: { email: `rs${RUN}@t.local` },
    currency: 'USD',
    amount: amountCents / 100,
    amountCents,
    subtotalCents: amountCents,
    status: 'paid',
    paymentStatus: 'captured',
    email: `rs${RUN}@t.local`,
    tenantId: TID,
  } as never)
  await ShopOrderItem.create({ orderId: order.id, skuId, qty: 1, price: amountCents / 100, tenantId: TID } as never)
  // 建一条库存行（仓库 1）并放入 50 件，作为回补前的基线
  await inventoryService.adjust(skuId, 1, 50)
  return { id: order.id, orderNo }
}

function seedRma(orderId: number, status: string, items: { orderItemId: number; skuId: number; qty: number; title: string }[]) {
  return ShopRmaRequest.create({
    tenantId: TID,
    siteId: 1,
    orderId,
    email: `rs${RUN}@t.local`,
    status,
    reason: 'size mismatch',
    items,
    refundAmountCents: 5000,
    refundCurrency: 'USD',
  } as never)
}

const availableOf = (sku: number): Promise<number> => inventoryService.available(sku)

beforeAll(async () => {
  await inTenant(ensureFixture)
})

beforeEach(async () => {
  await ShopOrderRefund.destroy({ where: { tenantId: TID } })
  await ShopRmaRequest.destroy({ where: { tenantId: TID } })
  await ShopCouponRedemption.destroy({ where: { tenantId: TID } })
  await ShopCoupon.destroy({ where: { tenantId: TID } })
  await ShopOrderItem.destroy({ where: { tenantId: TID } })
  await ShopOrder.destroy({ where: { tenantId: TID } })
  await ShopInventory.destroy({ where: { tenantId: TID, skuId } } as never)
})

afterAll(async () => {
  await ShopOrderRefund.destroy({ where: { tenantId: TID } })
  await ShopRmaRequest.destroy({ where: { tenantId: TID } })
  await ShopCouponRedemption.destroy({ where: { tenantId: TID } })
  await ShopCoupon.destroy({ where: { tenantId: TID } })
  await ShopOrderItem.destroy({ where: { tenantId: TID } })
  await ShopOrder.destroy({ where: { tenantId: TID } })
  await ShopInventory.destroy({ where: { tenantId: TID, skuId } } as never)
  await ShopSku.destroy({ where: { tenantId: TID } })
  await ShopSpu.destroy({ where: { tenantId: TID } })
  await ShopCategory.destroy({ where: { tenantId: TID } })
  await ShopShop.destroy({ where: { tenantId: TID } })
  await ShopChannel.destroy({ where: { tenantId: TID } })
})

describe('售后回补库存', () => {
  it('退货退款（RMA→refunded）后，对应 SKU 可用库存按退货数回补', async () => {
    await inTenant(async () => {
      const { id: orderId } = await seedOrder()
      const before = await availableOf(skuId)
      const rma = await seedRma(orderId, 'returned', [{ orderItemId: 1, skuId, qty: 1, title: 'wig' }])
      await refundService.createRefund({ orderId, rmaId: rma.id })
      expect(await availableOf(skuId)).toBe(before + 1)
      const row = await ShopRmaRequest.findByPk(rma.id)
      expect(row?.status).toBe('refunded')
    })
  })

  it('换货审批（RMA→exchange）后，旧物 SKU 可用库存回补', async () => {
    await inTenant(async () => {
      const { id: orderId } = await seedOrder()
      const before = await availableOf(skuId)
      const rma = await seedRma(orderId, 'pending', [{ orderItemId: 1, skuId, qty: 1, title: 'wig' }])
      const updated = await rmaAdminService.approveRmaAsExchange(rma.id, '发 M 码替换')
      expect(updated?.status).toBe('exchange')
      expect(await availableOf(skuId)).toBe(before + 1)
    })
  })

  it('幂等重放退款：库存只回补一次（不重复回补）', async () => {
    await inTenant(async () => {
      const { id: orderId } = await seedOrder()
      const before = await availableOf(skuId)
      const rma = await seedRma(orderId, 'returned', [{ orderItemId: 1, skuId, qty: 1, title: 'wig' }])
      const key = 'RSIDEM-' + RUN
      await refundService.createRefund({ orderId, rmaId: rma.id, idempotencyKey: key })
      // 同幂等键重放：返回既有退款，不二次退款、不二次回补
      await refundService.createRefund({ orderId, rmaId: rma.id, idempotencyKey: key }).catch(() => undefined)
      expect(await availableOf(skuId)).toBe(before + 1)
      expect(await ShopOrderRefund.findAll({ where: { tenantId: TID, orderId } })).toHaveLength(1)
    })
  })
})

describe('全额退款恢复优惠券用量', () => {
  it('全额退款后，订单所用优惠券 usedCount 回退且兑换记录删除', async () => {
    await inTenant(async () => {
      const { id: orderId, orderNo } = await seedOrder()
      const coupon = await ShopCoupon.create({
        code: `RSC${RUN}`,
        type: 'fixed',
        value: 10,
        minSpend: 0,
        currency: 'USD',
        validFrom: '2026-01-01',
        validTo: '2026-12-31',
        usageLimit: 10,
        usedCount: 1,
        tenantId: TID,
      } as never)
      await ShopCouponRedemption.create({
        couponId: coupon.id,
        couponCode: `RSC${RUN}`,
        orderNo,
        discountCents: 1000,
        currency: 'USD',
        tenantId: TID,
      } as never)

      // 全额退款（省略金额 = 退剩余全部）
      await refundService.createRefund({ orderId })

      const reloaded = await ShopCoupon.findByPk(coupon.id)
      expect(Number(reloaded?.usedCount)).toBe(0)
      const redemptions = await ShopCouponRedemption.findAll({ where: { tenantId: TID, orderNo } })
      expect(redemptions).toHaveLength(0)
    })
  })

  it('部分退款不恢复优惠券用量', async () => {
    await inTenant(async () => {
      const { id: orderId, orderNo } = await seedOrder()
      const coupon = await ShopCoupon.create({
        code: `RSC2${RUN}`,
        type: 'fixed',
        value: 10,
        minSpend: 0,
        currency: 'USD',
        validFrom: '2026-01-01',
        validTo: '2026-12-31',
        usageLimit: 10,
        usedCount: 1,
        tenantId: TID,
      } as never)
      await ShopCouponRedemption.create({
        couponId: coupon.id,
        couponCode: `RSC2${RUN}`,
        orderNo,
        discountCents: 1000,
        currency: 'USD',
        tenantId: TID,
      } as never)

      // 部分退款（只退 5000 分 < 实付 12990） → 不恢复券
      await refundService.createRefund({ orderId, amountCents: 5000 })

      const reloaded = await ShopCoupon.findByPk(coupon.id)
      expect(Number(reloaded?.usedCount)).toBe(1)
      const redemptions = await ShopCouponRedemption.findAll({ where: { tenantId: TID, orderNo } })
      expect(redemptions).toHaveLength(1)
    })
  })
})
