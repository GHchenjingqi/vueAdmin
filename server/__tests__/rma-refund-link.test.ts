// @vitest-environment node
/**
 * RMA↔refund 联动实证（Task 104 残留项收口）
 *
 * 断言：退款成功后，携带 rmaId 的退款将对应 RMA 驱动为 refunded（状态机终态）；
 *      - 仅 approved/returned 可被驱动（pending/rejected/cancelled 不强行置 refunded）；
 *      - 同单校验：rma.orderId 须等于退款单，防越权改写其它订单 RMA；
 *      - 已是 refunded 时幂等 no-op；
 *      - 幂等重放（同 idempotencyKey）不重复、RMA 保持 refunded。
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { runInTenant } from '../modules/tenant/context.js'
import * as categoryService from '../modules/shop/services/categoryService.js'
import * as brandService from '../modules/shop/services/brandService.js'
import * as spuService from '../modules/shop/services/spuService.js'
import * as skuService from '../modules/shop/services/skuService.js'
import * as priceService from '../modules/shop/services/priceService.js'
import * as warehouseService from '../modules/shop/services/warehouseService.js'
import * as inventoryService from '../modules/shop/services/inventoryService.js'
import { ShopOrder, ShopRmaRequest } from '../modules/shop/models/index.js'
import * as refundService from '../modules/shop/services/refundService.js'
import * as checkoutService from '../modules/storefront/services/checkoutService.js'
import * as paymentService from '../modules/storefront/services/paymentService.js'
import type { StorefrontSite } from '../modules/storefront/middleware/siteContext.js'

const TID = 1
const uniq = (): string => `rl${Date.now()}${Math.floor(Math.random() * 1e6)}`

let skuId = 0
let site: StorefrontSite

const inTenant = <T>(fn: () => Promise<T>): Promise<T> => runInTenant({ tenantId: TID }, fn)

async function paidOrder(): Promise<{ id: number; orderNo: string; amountCents: number }> {
  const order = await checkoutService.createOrder(site, { items: [{ skuId, qty: 1 }], email: 'rma-link@example.com' })
  const session = await paymentService.createSession(site, order.id)
  const payload = { type: 'payment.succeeded', orderNo: order.orderNo, providerRef: session.providerRef, currency: 'USD' }
  const raw = Buffer.from(JSON.stringify(payload))
  const result = await paymentService.handleWebhook('mock', raw, paymentService.signWebhook(raw))
  if (!result.ok) throw new Error('支付回写失败')
  return { id: order.id, orderNo: order.orderNo, amountCents: order.amountCents }
}

async function makeRma(orderId: number, status: string, refundAmountCents = 0): Promise<ShopRmaRequest> {
  return ShopRmaRequest.create({
    tenantId: TID,
    siteId: 1,
    orderId,
    customerId: null,
    email: 'rma-link@example.com',
    status,
    items: null,
    refundAmountCents,
    refundCurrency: 'USD',
  } as never)
}

const rmaStatus = async (id: number): Promise<string | undefined> => {
  const row = await ShopRmaRequest.findByPk(id)
  return row?.status
}

beforeAll(async () => {
  await inTenant(async () => {
    const category = await categoryService.createCategory({ parentId: 0, name: { 'en-US': 'RL Cat ' + uniq() }, level: 1, sort: 0 })
    const brand = await brandService.createBrand({ name: 'RL Brand ' + uniq() })
    const warehouse = await warehouseService.createWarehouse({ name: 'RL WH ' + uniq(), type: 'overseas', country: 'US' })
    const spu = await spuService.createSpu({
      categoryId: category.id,
      brandId: brand.id,
      name: { 'en-US': 'RL Wig ' + uniq(), 'zh-CN': '联动测试商品' },
      description: { 'en-US': 'rma-refund-link fixture' },
    })
    const sku = await skuService.createSku({ spuId: spu.id, code: 'RLSKU' + uniq(), spec: { color: '1B' } })
    skuId = sku.id
    await priceService.upsertPrice(sku.id, { currency: 'USD', amount: 100 })
    await inventoryService.adjust(sku.id, warehouse.id, 1000)
    site = { tenantId: TID, channelId: null, shopId: null, defaultCurrency: 'USD', defaultLocale: 'en-US' }
  })
})

afterEach(() => {
  refundService.setRefundProvider(null)
})

describe('RMA↔refund 联动', () => {
  it('退款成功后 RMA(returned) → refunded', async () => {
    await inTenant(async () => {
      const order = await paidOrder()
      const rma = await makeRma(order.id, 'returned', order.amountCents)
      await refundService.createRefund({ orderId: order.id, amountCents: order.amountCents, rmaId: rma.id })
      expect(await rmaStatus(rma.id)).toBe('refunded')
    })
  })

  it('退款成功后 RMA(approved) 亦可驱动为 refunded', async () => {
    await inTenant(async () => {
      const order = await paidOrder()
      const rma = await makeRma(order.id, 'approved', order.amountCents)
      await refundService.createRefund({ orderId: order.id, amountCents: order.amountCents, rmaId: rma.id })
      expect(await rmaStatus(rma.id)).toBe('refunded')
    })
  })

  it('幂等重放（同 idempotencyKey）不重复、RMA 保持 refunded', async () => {
    await inTenant(async () => {
      const order = await paidOrder()
      const rma = await makeRma(order.id, 'returned', order.amountCents)
      const key = 'idem-' + Date.now() + '-' + Math.floor(Math.random() * 1e6)
      await refundService.createRefund({ orderId: order.id, amountCents: order.amountCents, rmaId: rma.id, idempotencyKey: key })
      await refundService.createRefund({ orderId: order.id, amountCents: order.amountCents, rmaId: rma.id, idempotencyKey: key })
      expect(await rmaStatus(rma.id)).toBe('refunded')
    })
  })

  it('RMA(pending) 退款成功但保持 pending（不强行置 refunded）', async () => {
    await inTenant(async () => {
      const order = await paidOrder()
      const rma = await makeRma(order.id, 'pending', order.amountCents)
      await refundService.createRefund({ orderId: order.id, amountCents: order.amountCents, rmaId: rma.id })
      expect(await rmaStatus(rma.id)).toBe('pending')
    })
  })

  it('RMA 已是 refunded：退款成功且为 no-op', async () => {
    await inTenant(async () => {
      const order = await paidOrder()
      const rma = await makeRma(order.id, 'refunded', order.amountCents)
      await refundService.createRefund({ orderId: order.id, amountCents: order.amountCents, rmaId: rma.id })
      expect(await rmaStatus(rma.id)).toBe('refunded')
    })
  })

  it('关联 RMA 退款金额超过售后审批额度被拒（防超额退款）', async () => {
    await inTenant(async () => {
      const order = await paidOrder()
      // RMA 仅审批退半单
      const rma = await makeRma(order.id, 'approved', Math.floor(order.amountCents / 2))
      await expect(
        refundService.createRefund({ orderId: order.id, amountCents: order.amountCents, rmaId: rma.id }),
      ).rejects.toThrow(/REFUND_EXCEEDS_RMA/)
      // RMA 未被驱动为 refunded
      expect(await rmaStatus(rma.id)).toBe('approved')
    })
  })

  it('rmaId 越权（RMA 属其它订单）不驱动状态', async () => {
    await inTenant(async () => {
      const orderA = await paidOrder()
      const orderB = await paidOrder()
      const rmaB = await makeRma(orderB.id, 'returned', orderB.amountCents)
      // 对 orderA 退款却携带 orderB 的 rmaId → 同单校验拦截，RMA 不变
      await refundService.createRefund({ orderId: orderA.id, amountCents: orderA.amountCents, rmaId: rmaB.id })
      expect(await rmaStatus(rmaB.id)).toBe('returned')
    })
  })
})
