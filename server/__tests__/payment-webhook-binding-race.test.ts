// @vitest-environment node
/**
 * 支付 Webhook 绑定一致性与并发幂等实证
 *
 * 审计对象：server/modules/storefront/services/paymentService.ts#handleWebhook
 * 1. providerRef 与 orderNo 未交叉校验：拿 A 单支付记录的 providerRef 配 B 单 orderNo，
 *    可把 B 单标记为已支付并消费掉 A 单的支付记录；
 * 2. 同 providerRef 并发 succeeded：findOne→update 非原子，重复计数 / 重复审计；
 * 3. 同 providerRef 并发 failed：同样重复计数 / 重复审计。
 *
 * 专属租户 987695，自建订单/支付/库存/预占，与其余套件零共享行；beforeAll/afterAll 清理。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { runInTenant } from '../modules/tenant/context.js'
import {
  ShopOrder,
  ShopOrderPayment,
  ShopOrderEmail,
  ShopInventory,
  ShopInventoryReservation,
  ShopInventoryLog,
  AuditLog,
} from '../modules/shop/models/index.js'
import * as auditLogService from '../modules/shop/services/auditLogService.js'
import * as paymentService from '../modules/storefront/services/paymentService.js'
import * as monitoring from '../modules/storefront/services/monitoringService.js'

const TID = 987695
const inTenant = <T>(fn: () => Promise<T>): Promise<T> => runInTenant({ tenantId: TID }, fn)
const uniq = (): string => `pwb${Date.now()}${Math.floor(Math.random() * 1e6)}`

interface Fixture {
  orderId: number
  orderNo: string
  skuId: number
}

async function makeOrder(): Promise<Fixture> {
  const orderNo = 'PWB' + uniq()
  const order = await ShopOrder.create({
    tenantId: TID,
    orderNo,
    channelId: 0,
    shopId: 0,
    buyer: { email: 'pwb@example.com' },
    currency: 'USD',
    amount: 100,
    status: 'created',
    paymentStatus: 'initiated',
    email: 'pwb@example.com',
    amountCents: 10000,
    subtotalCents: 10000,
    accessToken: 'tok_' + orderNo,
  } as never)
  const skuId = 790000 + Math.floor(Math.random() * 10000)
  return { orderId: order.id, orderNo, skuId }
}

async function makePayment(f: Fixture, providerRef: string): Promise<void> {
  await ShopOrderPayment.create({
    tenantId: TID,
    orderId: f.orderId,
    orderNo: f.orderNo,
    provider: 'mock',
    providerRef,
    sessionId: 'sess_' + uniq(),
    amountCents: 10000,
    currency: 'USD',
    status: 'initiated',
  } as never)
}

async function makeReservation(f: Fixture, qty = 2): Promise<void> {
  await ShopInventory.create({ tenantId: TID, skuId: f.skuId, warehouseId: 790001, quantity: 10, locked: qty } as never)
  await ShopInventoryReservation.create({
    tenantId: TID,
    skuId: f.skuId,
    warehouseId: 790001,
    qty,
    status: 'active',
    ref: f.orderNo,
    expiresAt: new Date(Date.now() + 3600_000),
  } as never)
}

function fire(type: string, orderNo: string, providerRef: string) {
  const raw = Buffer.from(JSON.stringify({ type, orderNo, providerRef, currency: 'USD' }))
  return paymentService.handleWebhook('mock', raw, paymentService.signWebhook(raw))
}

async function clean(): Promise<void> {
  await inTenant(async () => {
    await ShopOrderEmail.destroy({ where: { tenantId: TID } })
    await AuditLog.destroy({ where: { tenantId: TID } })
    await ShopInventoryLog.destroy({ where: { tenantId: TID } })
    await ShopInventoryReservation.destroy({ where: { tenantId: TID } })
    await ShopInventory.destroy({ where: { tenantId: TID } })
    await ShopOrderPayment.destroy({ where: { tenantId: TID } })
    await ShopOrder.destroy({ where: { tenantId: TID } })
  })
}

beforeAll(clean)
afterAll(clean)

describe('支付 Webhook · providerRef ↔ orderNo 绑定', () => {
  it('A 单 providerRef 不得用于支付 B 单（越权改单 + 消费他人支付记录）', async () => {
    await inTenant(async () => {
      const a = await makeOrder()
      const b = await makeOrder()
      const providerRef = 'PWB_BIND_A_' + uniq()
      await makePayment(a, providerRef)

      const result = await fire('payment.succeeded', b.orderNo, providerRef)
      const bRow = await ShopOrder.findByPk(b.orderId)
      const aPayment = await ShopOrderPayment.findOne({ where: { tenantId: TID, providerRef } })

      const snapshot = {
        status: result.status,
        bPaymentStatus: bRow?.paymentStatus,
        bStatus: bRow?.status,
        aPaymentStatus: aPayment?.status,
      }

      expect(snapshot).toEqual({
        status: 400,
        bPaymentStatus: 'initiated',
        bStatus: 'created',
        aPaymentStatus: 'initiated',
      })
    })
  })

  it('同 providerRef 顺序重放仍幂等（回归保护，不得误伤既有去重语义）', async () => {
    await inTenant(async () => {
      const f = await makeOrder()
      const providerRef = 'PWB_REPLAY_' + uniq()
      await makePayment(f, providerRef)
      await makeReservation(f)

      const first = await fire('payment.succeeded', f.orderNo, providerRef)
      const second = await fire('payment.succeeded', f.orderNo, providerRef)
      expect(first.ok).toBe(true)
      expect(first.alreadyProcessed).toBeUndefined()
      expect(second.alreadyProcessed).toBe(true)
      expect((await ShopOrder.findByPk(f.orderId))?.paymentStatus).toBe('captured')
    })
  })
})

describe('支付 Webhook · 并发幂等', () => {
  it('8 个并发 succeeded：仅 1 次计数 / 1 组审计 / 1 次预占提交', async () => {
    await inTenant(async () => {
      const f = await makeOrder()
      const providerRef = 'PWB_RACE_OK_' + uniq()
      await makePayment(f, providerRef)
      await makeReservation(f)
      const counterBefore = monitoring.getCounter('payment_success')

      const results = await Promise.allSettled(Array.from({ length: 8 }, () => fire('payment.succeeded', f.orderNo, providerRef)))
      const order = await ShopOrder.findByPk(f.orderId)
      const res = await ShopInventoryReservation.findOne({ where: { tenantId: TID, ref: f.orderNo } })
      const inv = await ShopInventory.findOne({ where: { tenantId: TID, skuId: f.skuId } })
      const capturedAudit = await auditLogService.listByEntity({ entityType: 'order', entityId: f.orderId, action: 'order.payment_captured' })
      const paymentAudit = await auditLogService.listByEntity({ entityType: 'payment', entityId: f.orderId, action: 'payment.captured' })

      const snapshot = {
        fulfilled: results.filter((r) => r.status === 'fulfilled').length,
        successDelta: monitoring.getCounter('payment_success') - counterBefore,
        capturedAudit: capturedAudit.length,
        paymentAudit: paymentAudit.length,
        paymentStatus: order?.paymentStatus,
        reservationStatus: res?.status,
        locked: Number(inv?.locked),
      }

      expect(snapshot).toEqual({
        fulfilled: 8,
        successDelta: 1,
        capturedAudit: 1,
        paymentAudit: 1,
        paymentStatus: 'captured',
        reservationStatus: 'committed',
        locked: 2,
      })
    })
  })

  it('8 个并发 failed：仅 1 次计数 / 1 条审计 / 库存只回补一次', async () => {
    await inTenant(async () => {
      const f = await makeOrder()
      const providerRef = 'PWB_RACE_FAIL_' + uniq()
      await makePayment(f, providerRef)
      await makeReservation(f)
      const counterBefore = monitoring.getCounter('payment_failure')

      const results = await Promise.allSettled(Array.from({ length: 8 }, () => fire('payment.failed', f.orderNo, providerRef)))
      const order = await ShopOrder.findByPk(f.orderId)
      const res = await ShopInventoryReservation.findOne({ where: { tenantId: TID, ref: f.orderNo } })
      const inv = await ShopInventory.findOne({ where: { tenantId: TID, skuId: f.skuId } })
      const failedAudit = await auditLogService.listByEntity({ entityType: 'order', entityId: f.orderId, action: 'order.payment_failed' })
      const unlockLogs = await ShopInventoryLog.count({ where: { tenantId: TID, skuId: f.skuId, type: 'unlock' } })

      const snapshot = {
        fulfilled: results.filter((r) => r.status === 'fulfilled').length,
        failureDelta: monitoring.getCounter('payment_failure') - counterBefore,
        failedAudit: failedAudit.length,
        paymentStatus: order?.paymentStatus,
        reservationStatus: res?.status,
        locked: Number(inv?.locked),
        unlockLogs,
      }

      expect(snapshot).toEqual({
        fulfilled: 8,
        failureDelta: 1,
        failedAudit: 1,
        paymentStatus: 'failed',
        reservationStatus: 'released',
        locked: 0,
        unlockLogs: 1,
      })
    })
  })
})
