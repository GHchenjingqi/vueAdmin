# 报表汇率快照 N+1 修复（P1 §8.5 下一轮候选）

- 来源：`p1-hardening-audit.md` §8.5「`analyticsService` 的逐单汇率快照 N+1 与全表聚合仍在，本批只消除了测试噪声；如需根治建议改为单次批量预取快照 + 按日期范围分页」
- 方法：先写实证测试 spy `ShopRateSnapshot.findOne` 跑红坐实 → 报表开头批量 `findAll` 预取全部快照、本地按 `rateDate<=date` 取最新 rate → 转绿 → 全量回归
- 本轮**未触碰任何并行方 WIP**（会员 / 营销邮件 / 顾客管理 / checkout / quote / refund / customerAuth / `_e2e_mail.ts` 等），全程精准 `git add` 仅 3 个本任务文件

---

## 1. 背景与缺口

`salesReport` / `profitReport` 的 USD 换算依赖 `rate_snapshots` 历史快照（禁止实时汇率回溯）。原实现把换算封装成 `toUSD(amount, currency, date)` / `baselineRate(currency)`，二者各自向 `rate_snapshots` 打一次 `ShopRateSnapshot.findOne`。

`profitReport`（原 `analyticsService.ts:119-146`）在**逐订单**循环里调用：
- `toUSD(order.amount, …)` —— 每单 1 次 `findOne`
- `baselineRate(currency)` —— 每单 1 次 `findOne`
- 内层**逐商品行**再 `toUSD(declared*qty, …)` —— 每行 1 次 `findOne`

即查询量 = `2×订单数 + 商品行数`。当租户有 1000 单、每单数件商品时，单次报表要打数千次快照查询——这正是 `shopPhases.test.ts`「销售报表能聚合订单」偶发 7–11s 慢查询（历史 flake）的根因之一。

---

## 2. 实证跑红（`analytics-rate-snapshot-n1.test.ts`，2/2 全红）

构造隔离租户：1 条覆盖所有订单日期的汇率快照（`EUR:1.1`）、40 单 `EUR` 订单（每单 2 商品行挂到 3 个 `declaredValue=20` 的 SKU），spy `ShopRateSnapshot.findOne`：

| 用例 | 修复前 findOne 次数 | 断言 |
| --- | --- | --- |
| profitReport | **160**（40×2 + 80 商品行） | `≤2` → 失败 |
| salesReport | **161** | `≤2` → 失败 |

可见报表对每个订单 / 商品行都触发一次独立的快照查询，典型的 N+1。

---

## 3. 修复（单文件 `analyticsService.ts`，+58/−44）

- 删除 `toUSD` / `baselineRate`（各打一次 `findOne`），新增：
  - `loadRateSnapshots()`：报表开头**一次性** `ShopRateSnapshot.findAll({ tenantId, order: rateDate ASC })`，把租户全部快照装进内存（快照表通常每日一行，体量极小）。
  - `rateAt(snaps, currency, dateStr)`：本地按 `rateDate <= dateStr` 取**最新生效**快照的汇率（与原 `findOne` 的 `rateDate <= date ORDER BY rateDate DESC LIMIT 1` 语义完全一致），无快照退化为 1。
  - `toUSDAmount(amount, currency, dateStr, snaps)`：同步本地换算。
- `salesReport` / `profitReport` 开头各 `await loadRateSnapshots()` 一次，所有换算改为本地 `toUSDAmount` / `rateSnaps[0]`（baseline 取最早快照），彻底消除逐行 `findOne`。
- **语义保持等价**：`rateAt` 的「最新生效快照」取法与原 SQL 完全一致；USD 合计经测试校验不变（见下）。

---

## 4. 验证

- 新增实证测试 **2/2**（修复后 findOne 归零，且 `revenueUSD≈4400`、`costUSD≈1760` 校验换算结果不变）
- 相邻回归 **35/35**（`analytics-rate-snapshot-n1` + `shop-analytics-reconcile` + `storefront-analytics` + `shopPhases` 用 30s 超时）
- 全量后端 **933 passed / 0 失败**（较上轮 +2）
- 类型检查：`analyticsService.ts` **0 错误**；仓库另有 5 处 `server/_e2e_mail.ts` 的 tsc 错误，属并行方未跟踪 WIP，非本轮文件、未代修

---

## 5. 残留与后续

1. **`salesReport` 用 `new Date()`（当前汇率）换算历史周期**：原实现即如此，本轮为保行为等价未改；若业务要求「历史月份用当月汇率」，应改为按分组日期 `day` 取快照（与 `profitReport` 一致）。
2. **批量预取未加日期下界**：当前拉取租户全部快照。若某租户有数年每日快照，仍是单查询但返回行偏多；可加 `rateDate >= 报表起始日 - 1` 下界进一步收窄（可选优化，非必需）。
3. **`server/modules/storefront/services/analyticsService.ts` 同源问题未审**：storefront 侧另有独立 analytics service（含自身汇率/事件逻辑），本轮只修了 shop 侧。若该文件也有逐单快照查询，建议单独立项（需先确认其是否在并行方 WIP 内）。
4. 既有残留不变：生产 `PAYMENT_CREDENTIAL_SECRET` ≥32 字符并与 `JWT_SECRET` 解耦、四套网关商户凭据待申请后后台填入、历史孤儿券流水 DBA 核查、反代 `trust proxy`/XFF、上线首轮动态租户枚举会处理历史脏单据。
