// @vitest-environment node
/**
 * RMA 超额退款回归
 *
 * 缺陷背景（2026-11-06 实证）：`submitRma` 只逐条校验 `qty <= oi.qty`，
 * 从不按 orderItemId 累计，导致两条放大路径：
 * - 单次请求把同一明细重复 3 次 -> refundAmountCents=30000（实购 10000）；
 * - 同一订单重复提交 3 次 -> 3 行 pending、合计 30000（实购 10000）。
 *
 * 修复：事务内锁订单行串行化并发提交 + 历史有效申请按明细累计 + 本次请求按明细聚合，
 * cancelled / rejected 的历史申请不占用额度。
 * 全部数据使用独立租户 987671，与并行方 dev 数据零共享。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { runInTenant } from '../modules/tenant/context.js'
import { ShopOrder, ShopOrderItem, ShopRmaRequest } from '../modules/shop/models/index.js'
import * as rmaService from '../modules/storefront/services/rmaService.js'

const TID = 987671
const EMAIL = 'rma-overrefund@test.dev'
const site = { tenantId: TID, channelId: 0, shopId: 0, defaultCurrency: 'USD', defaultLocale: 'en-US' } as never
const auth = { customerId: 1, email: EMAIL }
const uniq = (): string => `ro${Date.now()}${Math.floor(Math.random() * 1e6)}`
const inTenant = <T>(fn: () => Promise<T>): Promise<T> => runInTenant({ tenantId: TID }, fn)

type Line = { orderItemId: number; skuId: number; qty: number }

async function seed(specs: { qty: number; cents: number }[] = [{ qty: 1, cents: 10000 }]) {
  const order = await ShopOrder.create({
    tenantId: TID,
    orderNo: 'RO' + uniq(),
    channelId: 0,
    shopId: 0,
    buyer: { email: EMAIL },
    currency: 'USD',
    amount: 100,
    status: 'shipped',
    email: EMAIL,
    amountCents: 10000,
    subtotalCents: 10000,
    accessToken: 'tok_' + uniq(),
  } as never)
  const items: ShopOrderItem[] = []
  for (let i = 0; i < specs.length; i++) {
    const s = specs[i]
    items.push(await ShopOrderItem.create({
      tenantId: TID,
      orderId: order.id,
      skuId: 991000 + i,
      qty: s.qty,
      price: s.cents / 100,
      unitAmountCents: s.cents,
      lineTotalCents: s.cents * s.qty,
      title: 'audit-item-' + i,
    } as never))
  }
  return { orderId: order.id, items }
}

const line = (it: ShopOrderItem, qty = 1): Line => ({ orderItemId: it.id, skuId: it.skuId, qty })
const submit = (orderId: number, items: Line[]) => rmaService.submitRma(site, { orderId, items }, auth)
const pendingTotal = async (orderId: number): Promise<number> => {
  const rows = await ShopRmaRequest.findAll({ where: { tenantId: TID, orderId } })
  return rows.reduce((s, r) => s + Number(r.refundAmountCents), 0)
}

beforeEach(async () => {
  await inTenant(async () => {
    await ShopRmaRequest.destroy({ where: { tenantId: TID } })
    await ShopOrderItem.destroy({ where: { tenantId: TID } })
    await ShopOrder.destroy({ where: { tenantId: TID } })
  })
})

describe('单次请求内累计校验', () => {
  it('同一明细重复 3 次 -> 400 且不落库', async () => {
    await inTenant(async () => {
      const { orderId, items } = await seed()
      const l = line(items[0])
      await expect(submit(orderId, [l, l, l])).rejects.toMatchObject({ statusCode: 400 })
      expect(await pendingTotal(orderId)).toBe(0)
    })
  })

  it('已购 2 件：本次累计 2 件合法，金额按快照单价重算', async () => {
    await inTenant(async () => {
      const { orderId, items } = await seed([{ qty: 2, cents: 10000 }])
      const r = await submit(orderId, [line(items[0], 1), line(items[0], 1)])
      expect(r.refundAmountCents).toBe(20000)
      expect(await pendingTotal(orderId)).toBe(20000)
    })
  })

  it('已购 2 件：本次累计 3 件 -> 400，整单不落库', async () => {
    await inTenant(async () => {
      const { orderId, items } = await seed([{ qty: 2, cents: 10000 }])
      await expect(submit(orderId, [line(items[0], 1), line(items[0], 1), line(items[0], 1)]))
        .rejects.toMatchObject({ statusCode: 400 })
      expect(await pendingTotal(orderId)).toBe(0)
    })
  })

  it('不同明细额度互相独立', async () => {
    await inTenant(async () => {
      const { orderId, items } = await seed([{ qty: 1, cents: 10000 }, { qty: 1, cents: 5000 }])
      const r = await submit(orderId, [line(items[0]), line(items[1])])
      expect(r.refundAmountCents).toBe(15000)
      expect(await pendingTotal(orderId)).toBe(15000)
    })
  })
})

describe('跨申请累计与并发串行化', () => {
  it('顺序重复提交：第二次起 400，累计不超过实购', async () => {
    await inTenant(async () => {
      const { orderId, items } = await seed()
      await expect(submit(orderId, [line(items[0])])).resolves.toMatchObject({ refundAmountCents: 10000 })
      await expect(submit(orderId, [line(items[0])])).rejects.toMatchObject({ statusCode: 400 })
      await expect(submit(orderId, [line(items[0])])).rejects.toMatchObject({ statusCode: 400 })
      expect(await ShopRmaRequest.count({ where: { tenantId: TID, orderId } })).toBe(1)
      expect(await pendingTotal(orderId)).toBe(10000)
    })
  })

  it('并发提交两次：只有一个成功，累计不超过实购', async () => {
    await inTenant(async () => {
      const { orderId, items } = await seed()
      const results = await Promise.allSettled([
        submit(orderId, [line(items[0])]),
        submit(orderId, [line(items[0])]),
      ])
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
      expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1)
      expect(await ShopRmaRequest.count({ where: { tenantId: TID, orderId } })).toBe(1)
      expect(await pendingTotal(orderId)).toBe(10000)
    })
  })

  it('已购 2 件分两次申请合法，第三次超额拒绝', async () => {
    await inTenant(async () => {
      const { orderId, items } = await seed([{ qty: 2, cents: 10000 }])
      await expect(submit(orderId, [line(items[0])])).resolves.toMatchObject({ refundAmountCents: 10000 })
      await expect(submit(orderId, [line(items[0])])).resolves.toMatchObject({ refundAmountCents: 10000 })
      await expect(submit(orderId, [line(items[0])])).rejects.toMatchObject({ statusCode: 400 })
      expect(await pendingTotal(orderId)).toBe(20000)
    })
  })

  it('cancelled / rejected 的历史申请不占额度', async () => {
    await inTenant(async () => {
      const { orderId, items } = await seed()
      const first = await submit(orderId, [line(items[0])])
      await ShopRmaRequest.update(
        { status: 'cancelled' },
        { where: { tenantId: TID, id: first.id } } as never,
      )
      await expect(submit(orderId, [line(items[0])])).resolves.toMatchObject({ refundAmountCents: 10000 })
      const rows = await ShopRmaRequest.findAll({ where: { tenantId: TID, orderId } })
      await ShopRmaRequest.update(
        { status: 'rejected' },
        { where: { tenantId: TID, id: rows[1].id } } as never,
      )
      await expect(submit(orderId, [line(items[0])])).resolves.toMatchObject({ refundAmountCents: 10000 })
      // 最终 3 行中只有最后一条是有效申请，前两条已失效不占额度
      const finalRows = await ShopRmaRequest.findAll({ where: { tenantId: TID, orderId } })
      expect(finalRows).toHaveLength(3)
      expect(finalRows.filter((r) => !['cancelled', 'rejected'].includes(r.status))).toHaveLength(1)
      // 有效金额仍需守住实购上限
      expect(finalRows.filter((r) => !['cancelled', 'rejected'].includes(r.status))
        .reduce((s, r) => s + Number(r.refundAmountCents), 0)).toBe(10000)
    })
  })
})
