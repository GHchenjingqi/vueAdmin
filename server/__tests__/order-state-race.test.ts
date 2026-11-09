// @vitest-environment node
/**
 * 订单状态流转并发幂等回归
 *
 * 缺陷背景（2026-11-09 实证）：`orderService.ship` / `cancel` / `markPaid`
 * 在事务外先查状态、事务内才改状态，且 ship 的 createShipment 在事务外。
 * 并发窗口内两个请求都能通过状态检查，实测：
 * - 并发两次 ship -> 两次都成功、在库量 10->8（双扣）、2 个运单 + 2 个 trackingNo；
 * - ship 与 cancel 交叉 -> 两者都成功返回，订单 shipped 但占用被释放两次；
 * - 并发两次 cancel / cancel 与 markPaid 交叉 -> 两者都成功返回，状态由后写覆盖决定。
 *
 * 修复：三个状态流转统一放进同一事务，用 `FOR UPDATE` 锁订单行并在锁内二次校验状态；
 * createShipment 也移入锁内，被拒绝的并发请求不再产生外部运单与通知去重键。
 * 全部数据使用独立租户 987692，与并行方 dev 数据零共享。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { runInTenant } from '../modules/tenant/context.js'
import {
  ShopOrder,
  ShopOrderItem,
  ShopOrderShipment,
  ShopOrderEmail,
  ShopSku,
  ShopInventory,
  ShopInventoryLog,
} from '../modules/shop/models/index.js'
import * as orderService from '../modules/shop/services/orderService.js'

const TID = 987692
const EMAIL = 'order-race@test.dev'
const uniq = (): string => `or${Date.now()}${Math.floor(Math.random() * 1e6)}`
const inTenant = <T>(fn: () => Promise<T>): Promise<T> => runInTenant({ tenantId: TID }, fn)

async function seed(status = 'paid', withItems = true): Promise<{ orderId: number; skuId: number }> {
  const sku = await ShopSku.create({
    spuId: 1,
    code: 'RACE-' + uniq(),
    status: 'listed',
    tenantId: TID,
  } as never)
  await ShopInventory.create({
    skuId: sku.id,
    warehouseId: 1,
    quantity: 10,
    locked: 1,
    tenantId: TID,
  } as never)
  const order = await ShopOrder.create({
    orderNo: 'RACE-ORDER-' + uniq(),
    channelId: 1,
    shopId: 1,
    buyer: { name: 'race-test' },
    currency: 'USD',
    amount: 100,
    status,
    email: EMAIL,
    tenantId: TID,
  } as never)
  if (withItems) {
    await ShopOrderItem.create({
      orderId: order.id,
      skuId: sku.id,
      qty: 1,
      price: 100,
      tenantId: TID,
    } as never)
  }
  return { orderId: order.id, skuId: sku.id }
}

async function state(orderId: number, skuId: number) {
  const [order, inv, shipments, mails] = await Promise.all([
    ShopOrder.findByPk(orderId),
    ShopInventory.findOne({ where: { skuId, tenantId: TID } }),
    ShopOrderShipment.findAll({ where: { orderId, tenantId: TID } }),
    ShopOrderEmail.findAll({ where: { orderId, tenantId: TID } }),
  ])
  return {
    status: order?.status,
    quantity: inv ? Number(inv.quantity) : null,
    locked: inv ? Number(inv.locked) : null,
    shipments: shipments.length,
    mails: mails.length,
  }
}

const ship = (orderId: number) => orderService.ship(orderId, { carrier: 'test-carrier' } as never)
const settled = (rs: PromiseSettledResult<unknown>[]) => ({
  ok: rs.filter((r) => r.status === 'fulfilled').length,
  rejected: rs.filter((r) => r.status === 'rejected').length,
})

beforeEach(async () => {
  await inTenant(async () => {
    await ShopOrderEmail.destroy({ where: { tenantId: TID } })
    await ShopOrderShipment.destroy({ where: { tenantId: TID } })
    await ShopOrderItem.destroy({ where: { tenantId: TID } })
    await ShopInventoryLog.destroy({ where: { tenantId: TID } })
    await ShopInventory.destroy({ where: { tenantId: TID } })
    await ShopSku.destroy({ where: { tenantId: TID } })
    await ShopOrder.destroy({ where: { tenantId: TID } })
  })
})

describe('同一订单并发状态流转只能成功一次', () => {
  it('并发两次 ship：只扣一次库存、只生成一条运单与一封通知', async () => {
    await inTenant(async () => {
      const { orderId, skuId } = await seed()
      const rs = await Promise.allSettled([ship(orderId), ship(orderId)])
      expect(settled(rs)).toEqual({ ok: 1, rejected: 1 })
      expect(await state(orderId, skuId)).toMatchObject({
        status: 'shipped', quantity: 9, locked: 0, shipments: 1, mails: 1,
      })
    })
  })

  it('顺序重放 ship：第二次仍按状态机拒绝（既有契约不变）', async () => {
    await inTenant(async () => {
      const { orderId, skuId } = await seed()
      await expect(ship(orderId)).resolves.toMatchObject({ status: 'shipped' })
      await expect(ship(orderId)).rejects.toThrow(/不可发货/)
      expect(await state(orderId, skuId)).toMatchObject({ quantity: 9, shipments: 1 })
    })
  })

  it('ship 与 cancel 交叉：只有一个成功，状态与库存账一致', async () => {
    await inTenant(async () => {
      const { orderId, skuId } = await seed()
      const rs = await Promise.allSettled([ship(orderId), orderService.cancel(orderId)])
      expect(settled(rs)).toEqual({ ok: 1, rejected: 1 })
      const s = await state(orderId, skuId)
      if (s.status === 'shipped') {
        expect(s).toMatchObject({ quantity: 9, locked: 0, shipments: 1 })
      } else {
        expect(s).toMatchObject({ status: 'cancelled', quantity: 10, locked: 0, shipments: 0 })
      }
    })
  })

  it('并发两次 cancel：只有一个成功', async () => {
    await inTenant(async () => {
      const { orderId, skuId } = await seed()
      const rs = await Promise.allSettled([orderService.cancel(orderId), orderService.cancel(orderId)])
      expect(settled(rs)).toEqual({ ok: 1, rejected: 1 })
      expect(await state(orderId, skuId)).toMatchObject({ status: 'cancelled', quantity: 10, locked: 0 })
    })
  })

  it('cancel 与 markPaid 交叉：只有一个成功，取消不会被改回已支付', async () => {
    await inTenant(async () => {
      const { orderId, skuId } = await seed('created')
      const rs = await Promise.allSettled([orderService.cancel(orderId), orderService.markPaid(orderId)])
      expect(settled(rs)).toEqual({ ok: 1, rejected: 1 })
      const s = await state(orderId, skuId)
      expect(['cancelled', 'paid']).toContain(s.status)
      if (s.status === 'paid') {
        // markPaid 先拿锁时 cancel 应被拒绝，占用仍应保持
        expect(s).toMatchObject({ quantity: 10, locked: 1 })
      } else {
        expect(s).toMatchObject({ quantity: 10, locked: 0 })
      }
    })
  })

  it('并发两次 markPaid：只有一个成功', async () => {
    await inTenant(async () => {
      const { orderId } = await seed('created')
      const rs = await Promise.allSettled([orderService.markPaid(orderId), orderService.markPaid(orderId)])
      expect(settled(rs)).toEqual({ ok: 1, rejected: 1 })
      expect((await ShopOrder.findByPk(orderId))?.status).toBe('paid')
    })
  })
})

describe('既有状态机与边界契约不回退', () => {
  it('单次合法 ship 正常发货', async () => {
    await inTenant(async () => {
      const { orderId, skuId } = await seed()
      await expect(ship(orderId)).resolves.toMatchObject({ status: 'shipped' })
      expect(await state(orderId, skuId)).toMatchObject({
        status: 'shipped', quantity: 9, locked: 0, shipments: 1, mails: 1,
      })
    })
  })

  it('单次合法 cancel 释放占用', async () => {
    await inTenant(async () => {
      const { orderId, skuId } = await seed()
      await expect(orderService.cancel(orderId)).resolves.toMatchObject({ status: 'cancelled' })
      expect(await state(orderId, skuId)).toMatchObject({ status: 'cancelled', quantity: 10, locked: 0 })
    })
  })

  it('单次合法 markPaid 从 created 流转到 paid', async () => {
    await inTenant(async () => {
      const { orderId } = await seed('created')
      await expect(orderService.markPaid(orderId)).resolves.toMatchObject({ status: 'paid' })
    })
  })

  it('已发货订单不可再发货 / 不可取消', async () => {
    await inTenant(async () => {
      const { orderId } = await seed('shipped')
      await expect(ship(orderId)).rejects.toThrow(/不可发货/)
      await expect(orderService.cancel(orderId)).rejects.toThrow(/不可取消/)
    })
  })

  it('不存在的订单返回 404', async () => {
    await inTenant(async () => {
      await expect(ship(99999999)).rejects.toThrow(/不存在/)
      await expect(orderService.cancel(99999999)).rejects.toThrow(/不存在/)
      await expect(orderService.markPaid(99999999)).rejects.toThrow(/不存在/)
    })
  })

  it('无明细订单不可发货', async () => {
    await inTenant(async () => {
      const { orderId } = await seed('paid', false)
      await expect(ship(orderId)).rejects.toThrow(/无明细/)
      expect((await ShopOrder.findByPk(orderId))?.status).toBe('paid')
    })
  })
})
