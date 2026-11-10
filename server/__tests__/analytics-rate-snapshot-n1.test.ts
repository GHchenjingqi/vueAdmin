// @vitest-environment node
/**
 * 报表汇率快照 N+1 实证测试（P1 §8.5 / 本轮下一轮候选）
 *
 * 缺口：profitReport 对每个订单调 toUSD + baselineRate，再对每个商品行调 toUSD，
 * 每笔都打一次 ShopRateSnapshot.findOne；salesReport 每组每币种各打一次。
 * 1000 单 × 数件商品 = 数千次快照查询，是 shopPhases 报表聚合慢查询 flake 的根因。
 *
 * 修复契约：报表开头一次性 findAll 预取租户全部快照，本地按 rateDate<=date 取最新，
 * findOne 调用次数应被压到接近 0（修复前为 O(N+M)）。同时 USD 换算结果必须保持不变。
 */
import { describe, it, expect, afterAll, vi } from 'vitest'
import { Op } from 'sequelize'
import {
  salesReport,
  profitReport,
} from '../modules/shop/services/analyticsService.js'
import {
  ShopOrder,
  ShopOrderItem,
  ShopSku,
  ShopRateSnapshot,
} from '../modules/shop/models/index.js'
import { runInTenant } from '../modules/tenant/context.js'

const RUN = Date.now().toString(36)
const TID = 988000 + (Number(RUN.slice(0, 3)) || 123)
const PREFIX = `rns-${RUN}-`
const DAY = '2026-01-15'

async function seed() {
  // 覆盖所有订单日期的汇率快照（rateDate <= 订单日期）
  await ShopRateSnapshot.create({
    tenantId: TID,
    baseCurrency: 'USD',
    rateDate: '2026-01-01',
    rates: { EUR: 1.1, GBP: 1.3 },
  } as never)

  // 3 个 SKU（profitReport 成本用 declaredValue）
  const skus = []
  for (let i = 0; i < 3; i++) {
    skus.push(
      await ShopSku.create({
        tenantId: TID,
        spuId: 1,
        code: `${PREFIX}SKU${i}`,
        declaredValue: 20,
      } as never),
    )
  }

  const N = 40
  for (let i = 0; i < N; i++) {
    const order = await ShopOrder.create({
      tenantId: TID,
      orderNo: `${PREFIX}ORD${i}`,
      channelId: 0,
      shopId: 0,
      buyer: { email: `${PREFIX}${i}@test.dev`, country: 'US' },
      currency: 'EUR',
      amount: 100,
      status: 'paid',
      email: `${PREFIX}${i}@test.dev`,
      createdAt: new Date(`${DAY}T00:00:00Z`),
    } as never)
    // 每单 2 个商品行，分别挂到不同 SKU
    for (let j = 0; j < 2; j++) {
      await ShopOrderItem.create({
        tenantId: TID,
        orderId: order.id,
        skuId: skus[j % skus.length].id,
        qty: 1,
        price: 50,
      } as never)
    }
  }
  return { N, skus }
}

afterAll(async () => {
  const where: Record<string | symbol, unknown> = { tenantId: TID }
  await ShopOrderItem.destroy({ where: where as never })
  await ShopOrder.destroy({ where: where as never })
  await ShopSku.destroy({ where: { code: { [Op.like]: `${PREFIX}%` } } as never })
  await ShopRateSnapshot.destroy({ where: where as never })
})

describe('报表汇率快照 N+1', () => {
  it('profitReport 不应为每单/每件打 rate_snapshots 快照查询（N+1）', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      await seed()
      const spy = vi.spyOn(ShopRateSnapshot, 'findOne')
      const report = await profitReport({ dimension: 'day', startAt: '2026-01-10', endAt: '2026-01-20' })
      // 修复前：40 单 × (revenue toUSD + baselineRate) + 80 商品行 toUSD ≈ 160 次 findOne
      // 修复后：报表开头批量 findAll 一次，本地计算，findOne 应为 0
      expect(spy.mock.calls.length).toBeLessThanOrEqual(2)
      spy.mockRestore()

      // 数量正确：40 单 × 100 EUR × 1.1 = 4400 USD
      expect(report.summary.revenueUSD).toBeCloseTo(4400, 0)
      // 成本：每单 2 行 × declaredValue20 × qty1 = 40/单 × 40 单 = 1600 EUR × 1.1 = 1760 USD
      expect(report.summary.costUSD).toBeCloseTo(1760, 0)
      expect(report.series.length).toBeGreaterThanOrEqual(1)
    })
  })

  it('salesReport 同样走批量快照路径且不改变 USD 合计', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const spy = vi.spyOn(ShopRateSnapshot, 'findOne')
      const report = await salesReport({ dimension: 'day', startAt: '2026-01-10', endAt: '2026-01-20' })
      expect(spy.mock.calls.length).toBeLessThanOrEqual(2)
      spy.mockRestore()

      // 40 单合计 4000 EUR × 1.1 = 4400 USD，集中在 1 个 day 分组
      const totalUsd = report.rows.reduce((s, r) => s + r.usdTotal, 0)
      expect(totalUsd).toBeCloseTo(4400, 0)
      expect(report.rows.length).toBe(1)
      expect(report.rows[0].orderCount).toBe(40)
    })
  })
})
