# PAYMENT_PROVIDER_CHECK.md · 支付服务商核验（P0-T04）

> 核验日期：2026-11-04 · 环境：本地沙箱（Mock Provider + 签名 Webhook 实测）；真实开户核验列遗留项（§5）

## 1. 目标服务商矩阵

| 服务商 | 首发支付方式 | 沙箱 | Webhook | 备注 |
| --- | --- | --- | --- | --- |
| Stripe | Card / Apple Pay / Google Pay（PaymentIntent） | test mode（需真实账号） | `payment_intent.succeeded/failed` 等，Stripe-Signature（t=,v1= HMAC-SHA256） | 适配器已实现签名验签逻辑（`payments/providers/stripe.ts`），密钥未配置时不启用 |
| Mock（本仓内置） | 卡（模拟授权/捕获/失败/退款） | ✓ 已实测 | `payment.succeeded/failed/refunded`，`X-Mock-Signature: t=<ts>,v1=HMAC_SHA256(secret, t+'.'+rawBody)` | 沙箱闭环测试载体（P3-T18/T-03/T-04 实证） |
| PayPal / BNPL | Phase 5（P5-T03） | — | 复用同一验签与幂等框架 | 本阶段不做 |

## 2. 结算币种集合（关键结论）

| 服务商 | 支持 USD | 支持 CNY | 依据 |
| --- | --- | --- | --- |
| Stripe | ✓ | ✗（跨境收款不支持 CNY 结算，仅限极少数本地账户） | 服务商公开文档 + 常识核对；**真实清单以开户后 Dashboard 为准** |
| Mock | ✓ | ✓（便于切换回归测试 T-12） | 本仓实现 |

## 3. 强制规则：配置币种 × 服务商能力

- 创建支付会话前校验：`config.currency ∈ provider.supportedCurrencies`；不在集合内 → 返回 **PROVIDER_CURRENCY_UNSUPPORTED**（HTTP 409，可读错误），**阻断而非静默换汇**（C5）。
- 支付会话金额/币种一律取**服务端订单快照**（P3-T11）；Webhook 回调币种与订单快照不一致 → 告警不改单（P3-T12）。

## 4. 沙箱链路核验（本次实测内容）

1. `POST /api/storefront/v1/payments/session` 创建 Mock 会话 → 返回 `sessionUrl` + `providerRef`。
2. Mock 收单页回调 → 后端以正确签名投递 Webhook（错误签名 400、无副作用）。
3. 事件去重表 `shop_webhook_events`（event_id 唯一）→ 重复投递不重复改单（T-03 实证）。
4. 支付成功 → 订单 `pending_payment → paid`，库存预占转实扣（T-04 实证：仅 Webhook 亦完成）。
- 证据：`docs/reports/transaction-tests.md`（T-01~T-12 逐项）。

## 5. 遗留项（真实开户后必须复验）

| # | 事项 | 责任 |
| --- | --- | --- |
| 1 | Stripe/PayPal 真实开户、结算币种清单导出（截图存档） | 财务/支付 |
| 2 | Stripe Webhook endpoint 注册 + `STRIPE_WEBHOOK_SECRET` 配置 | 后端 |
| 3 | 3DS/SCA 回归（欧洲扩展时） | 后端 + QA |
| 4 | 拒付（chargeback）处理流程 | 运营 |
