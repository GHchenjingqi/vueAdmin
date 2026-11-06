# G3 门禁 · 沙箱闭环与异常路径检查记录（2026-11-06）

> 关联任务：`P3-T19 G3 门禁：沙箱闭环 + 异常路径通过`
> 验收标准：**支付回调乱序、重复回调、库存异常、币种配置变更四类场景有测试证据**
> 交付物类型：门禁检查记录。本报告只登记实测证据与缺口，**不代勾门禁状态**；P3-T19 在计划文档中保持 `[~]`。

## 1. 结论

| # | 场景 | 判定 | 证据强度 |
| --- | --- | --- | --- |
| 1 | 支付回调乱序 | ❌ **未通过（发现真实缺陷）** | 全仓无专门用例；源码状态机不防回退，见 §3 |
| 2 | 重复回调 | ✅ 通过 | 3 组用例（Webhook 去重、幂等键、验签失败无副作用） |
| 3 | 库存异常 | ✅ 通过 | 并发不超卖、库存不足拒报价、失败释放预占、异常计数钩子 |
| 4 | 币种配置变更 | ✅ 通过 | T-12 全链路实测 + 快照一致性 + 邮件/JSON-LD/支付金额三处口径 |

**G3 整体不达成**：第 1 项未通过，且修复前置条件（并行方释放 `paymentService.ts`）未满足。原任务行备注「T-12 币种切换回归待后台规则界面，随 P5-T02 收口」已过期——T-12 已随 P5-T02 闭环（两份实测报告），本报告同步更新该备注。

## 2. 实测环境与方法

| 项 | 值 |
| --- | --- |
| 采集时间 | 2026-11-06 11:35–11:45 (GMT+8)，dev 本地 |
| 干净基线 | 同日 11:00 后端全量 **630/630（68 文件）** 全绿，见 `g5-regression-report.md` §2 |
| 当前工作树 | **15 failed / 54 passed（69 文件）**，94 failed / 539 passed / 5 skipped（638） |
| 当前失败根因 | 全量输出中 **128 处错误全部为 `Unknown column 'referralCode' in 'field list'`**（已聚合统计，无第二类根因） |
| 根因归属 | 并行方 P5-T07 WIP：给 `ShopCustomer` 加了 `referralCode` 字段，新增迁移 `000069_add-referral-system.ts` **尚未执行**；另 3 个迁移 `000066/67/68` 同为未跟踪 WIP |
| 本会话处置 | **未擅自执行并行方迁移、未改其模型/服务**，避免打断其调试；精确用例复跑亦受连带影响，故第 2~4 项以「既有证据 + 11:00 干净基线」判定 |

> 注：迁移执行后需重跑全量以恢复绿基线；本报告不把 WIP 污染误记为交易链路回归。

## 3. 场景 1 · 支付回调乱序（未通过，源码级确认）

### 3.1 证据缺失

全仓检索 `乱序 / out-of-order / status regress / stale event` 等关键词，`server/__tests__/` 中**无任何专门用例**。现有 Webhook 用例仅覆盖「验签成功 → captured」「重复投递同一 providerRef → alreadyProcessed」「伪造签名 → 401」，均未构造**不同事件类型乱序到达**。

### 3.2 状态机缺陷（`server/modules/storefront/services/paymentService.ts`）

| 分支 | 行号 | 现状 |
| --- | --- | --- |
| 去重 | 145 | 仅按 `provider + providerRef` 判重；同一订单不同 `providerRef` 的事件不去重，乱序可达 |
| `payment.succeeded` | 159 | ✅ 有终态保护：`if (order.paymentStatus === 'captured') return alreadyProcessed` |
| `payment.failed` | 171–179 | ❌ **无任何终态保护**，直接 `order.update({ paymentStatus: 'failed' })` + `reservationService.releaseReservation(orderNo)` + 写审计 |

**乱序后果**（`payment.succeeded` 已成功后，迟到/重投的 `payment.failed` 到达）：
1. 已支付订单 `paymentStatus` 从 `captured` **回退**为 `failed`（`status` 仍为 `paid`，出现自相矛盾状态）；
2. `releaseReservation` 对**已 committed** 的预占再次释放，可能重复回补库存 → 超卖风险；
3. 审计链多出一条 `order.payment_failed`，与 `order.payment_captured` 冲突，事后对账无法判定真实支付结果。

本项结论基于源码分支对比（静态确认），**未做写库复现**以免污染并行方正在使用的 dev 数据。

### 3.3 修复方案（待 `paymentService.ts` 释放后执行）

1. `payment.failed` 分支前置终态保护：
   ```ts
   if (order.paymentStatus === 'captured') return { ok: true, alreadyProcessed: true, status: 200 }
   ```
   与 `payment.succeeded` 对称；或统一定义「终态集合 `captured | refunded` 不可回退」。
2. `failed` 仅允许从 `pending / processing / failed` 前置态迁移，避免其他状态被写入。
3. `reservationService.releaseReservation` 增加 `status === 'committed'` 幂等短路（纵深防御）。
4. 迟到失败事件应记 `warn` 或独立审计 action（如 `payment.stale_failed_ignored`），不写 `order.payment_failed`。

### 3.4 修复后待补用例（可直接落为 `payment-callback-order.test.ts`）

| 用例 | 期望 |
| --- | --- |
| succeeded → 迟到 failed | 订单保持 `captured/paid`、预占保持 `committed`、返回 `alreadyProcessed`、无 `payment_failed` 审计 |
| failed → 迟到 succeeded | 服务端事实为准：订单转 `captured`，与 `paymentService` 现有「成功状态由服务端回写」一致（需业务确认是否允许） |
| 不同 `providerRef` 的失败事件打到已支付订单 | 不回退、不重复释放库存 |
| 已退款订单收到 succeeded/failed | 终态 `refunded` 不被覆盖 |

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
| 购物车币种与站点不一致 → `CURRENCY_CHANGED` | `storefront-commerce.test.ts:102`（本轮精确复跑 ✅） |
| 两类实测报告的产出断言 | `storefront-trade-gate.test.ts:299 / 307`（本轮精确复跑 ✅） |

## 7. 行动项

1. **[阻塞]** 并行方提交/释放 `paymentService.ts` 后按 §3.3 修复回调乱序，并补 §3.4 的 4 例测试 —— 本会话因该文件正被高频编辑（P5-T03 BNPL WIP）未代改，避免覆盖其未提交工作。
2. **[环境]** 执行 `000069_add-referral-system` 迁移（由并行方在其窗口进行），恢复全量绿基线后重跑 §8 命令。
3. **[门禁]** 四项全绿 + 沙箱完整交易 E2E 后，由业务/责任方在计划文档 P3-T19 回填，本报告不代勾。
4. **[记录]** 计划文档 §11 风险表登记本缺陷；任务行备注更新（T-12 已闭环，改记回调乱序缺口）。

## 8. 复跑命令

```bash
# 迁移执行后先恢复绿基线
cd server && npx vitest run

# 四类场景定向复跑
npx vitest run __tests__/storefront-commerce.test.ts \
  __tests__/storefront-trade-gate.test.ts __tests__/storefront-monitoring.test.ts \
  __tests__/storefront.test.ts __tests__/storefront-order-mail.test.ts

# 修复回调乱序后新增
npx vitest run __tests__/payment-callback-order.test.ts
```

---

*本报告由证据盘点与实测生成；门禁状态变更须由责任方在 `storefront-execution-plan_v1.0.md` §P3-T19 回填。*
