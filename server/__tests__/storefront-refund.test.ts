// @vitest-environment node
/**
 * T-09 部分 / 全额退款门禁（P3-T14）实证
 *
 * 断言：仅已支付订单可退；币种恒等于订单快照；累计不超实付；
 *       部分 → refunding、全额 → refunded；幂等重放 / 并发不超退；
 *       provider 异常整笔回滚；跨租户隔离。
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
import { ShopOrder } from '../modules/shop/models/index.js'
import * as refundService from '../modules/shop/services/refundService.js'
import * as checkoutService from '../modules/storefront/services/checkoutService.js'
import * as paymentService from '../modules/storefront/services/paymentService.js'
import type { StorefrontSite } from '../modules/storefront/middleware/siteContext.js'

const TID = 1
const uniq = (): string => `rf${Date.now()}${Math.floor(Math.random() * 1e6)}`

let skuId = 0
let site: StorefrontSite

const inTenant = <T>(fn: () => Promise<T>): Promise<T> => runInTenant({ tenantId: TID }, fn)

/** 造一笔真实已支付订单（走建单 → 支付会话 → Webhook 成功） */
async function paidOrder(): Promise<{ id: number; orderNo: string; amountCents: number }> {
  const order = await checkoutService.createOrder(site, { items: [{ skuId, qty: 1 }], email: 'refund@example.com' })
  const session = await paymentService.createSession(site, order.id)
  const payload = { type: 'payment.succeeded', orderNo: order.orderNo, providerRef: session.providerRef, currency: 'USD' }
  const raw = Buffer.from(JSON.stringify(payload))
  const result = await paymentService.handleWebhook('mock', raw, paymentService.signWebhook(raw))
  if (!result.ok) throw new Error('支付回写失败')
  return { id: order.id, orderNo: order.orderNo, amountCents: order.amountCents }
}

const paymentStatusOf = async (id: number): Promise<string> => {
  const row = await ShopOrder.findByPk(id)
  return String(row?.paymentStatus)
}

beforeAll(async () => {
  await inTenant(async () => {
    const category = await categoryService.createCategory({ parentId: 0, name: { 'en-US': 'RF Cat ' + uniq() }, level: 1, sort: 0 })
    const brand = await brandService.createBrand({ name: 'RF Brand ' + uniq() })
    const warehouse = await warehouseService.createWarehouse({ name: 'RF WH ' + uniq(), type: 'overseas', country: 'US' })
    const spu = await spuService.createSpu({
      categoryId: category.id,
      brandId: brand.id,
      name: { 'en-US': 'RF Wig ' + uniq(), 'zh-CN': '退款测试商品' },
      description: { 'en-US': 'refund fixture' },
    })
    const sku = await skuService.createSku({ spuId: spu.id, code: 'RFSKU' + uniq(), spec: { color: '1B' } })
    skuId = sku.id
    await priceService.upsertPrice(sku.id, { currency: 'USD', amount: 100 })
    await inventoryService.adjust(sku.id, warehouse.id, 1000)
    site = { tenantId: TID, channelId: null, shopId: null, defaultCurrency: 'USD', defaultLocale: 'en-US' }
  })
})

afterEach(() => {
  refundService.setRefundProvider(null)
})

describe('T-09 退款前置校验', () => {
  it('未支付订单不可退款 → ORDER_NOT_REFUNDABLE', async () => {
    await inTenant(async () => {
      const order = await checkoutService.createOrder(site, { items: [{ skuId, qty: 1 }] })
      await expect(refundService.createRefund({ orderId: order.id, amountCents: 1000 })).rejects.toThrow(/ORDER_NOT_REFUNDABLE/)
    })
  })

  it('退款币种与订单快照不符 → REFUND_CURRENCY_MISMATCH', async () => {
    await inTenant(async () => {
      const order = await paidOrder()
      await expect(refundService.createRefund({ orderId: order.id, amountCents: 1000, currency: 'EUR' })).rejects.toThrow(/REFUND_CURRENCY_MISMATCH/)
      expect(await paymentStatusOf(order.id)).toBe('captured')
    })
  })

  it('金额为 0 / 负数 / 小数 → REFUND_INVALID_AMOUNT', async () => {
    await inTenant(async () => {
      const order = await paidOrder()
      for (const amountCents of [0, -1, 1.5]) {
        await expect(refundService.createRefund({ orderId: order.id, amountCents })).rejects.toThrow(/REFUND_INVALID_AMOUNT|退款金额/)
      }
    })
  })
})

describe('T-09 部分 / 全额退款状态流', () => {
  it('部分退款 → refunding + 流水币种取订单快照；超额拒绝', async () => {
    await inTenant(async () => {
      const order = await paidOrder()
      const first = await refundService.createRefund({ orderId: order.id, amountCents: 3000, reason: '部分退货' })
      expect(first.amountCents).toBe(3000)
      expect(first.currency).toBe('USD')
      expect(first.status).toBe('succeeded')
      expect(await paymentStatusOf(order.id)).toBe('refunding')

      await refundService.createRefund({ orderId: order.id, amountCents: 2000 })
      expect((await refundService.listRefunds(order.id)).reduce((s, r) => s + r.amountCents, 0)).toBe(5000)

      await expect(refundService.createRefund({ orderId: order.id, amountCents: 6000 })).rejects.toThrow(/REFUND_EXCEEDS_PAID/)
    })
  })

  it('省略金额 = 退剩余全部 → refunded；全额后再退被拒', async () => {
    await inTenant(async () => {
      const order = await paidOrder()
      await refundService.createRefund({ orderId: order.id, amountCents: 3000 })
      const last = await refundService.createRefund({ orderId: order.id })
      expect(last.amountCents).toBe(order.amountCents - 3000)
      expect(await paymentStatusOf(order.id)).toBe('refunded')

      const rows = await refundService.listRefunds(order.id)
      expect(rows.reduce((s, r) => s + r.amountCents, 0)).toBe(order.amountCents)
      await expect(refundService.createRefund({ orderId: order.id, amountCents: 1 })).rejects.toThrow(/ORDER_NOT_REFUNDABLE|REFUND_EXCEEDS_PAID/)
    })
  })

  it('一次全额退款直接 refunded', async () => {
    await inTenant(async () => {
      const order = await paidOrder()
      const one = await refundService.createRefund({ orderId: order.id })
      expect(one.amountCents).toBe(order.amountCents)
      expect(one.currency).toBe('USD')
      expect(await paymentStatusOf(order.id)).toBe('refunded')
    })
  })
})

describe('T-09 幂等、并发与异常隔离', () => {
  it('同一 idempotencyKey 重放返回首笔，不二次退款', async () => {
    await inTenant(async () => {
      const order = await paidOrder()
      const key = 'RFIDEM-' + uniq()
      const first = await refundService.createRefund({ orderId: order.id, amountCents: 4000, idempotencyKey: key })
      const again = await refundService.createRefund({ orderId: order.id, amountCents: 4000, idempotencyKey: key })
      expect(again.refundNo).toBe(first.refundNo)
      expect(await refundService.listRefunds(order.id)).toHaveLength(1)
      expect(await paymentStatusOf(order.id)).toBe('refunding')
    })
  })

  it('并发两笔各 6000 分（实付 10000）：只成功一笔，不超退', async () => {
    await inTenant(async () => {
      const order = await paidOrder()
      const results = await Promise.allSettled([
        refundService.createRefund({ orderId: order.id, amountCents: 6000 }),
        refundService.createRefund({ orderId: order.id, amountCents: 6000 }),
      ])
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
      const rows = await refundService.listRefunds(order.id)
      expect(rows.reduce((s, r) => s + r.amountCents, 0)).toBe(6000)
    })
  })

  it('provider 异常 → 502 且整笔回滚（无流水、订单状态不变）', async () => {
    await inTenant(async () => {
      const order = await paidOrder()
      refundService.setRefundProvider(() => { throw new Error('gateway down') })
      await expect(refundService.createRefund({ orderId: order.id, amountCents: 1000 })).rejects.toThrow(/REFUND_PROVIDER_FAILED/)
      expect(await refundService.listRefunds(order.id)).toHaveLength(0)
      expect(await paymentStatusOf(order.id)).toBe('captured')

      refundService.setRefundProvider(() => ({ providerRef: 'rf_gateway_1' }))
      const ok = await refundService.createRefund({ orderId: order.id, amountCents: 1000 })
      expect(ok.providerRef).toBe('rf_gateway_1')
    })
  })

  it('跨租户隔离：其他租户订单按 404 处理', async () => {
    await inTenant(async () => {
      const order = await paidOrder()
      await ShopOrder.update({ tenantId: 2 } as never, { where: { id: order.id, tenantId: TID } })
      await expect(refundService.createRefund({ orderId: order.id, amountCents: 1000 })).rejects.toThrow(/订单不存在/)
      expect(await refundService.listRefunds(order.id)).toHaveLength(0)
    })
  })
})
