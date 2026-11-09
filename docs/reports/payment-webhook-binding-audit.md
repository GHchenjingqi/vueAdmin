# 支付 Webhook 绑定一致性与并发幂等审计

- 审计时间：2026-11-09
- 审计基线：`91c592c`（建单幂等并发修复之后）
- 审计对象：`server/modules/storefront/services/paymentService.ts` 的 `handleWebhook`
- 方法：写库实证（专属租户 `987695`，真实 MySQL + Sequelize），先跑出修复前的实际值，再做最小修复并复跑
- 实证用例：`server/__tests__/payment-webhook-binding-race.test.ts`

> 本轮属于 HEAD 干净模块的发现式实证审计，不是计划任务行回填。全程未代勾门禁、未代替签字、未改动并行方 WIP。

---

## 1. 结论摘要

`handleWebhook` 在「验签 → 去重 → 改单」链路上存在两类真实缺陷：

| 编号 | 缺陷 | 影响 | 状态 |
|---|---|---|---|
| D1 | `providerRef` 与 `orderNo` 无交叉绑定校验 | 可用 A 单支付记录把 **B 单** 标记为已支付，并消费掉 A 单的支付记录 | 已修复 |
| D2 | 状态变更是 `findOne` → `update` 非原子 | 并发同事件重复计数、重复审计、重复提交/释放预占 | 已修复 |

两者都只在特定输入/并发窗口暴露，既有 G3 回归套件（`server/__tests__/payment-callback-order.test.ts`）的顺序重放用例覆盖不到。

---

## 2. 缺陷 D1：跨单绑定（越权白嫖）

### 成因

`handleWebhook` 分别按两个互不相关的字段取记录：

- `prev = ShopOrderPayment.findOne({ where: { providerRef, tenantId } })`
- `order = ShopOrder.findOne({ where: { orderNo, tenantId } })`

随后只校验了 `prev.provider !== provider`（P5-T03 修复 3/4），**从未校验 `prev.orderNo === payload.orderNo`**。二者之间没有任何关联约束，`prev` 的金额/币种快照也不参与判断。

### 实证（修复前）

构造 A、B 两笔订单，仅 A 有 `providerRef = PWB_BIND_A_*` 的 `initiated` 支付记录，然后发送合法签名的 `payment.succeeded` 事件，其中 `providerRef` 取 A 的、`orderNo` 取 B 的：

| 指标 | 期望 | 修复前实测 |
|---|---|---|
| HTTP 语义状态 | 400 拒绝 | **200 成功** |
| B 单 `paymentStatus` / `status` | `initiated` / `created` | **`captured` / `paid`** |
| A 单支付记录 `status` | `initiated` | **`captured`** |

危害是双向的：B 单未付款即变成已支付；A 单的支付记录被置为终态，之后 A 单的**真实**回调会命中 `prev.status !== 'initiated'` 的去重分支被直接丢弃，A 单永远无法完成支付。

> 触发前提：能产出合法 HMAC 签名。mock 环境密钥是代码内默认值，生产环境密钥由 `config.payment.webhookSecret` 或 Provider 独立密钥提供；这属于「验签之后的纵深防御」缺口，不是验签本身被绕过。

---

## 3. 缺陷 D2：并发同事件重复副作用

### 成因

`payment.succeeded` / `payment.failed` 两个分支都是先读 `order.paymentStatus`，判断不在 `SETTLED_PAYMENT_STATUSES` 后直接 `order.update(...)`。并发窗口内所有请求读到的都是同一个非终态，于是都继续执行后续副作用。

`prev.status !== 'initiated'` 的去重判断同样是 `findOne` 后非原子，兜不住并发。

### 实证（修复前，8 个并发同 `providerRef` 事件）

| 指标 | 期望 | 并发 succeeded 实测 | 并发 failed 实测 |
|---|---|---|---|
| 成功返回的请求 | 8 | 8 | 8 |
| `payment_success` / `payment_failure` 计数增量 | 1 | **8** | **8** |
| `order.payment_captured` / `order.payment_failed` 审计 | 1 | **8** | **8** |
| `payment.captured` 审计 | 1 | **8** | — |
| 订单终态 | `captured` / `failed` | `captured` | `failed` |
| 预占状态 | `committed` / `released` | `committed` | `released` |
| `inventory.locked` | 2 / 0 | 2（守恒） | 0（守恒） |
| `unlock` 库存流水 | 1 | — | 1（守恒） |

**库存本身守恒**：`inventoryService.release` 在事务内对库存行加 `FOR UPDATE`，`give = min(r.locked, remain)`，重复释放时读到 `locked = 0` 即跳过。真正被破坏的是**支付失败率指标**（`payment_failure_rate` gauge 用于告警）与**审计台账**（X-T03 同一事件 8 条记录，对账失真）；邮件入队因 `uq_order_mail_dedupe`（见 `server/migrations/20261105_000063_create-order-email-outbox.ts`）有唯一键兜底，未重复发信。

另外，修复前 `incCounter('payment_success')` 位于终态判断**之前**，已结算订单收到重复成功回调也会计数，属于同源的指标污染。

---

## 4. 修复（只改 `handleWebhook` 一个函数）

1. **交叉绑定**：`prev` 存在且 `prev.orderNo !== orderNo` 时直接返回 `400`，位置在 `prev.status` 去重判断之前，确保任何副作用都不发生。
2. **CAS 认领**：两个事件分支把 `order.update(...)` 换成 `ShopOrder.update(values, { where: { id, tenantId, paymentStatus: order.paymentStatus } })`，以「读到的支付状态」做乐观并发条件；`affected !== 1` 的输家直接返回 `alreadyProcessed`。只有赢家执行计数、预占提交/释放、审计与邮件入队。
3. **计数时机**：`incCounter` / `updatePaymentFailureRate` 移到 CAS 之后、终态判断之后，已结算订单的重复回调不再污染指标。

未改动的部分：验签与 Provider 能力校验（见 `server/modules/storefront/payments/providerRegistry.ts`）、`SETTLED_PAYMENT_STATUSES` 终态集合、迟到失败回调的独立审计、`failed → succeeded` 的既有可覆盖行为、「无历史支付记录放行」的兼容策略、模型定义（`server/modules/shop/models/ShopOrderPayment.ts`）、路由与控制器、`server/modules/shop/services/reservationService.ts`。

**没有引入事务改造**：CAS 与后续副作用仍是分步提交，见 §7 残留 R4。

---

## 5. 验证

| 项目 | 结果 |
|---|---|
| 新实证测试 `payment-webhook-binding-race.test.ts` | **4/4 通过**（跨单拒绝、顺序重放幂等、并发 succeeded、并发 failed） |
| 修复后并发快照 | 计数增量 1、两组审计各 1、`committed`/`released` 正确、库存守恒 |
| 相关既有回归（12 文件，含 G3 回调状态机、建单幂等、交易门禁、订单邮件、监控、退款、资金不变量、P5 就绪） | **115/115 通过**（串行） |
| 后端全量回归（串行） | **82 文件 / 746 测试全绿**（基线 81 / 742，正好 +1 文件 +4 例） |
| `server typecheck` | 0 错 |
| ESLint | 0 error（`server/**` 被根配置忽略，仅提示 ignored） |
| `node scripts/check-doc-links.mjs` | **128/128 OK**（并行方 `v3-sync` README 的 2 条失效引用已被其自行修正） |
| `node scripts/gate-preflight.mjs --strict --json` | 8 PASS / 1 WARN / **0 FAIL**；17 项签字仍全部未勾 |

G3 的迟到/乱序语义已逐例复验：`succeeded → 迟到 failed`、`failed → 迟到 succeeded`、`refunded` 终态、正常失败路径、`releaseReservation` 对 `committed` 幂等，行为全部保持。

---

## 6. 阴性核查

- 全仓 `handleWebhook` 只有一个实现入口（`server/modules/storefront/routes/payment.ts` 的 `webhooks/:provider`），没有第二套绕过验签的回调路径。
- `ShopOrderEmail` 的唯一键兜底确实存在，邮件不会因并发重复入队。
- 修复没有收紧「无历史支付记录放行」策略，因此 G3 回归夹具（每次事件用随机 `providerRef`、订单无 `ShopOrderPayment` 行）仍可正常驱动状态机。
- 与上一轮 `docs/reports/checkout-idem-race-audit.md` 的模式一致：都是 `findOne` + 写入非原子导致的并发窗口，但本轮的**跨单绑定**是独立的逻辑缺口，并非竞态。

---

## 7. 残留登记（本轮不代改）

| 编号 | 残留 | 性质 |
|---|---|---|
| R1 | 回调 `payload.amountCents` 完全未参与校验；`payload.currency` 与订单快照不一致时仅 `console.warn` 后**照常改单** | 既有设计注释明确「以订单快照为准」。是否改为 fail-closed 拒绝需业务确认，见 `docs/reports/p5-fix-readiness.md` |
| R2 | `prev` 为空（无历史支付记录）时，任意 `orderNo` 都可通过回调改单 | 代码注释已注明「是否收紧为一律拒绝需业务确认」；G3 回归夹具依赖该兼容路径 |
| R3 | `uq_pay_provider_ref` 唯一索引为 `(provider, providerRef)`，**不含 `tenantId`** | 跨租户撞同 `providerRef` 会导致建会话 500；且 `prev` 按 `tenantId` 过滤，查不到别租户的绑定记录。需迁移 + 业务口径确认 |
| R4 | CAS 与后续副作用（预占提交/释放、审计、邮件）非同一事务 | 若赢家 CAS 成功后中途失败，订单已是终态但预占未提交；重投会被 `SETTLED` 直接返回，需人工对账补偿。属 at-least-once 外部副作用的既有口径，改造需事务化多个服务 |
| R5 | `prev.update({ status })` 在 CAS 之后 | 赢家在更新支付记录前崩溃时，支付记录会永远停在 `initiated`（订单已 captured）；重投由 `SETTLED` 兜住不会重复副作用，但对账口径不一致 |
| R6 | 无 `prev` 的兼容路径下，**不同 `providerRef`** 的多个 `failed` 打到非终态订单仍会各自计数/审计/释放 | 业务上属于不同事件，未做订单级强幂等；库存因行锁仍守恒 |
| R7 | 本轮测试数据 | 测试内 `beforeAll` / `afterAll` 按租户 `987695` 清理，未留孤儿。上轮 `987693` 的实证遗留数据仍未清理，如需处理由 DBA 按 `tenantId` 决定，本轮不自动删库 |

以上均为如实登记，未代改、未代决业务口径、未回填任何计划任务行或签字栏。门禁证据自动化状态见 `docs/reports/gate-preflight.md`。
