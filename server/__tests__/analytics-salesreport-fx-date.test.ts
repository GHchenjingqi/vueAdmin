// @vitest-environment node
/**
 * salesReport 汇率换算日期实证测试（发现式审计 · 下一轮候选）
 *
 * 缺口：salesReport 在聚合各组 USD 合计时，用的是 `new Date()`（运行当天）
 * 作为汇率快照生效日，而非该组交易的实际日期。profitReport 已按订单日期
 * 逐单逐行换算（第 140/149 行），salesReport 遗漏同一修正 → 历史周期报表
 * 被错算成「今天」的汇率，与时间区间无关的隐性错误。
 *
 * 实证：种入两档快照 2024-01-01→EUR0.5、2026-01-01→EUR1.0；建 1 笔 2024-01-15
 * 的 EUR 订单（合计 100 EUR）。
 *   - 错误实现（按今天换算）：100 × 1.0 = 100 USD
 *   - 正确实现（按订单日期 2024-01-15 换算）：100 × 0.5 = 50 USD
 * 断言 usdTotal ≈ 50，修复前为红。
 *
 * 修复契约：每个商品行按所属订单的实际交易日期换算，>= profitReport 口径，
 * 且不引入任何逐行 DB 查询（纯内存 rateAt）。
 */
import { describe, it, expect, afterAll, vi } from 'vitest'
import { Op } from 'sequelize'
import { salesReport } from '../modules/shop/services/analyticsService.js'
import {
  ShopOrder,
  ShopOrderItem,
  ShopSku,
  ShopRateSnapshot,
} from '../modules/shop/models/index.js'
import { runInTenant } from '../modules/tenant/context.js'

const RUN = Date.now().toString(36)
const TID = 987000 + (Number(RUN.slice(0, 3)) || 123)
const PREFIX = `srfx-${RUN}-`
const DAY = '2024-01-15'

async function seed() {
  // 两档汇率快照：历史档（2024）与当前档（2026），差距足以暴露日期错用
  await ShopRateSnapshot.create({
    tenantId: TID,
    baseCurrency: 'USD',
    rateDate: '2024-01-01',
    rates: { EUR: 0.5 },
  } as never)
  await ShopRateSnapshot.create({
    tenantId: TID,
    baseCurrency: 'USD',
    rateDate: '2026-01-01',
    rates: { EUR: 1.0 },
  } as never)

  const sku = await ShopSku.create({
    tenantId: TID,
    spuId: 1,
    code: `${PREFIX}SKU`,
    declaredValue: 0,
  } as never)

  const order = await ShopOrder.create({
    tenantId: TID,
    orderNo: `${PREFIX}ORD`,
    channelId: 0,
    shopId: 0,
    buyer: { email: `${PREFIX}@test.dev`, country: 'US' },
    currency: 'EUR',
    amount: 100,
    status: 'paid',
    email: `${PREFIX}@test.dev`,
    createdAt: new Date(`${DAY}T00:00:00Z`),
  } as never)

  // 2 个商品行，合计 price*qty = 100 EUR
  for (let j = 0; j < 2; j++) {
    await ShopOrderItem.create({
      tenantId: TID,
      orderId: order.id,
      skuId: sku.id,
      qty: 1,
      price: 50,
    } as never)
  }
  return { sku, order }
}

afterAll(async () => {
  const where: Record<string | symbol, unknown> = { tenantId: TID }
  await ShopOrderItem.destroy({ where: where as never })
  await ShopOrder.destroy({ where: where as never })
  await ShopSku.destroy({ where: { code: { [Op.like]: `${PREFIX}%` } } as never })
  await ShopRateSnapshot.destroy({ where: where as never })
})

describe('salesReport 汇率换算应使用订单实际日期', () => {
  it('day 维度：历史周期按交易日期（2024-01-15）而非今天换算', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      await seed()
      const report = await salesReport({ dimension: 'day', startAt: '2024-01-10', endAt: '2024-01-20' })
      const dayRow = report.rows.find((r) => r.key.startsWith('day:2024-01-15'))
      expect(dayRow).toBeDefined()
      // 正确：100 EUR × 0.5 = 50 USD；错误（按今天 2026 换算）：100 EUR × 1.0 = 100 USD
      expect(dayRow!.usdTotal).toBeCloseTo(50, 2)
    })
  })

  it('回归守卫：不退回逐行 findOne 快照查询', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const spy = vi.spyOn(ShopRateSnapshot, 'findOne')
      await salesReport({ dimension: 'day', startAt: '2024-01-10', endAt: '2024-01-20' })
      expect(spy.mock.calls.length).toBeLessThanOrEqual(2)
      spy.mockRestore()
    })
  })
})
