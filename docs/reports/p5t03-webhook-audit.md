# P5-T03 支付方式扩展 · Webhook 侧安全审计（2026-11-06 13:08）

> 关联任务：`P5-T03 区域支付方式与 BNPL`（验收：不影响既有支付链路；Webhook 复用同一验签与幂等框架；币种能力校验前置）
> 关联约束：X-T04「关闭态零副作用」、G3「回调幂等」
> 报告类型：只读源码审查 + 写库复现（自建数据已清理）。**不代改并行方代码、不代勾门禁状态**。

## 1. 结论

| 验收维度 | 建会话侧 `createSession` | 回调侧 `handleWebhook` |
| --- | --- | --- |
| Provider 注册校验 | ✅ `getProvider` + 422 | ❌ 无，任意路径参数可进入 |
| Flag 可用性（bnpl 默认关闭） | ✅ `isProviderUsable` | ❌ 无，关闭态仍可改单 |
| 订单币种能力校验 | ✅ 前置 422 | ❌ 仅 `payload.currency` 与订单快照不一致时 `warn` |
| `(provider, providerRef)` 幂等 | — | ⚠️ 换 `provider` 即绕过去重 |
| 验签 | — | ⚠️ 恒用全局密钥，独立 `webhookSecret` 字段未生效 |

**整体判定：回调侧四道校验全部缺失**，P5-T03 验收标准在建会话侧已落地、在 Webhook 侧未闭环。

### 缺口明细（源码行号基于 2026-11-06 13:05 工作树）

| # | 缺口 | 位置 |
| --- | --- | --- |
| 1 | `req.params.provider` 原样传入 `handleWebhook`，未调用 `getProvider`；未注册 provider 可进入 | `paymentController.ts:webhook`、`paymentService.ts:121` |
| 2 | 去重查询带 `provider` 条件，但订单只按 `orderNo` 查；`providerRef` 未与已绑定 provider 做一致性校验 | `paymentService.ts:145`、`:151` |
| 3 | `isProviderUsable` 只在 `createSession` / `listProviders` 调用；Webhook 不校验 flag 与 `supportedCurrencies` | `paymentService.ts:57`、`providerRegistry.ts:54` |
| 4 | `PaymentProviderDef.webhookSecret` 已声明但从未读取；验签恒用 `config.payment.webhookSecret` | `providerRegistry.ts:20`、`paymentService.ts:122` |

## 2. 实证复现（写库，已清理）

方法：自建订单（`paymentStatus=initiated`）+ `ShopOrderPayment(provider='mock', providerRef=…, status='initiated')`，
用 `signWebhook` 对 `{type:'payment.succeeded', orderNo, providerRef, currency:'USD'}` 签名，
调用 `handleWebhook('ghost_provider', raw, sig)`。

```
[REPRO] {"requestedProvider":"ghost_provider","boundProvider":"mock",
         "result":{"ok":true,"status":200},"paymentStatus":"captured","orderStatus":"paid"}
```

结论：**未注册 provider** 的回调、且 `providerRef` 已绑定 `mock`，仍返回 200 并把订单推到 `captured/paid`。
注册表校验、幂等去重、flag 门控在回调侧均未生效；签名只需全局密钥。复现脚本为临时文件，跑完已删除，
自建订单与支付记录已 `destroy`，未污染并行方 dev 数据。

## 3. 与 G3 终态保护（`b6b9bed`）的关系

- `SETTLED_PAYMENT_STATUSES` 阻止「已结算订单被重复 capture」与「迟到 failed 回退」，
  但本缺口作用于**首次未支付订单**（`initiated` 不在终态集合内），故仍可改单。
- `succeeded` 分支在终态判断**之前**执行 `incCounter('payment_success')` / `updatePaymentFailureRate()`：
  即使订单未被改，跨 provider 重投仍会污染支付成功率/失败率指标与告警。

## 4. 修复方案（待并行方提交 P5-T03 后执行）

1. `handleWebhook` 开头 `const def = getProvider(provider)`；未注册 → 400/404，且在验签/解析前返回。
2. 取到订单后 `if (!(await isProviderUsable(def, order.currency))) return` 403/422（flag 关闭、币种不支持均拒绝）。
3. 用 `providerRef` 单独查 `ShopOrderPayment`，校验 `bound.provider === provider`；不一致 → 400，堵住换 provider 绕幂等。
   - **待业务确认的兼容策略**：历史订单可能没有支付会话记录（本会话 G3 回归用例即自建订单无 payment 行），
     是「无记录放行」还是「一律拒绝」，需明确后再落代码。
4. 验签密钥改为 `def.webhookSecret ?? config.payment?.webhookSecret ?? 默认`，使声明的独立密钥生效。
5. 待补 5 例：未注册 provider 拒绝 / flag 关闭的 bnpl 回调拒绝且无副作用 / 不支持币种回调拒绝 /
   同 `providerRef` 换 provider 拒绝 / 独立密钥下错误签名 401。

## 5. 本会话为何不代改

- `server/modules/storefront/payments/providerRegistry.ts` 是并行方**未跟踪 WIP**，`HEAD` 中不存在；
  任何依赖 `getProvider` / `isProviderUsable` 的修复若现在提交，主干会因缺模块而**无法编译**。
- `paymentService.ts` 亦被其 P5-T03 WIP 持有（`createSession` 的 provider 改动未提交）。
- 按既有约定：只登记证据与方案，待其提交 P5-T03 后下一轮修复；P5-T03 任务行保持 `[ ]`，不代勾。

## 6. 复跑命令

```bash
# 基线（本轮实测 655/655，71 文件）
cd server && npx vitest run

# 扩展模块（本轮实测 21/21）
npx vitest run __tests__/storefront-bundle.test.ts \
  __tests__/storefront-referral.test.ts \
  __tests__/storefront-warehouse-routing.test.ts

# 修复后新增 Webhook provider 校验用例
npx vitest run __tests__/payment-provider-webhook.test.ts
```

---

*本报告由源码审查与实测复现生成；修复与门禁状态变更须由 P5-T03 责任方回填。*
