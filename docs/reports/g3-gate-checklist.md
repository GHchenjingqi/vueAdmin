# G3 门禁 · 沙箱闭环与异常路径检查记录（2026-11-06）

> 关联任务：`P3-T19 G3 门禁：沙箱闭环 + 异常路径通过`
> 验收标准：**支付回调乱序、重复回调、库存异常、币种配置变更四类场景有测试证据**
> 交付物类型：门禁检查记录。本报告只登记实测证据与缺口，**不代勾门禁状态**；P3-T19 在计划文档中保持 `[~]`。

## 1. 结论（2026-11-06 12:00 复测更新）

| # | 场景 | 判定 | 证据强度 |
| --- | --- | --- | --- |
| 1 | 支付回调乱序 | ✅ **通过（真实缺陷已修复）** | `payment-callback-order.test.ts` 6 例 + 全量 651/651；终态保护与预占幂等见 §3.3 |
| 2 | 重复回调 | ✅ 通过 | 3 组用例（Webhook 去重、幂等键、验签失败无副作用） |
| 3 | 库存异常 | ✅ 通过 | 并发不超卖、库存不足拒报价、失败释放预占、异常计数钩子 |
| 4 | 币种配置变更 | ✅ 通过 | T-12 全链路实测 + 快照一致性 + 邮件/JSON-LD/支付金额三处口径 |

**技术侧四类场景现已全部有测试证据**：第 1 项缺陷已修复（详见 §3.3），后端全量 **651 passed / 651（71 文件）**、`tsc -p server/tsconfig.json --noEmit` 0 错误。**门禁状态仍不由本报告代勾**：P3-T19 需业务/责任方复核沙箱完整交易 E2E 后回填。原任务行备注「T-12 币种切换回归待后台规则界面，随 P5-T02 收口」已过期——T-12 已随 P5-T02 闭环（两份实测报告），报告同步更新该备注。

## 2. 实测环境与方法

| 项 | 值 |
| --- | --- |
| 采集时间 | 2026-11-06 11:35–12:01 (GMT+8)，dev 本地 |
| 初测基线 | 同日 11:00 后端全量 **630/630（68 文件）** 全绿，见 `g5-regression-report.md` §2 |
| 初测工作树污染 | 11:40 时 94 failed / 539 passed / 5 skipped（638）；128 处错误全部为 `Unknown column 'referralCode' in 'field list'`，系并行方 P5-T07 新增迁移 `000069_add-referral-system.ts` 尚未执行 |
| 复测基线（12:00） | 并行方迁移已执行，**后端全量 651 passed / 651（71 文件）全绿**，server typecheck 0 错误 |
| 本会话处置 | 未擅自执行并行方迁移、未改其模型/服务；WIP 污染期间第 2~4 项以「既有证据 + 11:00 干净基线」判定，12:00 基线恢复后以全量实测复核 |

> 注：本报告不把并行方 WIP 污染误记为交易链路回归；修复以「只把本会话改动送入 index、工作树完整保留对方 WIP」的隔离方式提交，未夹带其未提交代码。

## 3. 场景 1 · 支付回调乱序（缺陷已修复）

### 3.1 初测证据缺失（已补齐）

全仓检索 `乱序 / out-of-order / status regress / stale event` 等关键词，初测时 `server/__tests__/` 中**无任何专门用例**。现有 Webhook 用例仅覆盖「验签成功 → captured」「重复投递同一 providerRef → alreadyProcessed」「伪造签名 → 401」，均未构造**不同事件类型/不同 providerRef 乱序到达**。现已新增 `server/__tests__/payment-callback-order.test.ts`（6 例，全部写库验证）。

### 3.2 修复前状态机缺陷（`server/modules/storefront/services/paymentService.ts`）

| 分支 | 行号 | 修复前 |
| --- | --- | --- |
| 去重 | 145 | 仅按 `provider + providerRef` 判重；同一订单不同 `providerRef` 的事件不去重，乱序可达 |
| `payment.succeeded` | 159 | 仅有 `if (order.paymentStatus === 'captured')` 保护；`refunding` / `refunded` 会被重复 capture、重复 commit 预占、重复发确认邮件 |
| `payment.failed` | 171–179 | **无任何终态保护**，直接 `order.update({ paymentStatus: 'failed' })` + `reservationService.releaseReservation(orderNo)` + 写审计 |

**乱序后果**（`payment.succeeded` 已成功后，迟到/重投的 `payment.failed` 到达）：
1. 已支付订单 `paymentStatus` 从 `captured` **回退**为 `failed`（`status` 仍为 `paid`，出现自相矛盾状态）；
2. `releaseReservation` 对**已 committed** 的预占再次释放，重复回补库存 → 超卖风险（`releaseReservation` 修复前仅排除 `released`）；
3. 审计链多出一条 `order.payment_failed`，与 `order.payment_captured` 冲突，事后对账无法判定真实支付结果。

### 3.3 修复实现（已落地）

| # | 文件 | 改动 |
| --- | --- | --- |
| 1 | `paymentService.ts` | 新增 `SETTLED_PAYMENT_STATUSES = new Set(['captured','refunding','refunded'])`：已结算态集合，统一表达「已扣款或已进入退款流程，不得被任何回调回退」 |
| 2 | `paymentService.ts` | `payment.succeeded` 的幂等判断由 `=== 'captured'` 改为集合判断，避免 `refunding/refunded` 被重复 capture |
| 3 | `paymentService.ts` | `payment.failed` 前置终态保护：命中已结算态时仅 `console.warn` + 独立审计 `payment.stale_failed_ignored`（带 `beforeState`/`afterState`/`providerRef`）并返回 `alreadyProcessed`，**不写 `order.payment_failed`、不改单、不释放预占**；失败计数移到保护之后，迟到事件不污染支付失败率告警 |
| 4 | `reservationService.ts` | `releaseReservation` 增加 `row.status !== 'committed'` 短路（纵深防御），已提交预占重复调用不再回补库存 |

> 「failed → 迟到 succeeded 是否允许订单转 captured」属业务规则，未擅自改为拒绝；用例 2 仅锁定现状（服务端事实为准），待业务确认。

### 3.4 回归用例（`server/__tests__/payment-callback-order.test.ts`，6 例）

| 用例 | 期望 | 结果 |
| --- | --- | --- |
| succeeded → 迟到 failed | 订单保持 `captured/paid`、预占 `committed`、库存 `locked` 不变、返回 `alreadyProcessed`、无 `order.payment_failed` 审计且有 1 条 `payment.stale_failed_ignored` | ✅ |
| failed → 迟到 succeeded | 服务端事实为准：订单转 `captured`；已释放预占不再变动、库存不回补 | ✅ |
| 不同 `providerRef` 的两个迟到 failed 打到已支付订单 | 均不回退、不重复释放库存、库存守恒 | ✅ |
| 已退款订单收到 succeeded / failed | 终态 `refunded` 不被覆盖，不重复 commit 预占 | ✅ |
| 正常失败路径（回归保护） | 未支付订单仍转 `failed`、预占 `released`、库存精确回补、审计留存（防止保护过度阻断） | ✅ |
| `releaseReservation` 对 committed 预占调用两次 | 状态不变、库存不回补（幂等） | ✅ |

## 4. 场景 2 · 重复回调（通过）

| 证据 | 位置 |
| --- | --- |
| 同 `providerRef` 重复投递 → `alreadyProcessed=true`，订单状态不变 | `storefront-commerce.test.ts:213` |
| 相同 `idempotencyKey` 不重复建单、不二次预占 | `storefront-commerce.test.ts:153`、`storefront-trade-gate.test.ts:102` |
| 签名无效 → 401 且无副作用 | `storefront-commerce.test.ts:224` |
| Webhook 事件 ID 去重（`ShopOrderPayment`） | `paymentService.ts:143–146` |
| 真实 E2E 实证 | `docs/reports/real-integration.md` |

## 5. 场景 3 · 库存异常（通过）

| 证据 | 位置 |
| --- | --- |
| 同 SKU 并发 12 次 `occupy`（库存 10）：成功 ≤10、`locked ≤ quantity`、可用量守恒 | `storefront-trade-gate.test.ts:80` |
| 库存不足 → 报价阶段拒绝 | `storefront-commerce.test.ts:112` |
| 支付失败/超时 → `occupy → release` 可用量精确恢复 | `storefront-trade-gate.test.ts:136` |
| 已 committed 预占重复释放不回补库存 | `payment-callback-order.test.ts`（本轮新增） |
| 库存异常钩子计数（`inventory_anomaly`）与告警规则 | `storefront-monitoring.test.ts`、`monitoringService.ts` |
| `occupy` 行锁 + `ShopInventoryLog` 流水 | `inventoryService.ts` |

## 6. 场景 4 · 币种配置变更（通过，原备注已过期）

| 证据 | 位置 / 报告 |
| --- | --- |
| admin 双确认 USD→CNY；旧 USD 购物车报价 **409 CURRENCY_CHANGED**；历史订单快照保持 USD 259.80 不变；可回滚 | `docs/reports/t12-currency-switch.md` |
| JSON-LD `priceCurrency` 与前台符号随配置同步（5/5 PASS） | `docs/reports/t12-jsonld-currency-switch.md` |
| 非法/缺失配置 fail-closed 503、ISO 白名单一致 | `storefront-trade-gate.test.ts:289` |
| 支付会话金额/币种取订单快照，不随站点币种漂移 | `storefront-trade-gate.test.ts:317` |
| 订单邮件按快照币种渲染（站点 USD 下历史 CNY 订单仍 ¥/CNY） | `storefront-trade-gate.test.ts:329` |
| 购物车币种与站点不一致 → `CURRENCY_CHANGED` | `storefront-commerce.test.ts:102` |
| 两类实测报告的产出断言 | `storefront-trade-gate.test.ts:299 / 307` |

## 7. 行动项

1. **[已完成]** 回调乱序修复 + 6 例回归（§3.3 / §3.4）；采用「只把本会话改动送入 index」的隔离方式，工作树完整保留并行方 P5-T03 WIP，未夹带其未提交代码。
2. **[已完成 / 环境]** `000069_add-referral-system` 已由并行方执行，全量绿基线恢复（651/651、71 文件）。
3. **[门禁 · 待责任方]** 四类场景证据齐备；仍需业务/责任方完成沙箱完整交易 E2E 与复核签字后在计划文档 P3-T19 回填，本报告不代勾。
4. **[业务规则 · 待确认]** 「failed → 迟到 succeeded 是否允许订单转 captured」为现状行为（§3.4 用例 2 已锁定），未擅自改为拒绝。

## 8. 复跑命令

```bash
# 后端全量（本轮实测 651 passed / 651，71 文件）
cd server && npx vitest run

# 四类场景定向复跑
npx vitest run __tests__/payment-callback-order.test.ts \
  __tests__/storefront-commerce.test.ts \
  __tests__/storefront-trade-gate.test.ts \
  __tests__/storefront-monitoring.test.ts \
  __tests__/storefront.test.ts __tests__/storefront-order-mail.test.ts

# 类型检查
npx tsc -p tsconfig.json --noEmit
```

---

*本报告由证据盘点与实测生成；门禁状态变更须由责任方在 `storefront-execution-plan_v1.0.md` §P3-T19 回填。*
