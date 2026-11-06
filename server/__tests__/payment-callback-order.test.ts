// @vitest-environment node
/**
 * G3 门禁 · 支付回调乱序 / 迟到事件状态机回归
 *
 * 对应 docs/reports/g3-gate-checklist.md §3.4：
 * 1. succeeded → 迟到 failed：不回退、不重复释放预占、独立审计；
 * 2. failed → 迟到 succeeded：服务端事实为准，订单转 captured（现状行为，业务规则待确认）；
 * 3. 多个不同 providerRef 的失败事件打到已支付订单：均不回退、库存守恒；
 * 4. refunded 终态收到 succeeded / failed：不被覆盖；
 * 5. 正常失败路径仍生效（防止终态保护过度阻断真实失败）；
 * 6. releaseReservation 对 committed 预占幂等（纵深防御）。
 *
 * 用例自建订单 + 独立 SKU 库存 + 预占，不依赖购物车/报价链路，便于隔离状态机本身。
 */
import { describe, it, expect } from 'vitest'
import { runInTenant } from '../modules/tenant/context.js'
import { ShopOrder, ShopInventory, ShopInventoryReservation } from '../modules/shop/models/index.js'
import * as auditLogService from '../modules/shop/services/auditLogService.js'
import * as reservationService from '../modules/shop/services/reservationService.js'
import * as paymentService from '../modules/storefront/services/paymentService.js'

const TID = 1
const uniq = (): string => `g3${Date.now()}${Math.floor(Math.random() * 1e6)}`

interface Fixture {
  orderId: number
  orderNo: string
  skuId: number
  reservationId: number
}

async function makeFixture(paymentStatus: string, reservationStatus = 'active'): Promise<Fixture> {
  const orderNo = 'SO' + uniq()
  const order = await ShopOrder.create({
    tenantId: TID,
    orderNo,
    channelId: 0,
    shopId: 0,
    buyer: { email: 'g3@example.com' },
    currency: 'USD',
    amount: 100,
    status: paymentStatus === 'captured' || paymentStatus === 'refunded' ? 'paid' : 'created',
    paymentStatus,
    email: 'g3@example.com',
    amountCents: 10000,
    subtotalCents: 10000,
    accessToken: 'tok_' + uniq(),
  } as never)

  const skuId = 700000 + Math.floor(Math.random() * 100000)
  const warehouseId = 700001
  await ShopInventory.create({ tenantId: TID, skuId, warehouseId, quantity: 10, locked: 2 } as never)
  const res = await ShopInventoryReservation.create({
    tenantId: TID,
    skuId,
    warehouseId,
    qty: 2,
    status: reservationStatus,
    ref: orderNo,
    expiresAt: new Date(Date.now() + 3600_000),
  } as never)
  return { orderId: order.id, orderNo, skuId, reservationId: res.id }
}

/** 每个事件使用不同的 providerRef，绕开「同 providerRef 已处理即去重」，构造真实乱序 */
function fire(type: string, orderNo: string, providerRef: string) {
  const raw = Buffer.from(JSON.stringify({ type, orderNo, providerRef, currency: 'USD' }))
  return paymentService.handleWebhook('mock', raw, paymentService.signWebhook(raw))
}

async function orderState(orderId: number) {
  const row = await ShopOrder.findByPk(orderId)
  return { paymentStatus: row?.paymentStatus, status: row?.status }
}

async function reservationStatus(id: number) {
  const row = await ShopInventoryReservation.findByPk(id)
  return row?.status
}

async function lockedOf(skuId: number): Promise<number> {
  const row = await ShopInventory.findOne({ where: { skuId, tenantId: TID } as never })
  return Number(row?.locked)
}

describe('G3 · 支付回调乱序 / 迟到事件', () => {
  it('succeeded → 迟到 failed：保持 captured/paid、预占 committed、库存不回补，且记独立审计', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const f = await makeFixture('initiated')
      const ok = await fire('payment.succeeded', f.orderNo, 'g3_ok_' + uniq())
      expect(ok.ok).toBe(true)
      expect(await orderState(f.orderId)).toEqual({ paymentStatus: 'captured', status: 'paid' })
      expect(await reservationStatus(f.reservationId)).toBe('committed')
      expect(await lockedOf(f.skuId)).toBe(2)

      const late = await fire('payment.failed', f.orderNo, 'g3_late_' + uniq())
      expect(late.ok).toBe(true)
      expect(late.alreadyProcessed).toBe(true)
      expect(await orderState(f.orderId)).toEqual({ paymentStatus: 'captured', status: 'paid' })
      expect(await reservationStatus(f.reservationId)).toBe('committed')
      expect(await lockedOf(f.skuId)).toBe(2)

      const failedAudit = await auditLogService.listByEntity({
        entityType: 'order', entityId: f.orderId, action: 'order.payment_failed',
      })
      expect(failedAudit).toHaveLength(0)
      const staleAudit = await auditLogService.listByEntity({
        entityType: 'order', entityId: f.orderId, action: 'payment.stale_failed_ignored',
      })
      expect(staleAudit).toHaveLength(1)
    })
  })

  it('failed → 迟到 succeeded：服务端事实为准，订单转 captured 且不重复动库存', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const f = await makeFixture('initiated')
      await fire('payment.failed', f.orderNo, 'g3_fail_' + uniq())
      expect((await orderState(f.orderId)).paymentStatus).toBe('failed')
      expect(await reservationStatus(f.reservationId)).toBe('released')
      expect(await lockedOf(f.skuId)).toBe(0)

      const late = await fire('payment.succeeded', f.orderNo, 'g3_late_ok_' + uniq())
      expect(late.ok).toBe(true)
      // 现状：成功以服务端回写为准，可覆盖 failed；是否允许需业务确认，本例只锁定状态机行为
      expect(await orderState(f.orderId)).toEqual({ paymentStatus: 'captured', status: 'paid' })
      expect(await reservationStatus(f.reservationId)).toBe('released')
      expect(await lockedOf(f.skuId)).toBe(0)
    })
  })

  it('不同 providerRef 的多个迟到 failed 打到已支付订单：均不回退、库存守恒', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const f = await makeFixture('captured', 'committed')
      for (let i = 0; i < 2; i++) {
        const r = await fire('payment.failed', f.orderNo, 'g3_late_' + uniq())
        expect(r.ok).toBe(true)
        expect(r.alreadyProcessed).toBe(true)
      }
      expect(await orderState(f.orderId)).toEqual({ paymentStatus: 'captured', status: 'paid' })
      expect(await reservationStatus(f.reservationId)).toBe('committed')
      expect(await lockedOf(f.skuId)).toBe(2)
    })
  })

  it('refunded 终态：succeeded / failed 均不覆盖，不重复 commit 预占', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const f = await makeFixture('refunded', 'committed')
      const s = await fire('payment.succeeded', f.orderNo, 'g3_refund_ok_' + uniq())
      expect(s.alreadyProcessed).toBe(true)
      const fl = await fire('payment.failed', f.orderNo, 'g3_refund_fail_' + uniq())
      expect(fl.alreadyProcessed).toBe(true)
      expect(await orderState(f.orderId)).toEqual({ paymentStatus: 'refunded', status: 'paid' })
      expect(await reservationStatus(f.reservationId)).toBe('committed')
      expect(await lockedOf(f.skuId)).toBe(2)
    })
  })

  it('正常失败路径仍生效：未支付订单 → failed、预占 released、库存回补、审计留存', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const f = await makeFixture('initiated')
      const r = await fire('payment.failed', f.orderNo, 'g3_plain_fail_' + uniq())
      expect(r.ok).toBe(true)
      expect(r.alreadyProcessed).toBeUndefined()
      expect((await orderState(f.orderId)).paymentStatus).toBe('failed')
      expect(await reservationStatus(f.reservationId)).toBe('released')
      expect(await lockedOf(f.skuId)).toBe(0)
      const audit = await auditLogService.listByEntity({
        entityType: 'order', entityId: f.orderId, action: 'order.payment_failed',
      })
      expect(audit).toHaveLength(1)
    })
  })

  it('releaseReservation 对 committed 预占幂等：不改状态、不回补库存', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const f = await makeFixture('captured', 'committed')
      await reservationService.releaseReservation(f.orderNo)
      await reservationService.releaseReservation(f.orderNo)
      expect(await reservationStatus(f.reservationId)).toBe('committed')
      expect(await lockedOf(f.skuId)).toBe(2)
    })
  })
})
