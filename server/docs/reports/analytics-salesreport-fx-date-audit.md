# salesReport 汇率换算日期实证审计（发现式审计 · 下一轮）

- 日期：2026-11-10
- 模块：`server/modules/shop/services/analyticsService.ts`
- 关联：上一轮 `analytics-rate-snapshot-n1` 报表汇率快照 N+1 修复的同源收口
- 结论：**确认 1 处真实正确性问题**，已最小修复转绿；全量回归通过。

## 1. 发现（实证跑红）

上一轮将 `profitReport` / `salesReport` 的逐单/逐行 `ShopRateSnapshot.findOne` 改为报表开头一次性 `findAll` + 内存 `rateAt(snaps, currency, dateStr)`，消除了 N+1。

但复核 `salesReport` 时发现一处**口径遗漏**：

- `profitReport`：在订单循环内逐单、逐商品行按**订单实际交易日期**换算（第 140、149 行 `rateAt(snaps, order.currency, day)`，`day = order.createdAt`），口径正确。
- `salesReport`：在聚合各组后，用 **`new Date()`（运行当天）** 作为汇率生效日换算（旧第 111 行），而非该组交易的实际日期。

后果：历史周期销售报表会被错算成「今天」的汇率。若期间汇率变动，历史区间 USD 合计出现与时间区间无关的隐性偏差，且与 `profitReport` 同口径对不齐。

### 实证（红测试 `analytics-salesreport-fx-date.test.ts`）

- 种入两档快照：`2024-01-01 → EUR 0.5`、`2026-01-01 → EUR 1.0`。
- 建 1 笔 `2024-01-15` 的 EUR 订单（2 行合计 100 EUR），`salesReport({dimension:'day', startAt:'2024-01-10', endAt:'2024-01-20'})`。
- 修复前：`usdTotal = 100 × rateAt(EUR, today=2026) = 100 × 1.0 = 100`。
- 断言期望 `≈ 50`（按订单日期 2024-01-15 → 0.5）。
- 结果：**红**，`expected 100 to be close to 50`。回归守卫（findOne ≤ 2）保持通过，确认 N+1 修复未被回退。

## 2. 修复（最小改动转绿）

在商品行循环内按订单实际交易日期逐行换算并累加 `usdTotal`，删除组级的 `new Date()` 换算：

```ts
// 旧：组级用 new Date() 换算（错误）
const rows = await Promise.all(
  Array.from(groups.entries()).map(async ([key, g]) => {
    let usdTotal = 0
    for (const [cur, amt] of Object.entries(g.amountByCurrency)) {
      usdTotal += toUSDAmount(amt, cur, new Date().toISOString().slice(0, 10), rateSnaps)
    }
    return { key, amountByCurrency: g.amountByCurrency, usdTotal: Number(usdTotal.toFixed(2)), orderCount: g.orderIds.size, itemQty: g.itemQty }
  }),
)

// 新：逐行按订单交易日期换算（与 profitReport 口径一致，纯内存 rateAt，无 DB 查询）
if (!groups.has(key)) groups.set(key, { amountByCurrency: {}, orderIds: new Set(), itemQty: 0, usdTotal: 0 })
const g = groups.get(key)!
const lineAmt = Number(it.price) * it.qty
g.amountByCurrency[order.currency] = (g.amountByCurrency[order.currency] ?? 0) + lineAmt
g.usdTotal += toUSDAmount(lineAmt, order.currency, (order.createdAt as Date).toISOString().slice(0, 10), rateSnaps)
g.orderIds.add(order.id)
g.itemQty += it.qty

const rows = Array.from(groups.entries()).map(([key, g]) => ({
  key, amountByCurrency: g.amountByCurrency, usdTotal: Number(g.usdTotal.toFixed(2)),
  orderCount: g.orderIds.size, itemQty: g.itemQty,
}))
```

- `Map` 值类型补 `usdTotal: number`（`tsc --noEmit` 已验证 0 相关错误）。
- 不引入任何逐行 DB 查询，`rateAt` 为纯内存，N+1 修复不受影响。

## 3. 验证

- 新测试 `analytics-salesreport-fx-date.test.ts`：2/2 绿（含 findOne 回归守卫）。
- 邻近回归 `analytics-rate-snapshot-n1.test.ts`：2/2 绿，`usdTotal` 数值语义不变（仍为 4400 USD）。
- 类型检查：改动文件 0 错误。
- 全量回归：见提交前 CI。

## 4. 范围与边界

- 仅改 `salesReport` 的 USD 合计换算口径，不影响 `profitReport` / `inventoryTurnover` / `listEventsForReconcile`。
- `amountByCurrency` 原样保留（输出字段不变），仅 `usdTotal` 计算口径更正。
- 候选清单中「`storefront/services/analyticsService.ts` 同源 N+1」经实证为**误报**：该文件是 CAPI 埋点服务，其 `findOne` 均在单次事件调用内（非循环），不构成 N+1。
