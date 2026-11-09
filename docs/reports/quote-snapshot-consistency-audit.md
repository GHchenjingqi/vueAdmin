# 报价 → 订单快照一致性审计

- 审计时间：2026-11-09
- 审计基线：`9162d4b`（支付 Webhook 绑定与并发修复之后）
- 审计对象：`server/modules/storefront/services/quoteService.ts`、`server/modules/storefront/services/checkoutService.ts`
- 方法：写库实证（专属租户 `987697`，真实 MySQL + Sequelize），先跑出修复前实际值，再做最小修复并复跑
- 实证用例：`server/__tests__/quote-snapshot-consistency.test.ts`

> 本轮属于 HEAD 干净模块的发现式实证审计，不是计划任务行回填。全程未代勾门禁、未代替签字、未改动并行方 WIP。

---

## 1. 结论摘要

| 编号 | 缺陷 | 影响 | 状态 |
|---|---|---|---|
| D1 | 订单 `policySnapshot.taxRate` 取自死配置 `STORE_TAX_RATE`，而非实际计税的 `quote.taxRate` | 订单快照税率与实际税率脱节，对账 / 审计 / 客诉追溯按错税率 | 已修复 |
| D2 | `createQuote` 对 `items` 中重复 `skuId` 按行独立校验库存 | 总需求已超可用量仍返回可成交报价，建单必然失败 | 已修复 |

两者都不产生直接的资金损失（金额与税费落库是正确的），破坏的是**快照可信度**与**报价可售性契约**。

---

## 2. 缺陷 D1：订单快照税率来自死配置

### 成因

`server/modules/storefront/services/taxService.ts` 的可插拔 Provider 按目的国从 `shop_tax_rates` 表解析税率（目的国具体税率 > 租户默认税率 > fail-closed 阻断），`createQuote` 把结果放进 `quote.taxRate`，并据此算出 `taxCents` 写进订单。

但 `createOrder` 落库 `policySnapshot` 时写的是：

```ts
taxRate: Number(process.env.STORE_TAX_RATE ?? 0)
```

全仓检索 `STORE_TAX_RATE` 只有两处：`server/config/index.ts` 里的 `checkout.taxRate` 字段，以及这一行。而 `config.checkout.taxRate` 在 `server/modules/` 下**没有任何引用** —— 这是 P3-T06 接入真实 TaxProvider 后遗留的占位配置。也就是说，「随单固化」的税率快照取的是一个没人用的环境变量。

### 实证（修复前，目的国 DE 配置 8% 税率，同时把环境变量设为 `0.37`）

| 指标 | 期望 | 修复前实测 |
|---|---|---|
| `quote.taxRate` | 0.08 | 0.08 |
| `quote.taxCents` / 订单 `taxCents` | 1600 | 1600 / 1600（正确） |
| `policySnapshot.taxRate` | **0.08** | **0.37** |

再验一条：不提供收货地址时实际不计税（`taxCents = 0`、`quote.taxRate = 0`），快照税率仍是 **0.37**。可见快照完全跟着环境变量走，与真实计税路径无关。

危害不在收款，在追溯：订单快照是「当时政策」的唯一固化载体，后台按它做税务对账、客诉复核、退款计税依据时会拿到一个根本没被使用过的税率。环境变量在生产被误设成 `19`（注释期望 0..1 小数）时，快照会出现 `19` 这种荒谬值，而实收税费仍是 8%。

---

## 3. 缺陷 D2：重复 SKU 行绕过库存校验

### 成因

`quoteSchema` / `createOrderSchema`（见 `server/shared/schemas/storefront.ts`）允许 `items` 最多 100 行、每行 `qty` 1..9999，**没有禁止重复 `skuId`**。`createQuote` 逐行做 `available < line.qty` 判断，从不同 SKU 维度累加需求；购物车合并等路径同样可能产生同 SKU 多行。

### 实证（修复前，某 SKU 可用量 10，提交两行各 6 件）

| 指标 | 期望 | 修复前实测 |
|---|---|---|
| 报价结果 | 400 库存不足 | **200 报价成功** |
| 明细行数 | — | 2 |
| `subtotalCents` | — | **120000**（12 件 × 100.00） |
| 每行返回的 `available` | — | 10 / 10 |

两行各自看到「可用 10 ≥ 6」而通过，但总需求 12 > 10。继续用同一参数 `createOrder`，`reserveItems` 第一次占 6 成功、第二次占 6 才失败，回滚后**订单数为 0、无孤儿预占**（这要归功于 `docs/reports/checkout-idem-race-audit.md` 那轮的回滚修复）。所以用户看到的是「报价成功、可结算金额已算出，却下不了单」。

---

## 4. 修复（两处，共 4 行有效改动）

1. `createOrder`：`policySnapshot.taxRate` 改为 `quote.taxRate`，与同批次的 `taxCents` 出自同一次 `resolveTax`，天然一致。
2. `createQuote`：循环内维护 `requestedBySku = Map<skuId, 累计 qty>`，用累计需求与 `available` 比较，错误信息里的「需 N 件」也改为累计值（单行场景输出不变）。

未改动：报价返回结构、订单明细生成方式（重复 SKU 行仍按行落明细）、税费 Provider 与 fail-closed 规则、配送白名单、券与 Bundle 计算、`createOrder` 的回滚块、模型与 schema。

---

## 5. 验证

| 项目 | 结果 |
|---|---|
| 新实证测试 `quote-snapshot-consistency.test.ts` | **5/5 通过**（8% 税率快照、无地址不计税、重复行拒绝、合法重复行与单行不误伤、拒绝后无孤儿订单/预占） |
| 修复后快照 | `quoteTaxRate 0.08 / quoteTaxCents 1600 / orderTaxCents 1600 / snapshotTaxRate 0.08`；无地址 `taxCents 0 / snapshotTaxRate 0`；12 件报价返回 400 |
| 相关既有回归（12 文件，含税率套件、商务/券/Bundle/配送、建单幂等、交易门禁、资金不变量、P5 就绪、支付回调、退款） | **109/109 通过**（串行） |
| 后端全量回归（串行） | **83 文件 / 751 测试全绿**（基线 82 / 746，正好 +1 文件 +5 例） |
| `server typecheck` | 0 错 |
| ESLint | 0 error（`server/**` 被根配置忽略，仅提示 ignored） |
| `node scripts/check-doc-links.mjs` | **148/148 OK**，本轮报告 10 条引用全部有效 |
| `node scripts/gate-preflight.mjs --strict --json` | 8 PASS / 1 WARN / **0 FAIL**；17 项签字仍全部未勾 |

`server/__tests__/storefront-tax.test.ts` 的「带地址 19% / 无地址 0」两条集成断言逐例复验通过，说明按目的国解析税率的既有行为未被触碰。

---

## 6. 阴性核查

- `refundService.createRefund` 已在订单行 `FOR UPDATE` 下按 `SUM(amountCents)` 累计校验，且加了 `(tenantId, idempotencyKey)` 唯一键与 provider 跨重试去重；本轮未发现累计超退缺口，未改动。
- `evaluateCoupon` 的折扣已 `Math.min(discountCents, subtotalCents)` 封顶，`amountCents` 另有 `Math.max(0, ...)` 兜底；未发现负金额下单路径。
- `cartLineInput` 的 `qty` 为 `int().min(1).max(9999)`，单次输入不会构造负数或小数；购物车累加虽可能超过 9999，但报价阶段会按累计需求与可用量比较，不会形成可成交的假报价。
- 全仓 `STORE_TAX_RATE` 仅两处，且 `config.checkout.taxRate` 无消费者，确认是死配置而非另一条计税分支。

---

## 7. 残留登记（本轮不代改）

| 编号 | 残留 | 性质 |
|---|---|---|
| R1 | `STORE_TAX_RATE` / `config.checkout.taxRate` 现在完全无消费者 | 清理需确认部署脚本与 `.env.example` 是否仍引用，属配置治理，不擅自删 |
| R2 | 报价与预占之间仍有跨请求 TOCTOU | 本轮只修「单次报价里已知的超量」；并发下单仍可能报价通过但预占失败，由 `createOrder` 回滚块兜底，不会超卖。彻底消除需把报价与预占放进同一事务 |
| R3 | `version` / `expiresAt` 生成后从未在 `createOrder` 校验 | 注释称「供建单时校验报价新鲜度」，但建单走服务端重算，金额不依赖前端报价，属文档与实现不符；是否启用新鲜度校验需业务确认 |
| R4 | 税费基数为 `subtotalCents`，不含运费、不扣券 / Bundle 折扣 | 税务口径需业务 / 法务确认，本轮不动 |
| R5 | `policySnapshot` 未记录税率来源 `reason`（`rule_table` / `default` / `reverse_charge`）与 `taxCents` | `taxService.TaxLine` 已有 `reason`，`QuoteResult` 未透传；追溯信息仍不完整 |
| R6 | 重复 SKU 行本身仍被允许 | 本轮只补库存累计校验，订单明细仍会产生同 SKU 两行；是否需要合并行属业务展示口径 |
| R7 | 历史测试租户数据 | 本轮 `987697` 在 `afterAll` 按租户清理；前两轮 `987693` / `987695` 的遗留数据由 DBA 按 `tenantId` 决定，本轮不自动删库 |

以上均为如实登记，未代改、未代决业务口径、未回填任何计划任务行或签字栏。门禁证据自动化状态见 `docs/reports/gate-preflight.md`。
