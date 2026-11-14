// @vitest-environment node
/**
 * RMA 批准退款与换货（PLAN 4.2）
 *
 * 缺口：`approveRma` 只做 pending→approved 的状态流转，与 `refundService` 没有调用关系；
 * 客服批准后要在另一个界面再发一次退款，且状态机没有 exchange 分支，换货需求无处安放。
 *
 * 本测试锁定四条约束：
 * 1. pending 的 RMA 可一步「批准 + 退款」，最终落 refunded 且回写实际退款额；
 * 2. 部分退款金额被接受，且沿用 rma:<id> 幂等键（重复调用不二次退款）；
 * 3. 换货转 exchange，**不触发退款**，也不覆盖顾客填写的 reason；
 * 4. 非法金额（0 / 负数 / 非整数）被拒绝，且不改变 RMA 状态。
 *
 * 独立租户 987790，真实 MySQL。
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { Op } from 'sequelize'
import { runInTenant } from '../modules/tenant/context.js'
import {
  ShopRmaRequest,
  ShopOrder,
  ShopOrderRefund,
  ShopOrderItem,
  ShopProductPrice,
  ShopSku,
  ShopSpu,
  ShopCategory,
  ShopChannel,
  ShopShop,
} from '../modules/shop/models/index.js'
import * as rmaAdminService from '../modules/shop/services/rmaAdminService.js'

const TID = 987790
const RUN = Date.now().toString(36)
const EMAIL_PREFIX = `rma-refund-${RUN}@`
let seq = 0
const inTenant = <T>(fn: () => Promise<T>): Promise<T> => runInTenant({ tenantId: TID }, fn)

/**
 * 主数据只建一次：category.slug 有 (tenantId, slug) 唯一索引，
 * 每例重建会撞键；订单级数据才需要每例新建。
 */
let fixture: { channelId: number; shopId: number; skuId: number } | null = null

async function ensureFixture(): Promise<{ channelId: number; shopId: number; skuId: number }> {
  if (fixture) return fixture
  const channel = await ShopChannel.create({ name: `RF Ch ${RUN}`, type: 'independent', tenantId: TID } as never)
  const shop = await ShopShop.create({ name: `RF Shop ${RUN}`, channelId: channel.id, tenantId: TID } as never)
  const cat = await ShopCategory.create({ name: { 'en-US': `RF Cat ${RUN}` }, parentId: 0, level: 1, sort: 0, tenantId: TID, slug: `rf-cat-${RUN}` } as never)
  const spu = await ShopSpu.create({ name: { 'en-US': `RF Spu ${RUN}` }, categoryId: cat.id, tenantId: TID, status: 'published' } as never)
  const sku = await ShopSku.create({ spuId: spu.id, code: `RFSKU${RUN}`, tenantId: TID } as never)
  fixture = { channelId: channel.id, shopId: shop.id, skuId: sku.id }
  return fixture
}

/** 建一张已支付订单（退款额受订单 amountCents 与 paymentStatus 约束） */
async function seedOrder(amountCents = 12990): Promise<number> {
  const { channelId, shopId, skuId } = await ensureFixture()
  await ShopProductPrice.findOrCreate({
    where: { skuId, currency: 'USD', tenantId: TID } as never,
    defaults: { skuId, currency: 'USD', amount: amountCents / 100, tenantId: TID } as never,
  })

  const order = await ShopOrder.create({
    orderNo: `RF${Date.now()}${seq}`,
    channelId,
    shopId,
    buyer: { email: `${EMAIL_PREFIX}${seq}@t.local` },
    currency: 'USD',
    amount: amountCents / 100,
    amountCents,
    subtotalCents: amountCents,
    status: 'paid',
    paymentStatus: 'captured',
    email: `${EMAIL_PREFIX}${seq}@t.local`,
    tenantId: TID,
  } as never)
  await ShopOrderItem.create({ orderId: order.id, skuId, qty: 1, price: amountCents / 100, tenantId: TID } as never)
  return order.id
}

async function seedRma(orderId: number, status = 'pending', refundAmountCents = 5000) {
  return ShopRmaRequest.create({
    tenantId: TID,
    siteId: 1,
    orderId,
    email: `${EMAIL_PREFIX}${++seq}@t.local`,
    status,
    reason: 'size mismatch',
    items: [{ orderItemId: 1, skuId: 1, qty: 1, title: 'test' }],
    refundAmountCents,
    refundCurrency: 'USD',
  } as never)
}

beforeEach(async () => {
  await ShopOrderRefund.destroy({ where: { tenantId: TID } })
  await ShopRmaRequest.destroy({ where: { tenantId: TID } })
})

afterAll(async () => {
  await ShopOrderRefund.destroy({ where: { tenantId: TID } })
  await ShopRmaRequest.destroy({ where: { tenantId: TID } })
  await ShopOrderItem.destroy({ where: { tenantId: TID } })
  await ShopOrder.destroy({ where: { tenantId: TID } })
  await ShopProductPrice.destroy({ where: { tenantId: TID } })
  await ShopSku.destroy({ where: { tenantId: TID } })
  await ShopSpu.destroy({ where: { tenantId: TID } })
  await ShopCategory.destroy({ where: { tenantId: TID } })
  await ShopShop.destroy({ where: { tenantId: TID } })
  await ShopChannel.destroy({ where: { tenantId: TID } })
})

describe('approveRmaWithRefund', () => {
  it('approves a pending RMA and refunds its approved amount in one step', async () => {
    await inTenant(async () => {
      const orderId = await seedOrder(12990)
      const rma = await seedRma(orderId, 'pending', 5000)

      const res = await rmaAdminService.approveRmaWithRefund(rma.id)
      expect(res.refund.amountCents).toBe(5000)
      expect(res.refund.currency).toBe('USD')
      expect(res.rma?.status).toBe('refunded')
      // 回写实际退款额，供报表与客服核对
      expect(Number(res.rma?.refundAmountCents)).toBe(5000)
    })
  }, 60_000)

  it('accepts a partial amount different from the RMA default', async () => {
    await inTenant(async () => {
      const orderId = await seedOrder(12990)
      const rma = await seedRma(orderId, 'pending', 5000)
      const res = await rmaAdminService.approveRmaWithRefund(rma.id, { amountCents: 2000 })
      expect(res.refund.amountCents).toBe(2000)
      expect(Number(res.rma?.refundAmountCents)).toBe(2000)
    })
  }, 60_000)

  it('is idempotent for the same RMA (no double refund)', async () => {
    await inTenant(async () => {
      const orderId = await seedOrder(12990)
      const rma = await seedRma(orderId, 'pending', 5000)
      await rmaAdminService.approveRmaWithRefund(rma.id)
      // 二次调用：refundService 按 idempotencyKey 返回既有退款，不新增流水
      await rmaAdminService.approveRmaWithRefund(rma.id).catch(() => undefined)
      const refunds = await ShopOrderRefund.findAll({ where: { tenantId: TID, orderId } })
      expect(refunds).toHaveLength(1)
    })
  }, 60_000)

  it('rejects an invalid amount without changing the RMA status', async () => {
    await inTenant(async () => {
      const orderId = await seedOrder(12990)
      const rma = await seedRma(orderId, 'pending', 5000)
      await expect(rmaAdminService.approveRmaWithRefund(rma.id, { amountCents: 0 })).rejects.toThrow(/正整数/)
      const after = await ShopRmaRequest.findByPk(rma.id)
      expect(after?.status).toBe('pending')
    })
  }, 60_000)

  it('refuses to refund an RMA that is already rejected', async () => {
    await inTenant(async () => {
      const orderId = await seedOrder(12990)
      const rma = await seedRma(orderId, 'rejected', 5000)
      await expect(rmaAdminService.approveRmaWithRefund(rma.id)).rejects.toThrow(/不可退款/)
    })
  }, 60_000)
})

describe('approveRmaAsExchange', () => {
  it('marks the RMA as exchange without creating a refund', async () => {
    await inTenant(async () => {
      const orderId = await seedOrder(12990)
      const rma = await seedRma(orderId, 'pending', 5000)
      const updated = await rmaAdminService.approveRmaAsExchange(rma.id, '发 M 码替换')
      expect(updated?.status).toBe('exchange')
      // 换货不产生退款流水
      const refunds = await ShopOrderRefund.findAll({ where: { tenantId: TID, orderId } })
      expect(refunds).toHaveLength(0)
    })
  }, 60_000)

  it('does not overwrite the customer-supplied reason', async () => {
    await inTenant(async () => {
      const orderId = await seedOrder(12990)
      const rma = await seedRma(orderId, 'pending', 5000)
      const updated = await rmaAdminService.approveRmaAsExchange(rma.id, '客服备注')
      expect(updated?.reason).toBe('size mismatch')
      expect(updated?.rejectReason).toBe('客服备注')
    })
  }, 60_000)

  it('only accepts pending RMAs', async () => {
    await inTenant(async () => {
      const orderId = await seedOrder(12990)
      const rma = await seedRma(orderId, 'approved', 5000)
      await expect(rmaAdminService.approveRmaAsExchange(rma.id)).rejects.toThrow(/仅 pending/)
    })
  }, 60_000)
})
