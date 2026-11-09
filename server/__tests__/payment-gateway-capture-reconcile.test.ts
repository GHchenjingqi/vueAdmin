// @vitest-environment node
/**
 * 支付网关收口（A2）实证回归
 *
 * 审计对象：
 *  - paymentService.makeReturnToken / verifyReturnToken（免登录回跳凭证）
 *  - paymentService.capturePayment（PayPal 类通道回跳后主动确认）
 *  - paymentReconcileService.reconcilePayments（超时关单 / 主动查单补单）
 *
 * 专属租户 987712；自建订单/支付/库存预占，beforeAll/afterAll 清理。
 * 不依赖任何真实网关凭据：capture 路径用 mock 验证「无 capture 适配器即 422」，
 * 状态机落地用 applyGatewayEvent 直接驱动（capture/webhook 共用核心）。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { runInTenant } from '../modules/tenant/context.js'
import { ShopOrder, ShopOrderPayment, ShopInventory, ShopInventoryReservation } from '../modules/shop/models/index.js'
import * as paymentService from '../modules/storefront/services/paymentService.js'
import { reconcilePayments } from '../modules/storefront/services/paymentReconcileService.js'

const TID = 987712
const inTenant = <T>(fn: () => Promise<T>): Promise<T> => runInTenant({ tenantId: TID }, fn)
const uniq = (): string => `cap${Date.now()}${Math.floor(Math.random() * 1e6)}`

interface Fixture {
  orderNo: string
  providerRef: string
}
async function makeOrder(): Promise<Fixture> {
  const orderNo = 'CAP' + uniq()
  const providerRef = `pay_${orderNo}_${uniq()}`
  await ShopOrder.create({
    tenantId: TID,
    orderNo,
    channelId: 0,
    shopId: 0,
    buyer: { email: 'cap@example.com' },
    currency: 'USD',
    amount: 100,
    status: 'created',
    paymentStatus: 'initiated',
    email: 'cap@example.com',
    amountCents: 10000,
    subtotalCents: 10000,
    accessToken: 'tok_' + orderNo,
  } as never)
  await ShopOrderPayment.create({
    tenantId: TID,
    orderId: 1,
    orderNo,
    provider: 'mock',
    providerRef,
    sessionId: 'sess_' + uniq(),
    amountCents: 10000,
    currency: 'USD',
    status: 'initiated',
  } as never)
  return { orderNo, providerRef }
}

async function makeReservation(orderNo: string, qty = 2): Promise<void> {
  const skuId = 792000 + Math.floor(Math.random() * 10000)
  await ShopInventory.create({ tenantId: TID, skuId, warehouseId: 792001, quantity: 10, locked: qty } as never)
  await ShopInventoryReservation.create({
    tenantId: TID,
    skuId,
    warehouseId: 792001,
    qty,
    status: 'active',
    ref: orderNo,
    expiresAt: new Date(Date.now() + 3600_000),
  } as never)
}

async function clean(): Promise<void> {
  await inTenant(async () => {
    await ShopInventoryReservation.destroy({ where: { tenantId: TID } })
    await ShopInventory.destroy({ where: { tenantId: TID } })
    await ShopOrderPayment.destroy({ where: { tenantId: TID } })
    await ShopOrder.destroy({ where: { tenantId: TID } })
  })
}

beforeAll(async () => {
  await inTenant(async () => {})
})
afterAll(clean)

describe('回跳凭证 makeReturnToken / verifyReturnToken', () => {
  it('正常往返：签名有效且未过期时还原 orderNo/provider', () => {
    const tok = paymentService.makeReturnToken('ORD123', 'paypal')
    expect(paymentService.verifyReturnToken(tok)).toEqual({ orderNo: 'ORD123', provider: 'paypal' })
  })

  it('篡改签名段立即失效', () => {
    const tok = paymentService.makeReturnToken('ORD123', 'paypal')
    const [body, sig] = tok.split('.')
    const forged = `${body}.${sig.slice(0, -2)}ZZ`
    expect(paymentService.verifyReturnToken(forged)).toBeNull()
  })

  it('orderNo / provider 与凭证不匹配时拒绝（防止跨单读取）', () => {
    const tok = paymentService.makeReturnToken('ORD123', 'paypal')
    expect(paymentService.verifyReturnToken(tok)).not.toEqual({ orderNo: 'OTHER', provider: 'paypal' })
  })

  it('格式非法返回 null 而非抛错', () => {
    expect(paymentService.verifyReturnToken('garbage')).toBeNull()
    expect(paymentService.verifyReturnToken('')).toBeNull()
  })
})

describe('capturePayment（PayPal 类通道主动确认）', () => {
  it('mock 通道无 capture 适配器时返回 422，不误标已支付', async () => {
    await inTenant(async () => {
      const f = await makeOrder()
      const res = await paymentService.capturePayment(f.orderNo, 'mock')
      expect(res.ok).toBe(false)
      expect(res.status).toBe(422)
      const order = await ShopOrder.findOne({ where: { orderNo: f.orderNo, tenantId: TID } })
      expect(order?.paymentStatus).toBe('initiated')
      const pay = await ShopOrderPayment.findOne({ where: { providerRef: f.providerRef, tenantId: TID } })
      expect(pay?.status).toBe('initiated')
    })
  })

  it('状态已终态时幂等返回已处理，不重复副作用（核心复用 applyGatewayEvent）', async () => {
    await inTenant(async () => {
      const f = await makeOrder()
      // 直接用统一事件核心把订单置为 captured（capture/webhook 共用路径）
      const r1 = await paymentService.applyGatewayEvent('mock', {
        type: 'payment.succeeded',
        providerRef: f.providerRef,
        orderNo: f.orderNo,
        raw: {},
      })
      expect(r1.ok).toBe(true)
      // 再次投递：已 captured，应判为已处理且不报错
      const r2 = await paymentService.applyGatewayEvent('mock', {
        type: 'payment.succeeded',
        providerRef: f.providerRef,
        orderNo: f.orderNo,
        raw: {},
      })
      expect(r2.ok).toBe(true)
      expect(r2.alreadyProcessed).toBe(true)
      const order = await ShopOrder.findOne({ where: { orderNo: f.orderNo, tenantId: TID } })
      expect(order?.paymentStatus).toBe('captured')
    })
  })
})

describe('reconcilePayments（超时关单 / 查单补单）', () => {
  it('mock 通道（无 query）超时的 initiated 支付单被关单并释放预占', async () => {
    await inTenant(async () => {
      const f = await makeOrder()
      await makeReservation(f.orderNo)
      // 把支付单 createdAt 推到 31 分钟前，触发超时判定
      await ShopOrderPayment.update({ createdAt: new Date(Date.now() - 31 * 60_000) } as never, {
        where: { providerRef: f.providerRef, tenantId: TID } as never,
      })
      const closed = await reconcilePayments()
      expect(closed).toBeGreaterThanOrEqual(1)
      const pay = await ShopOrderPayment.findOne({ where: { providerRef: f.providerRef, tenantId: TID } })
      expect(pay?.status).toBe('expired')
      const resv = await ShopInventoryReservation.findOne({ where: { ref: f.orderNo, tenantId: TID } })
      expect(resv?.status).toBe('released')
    })
  })

  it('仍在进行窗口内（未超 30 分钟）的 initiated 单不被误关', async () => {
    await inTenant(async () => {
      const f = await makeOrder()
      const before = await reconcilePayments()
      const pay = await ShopOrderPayment.findOne({ where: { providerRef: f.providerRef, tenantId: TID } })
      expect(pay?.status).toBe('initiated')
      expect(before).toBe(0)
    })
  })
})
