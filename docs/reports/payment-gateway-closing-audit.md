# 支付网关收口审计（A2：剩余技术项）

> 关联：`docs/reports/payment-gateway-channels-audit.md` §6 残留登记
> 日期：2026-11-09 · 租户：测试租户 987712
> 提交：`c0f90a8 → 0792f71`

## 1. 背景

A2 轮聚焦上一轮支付网关接入报告中「未纳入 / 残留」里**纯代码、无业务/运维决策**的三项：

1. PayPal 返回后主动 capture 的触发端点（原仅依赖 webhook 通知）；
2. 网关回跳页免登录状态查询（原仅依赖 accessToken + 轮询）；
3. 主动查单补单 / 超时关单调度（适配器已有 `query()`，但无定时任务）。

其余 6 项（证书轮换、通道按租户隔离、银联外币结算币种、legacy 关闭、二维码图片依赖、对账文件解析）属运维/架构/依赖决策，仅登记、不代改（见 §5）。

## 2. 改动清单

### 2.1 共用状态机抽取 `paymentService.applyGatewayEvent`（无行为变更）

- 将 `handleWebhook` 内「验签后」的绑定校验 / CAS 认领 / 审计 / 邮件逻辑抽取为独立导出函数 `applyGatewayEvent(provider, event)`；
- `handleWebhook` 在 `verifyAndParse` 后直接委派，**既有契约逐字不变**（既有 41 个支付回归用例全绿）。
- 收益：capture、查单补单、webhook 三条入口共用同一套幂等/CAS 底座，副作用（预占 commit / 释放、审计、邮件）仅赢家产生。

### 2.2 PayPal 类通道主动确认 `capturePayment`

- `paymentService.capturePayment(orderNo, provider)`：校验支付单存在 + provider 匹配 + 仍 `initiated`，调用 `gateway.capture()` 生成事件后交 `applyGatewayEvent` 落地；重复调用幂等（已终态直接 `alreadyProcessed`）。
- `paypal` 适配器补充 `query()`（COMPLETED→成功，VOIDED→失败，其余→null 留待 return-capture）。
- 路由 `POST /payments/capture` + 控制器 `capturePayment`：**必须由回跳凭证授权**（否则 401），避免无鉴权 capture 被滥用。
- 前端：结果页 `onMounted` 检测到网关回跳（`rt` + `provider`）且未支付时，先 `capturePayment(orderNo, provider, rt)` 再轮询。

### 2.3 免登录回跳凭证 `makeReturnToken / verifyReturnToken`

- 无状态签名 token（`orderNo.provider.exp` + HMAC-SHA256，TTL 15 分钟，密钥复用 `config.payment.webhookSecret`）。
- `createSession` 生成并写入 `returnUrl`（`&rt=`）与返回结构 `returnToken`。
- 路由 `GET /payments/order-by-return-token/:token` + 控制器 `orderByReturnToken` → 调 `checkoutService.getOrderByReturnToken` 返回只读订单状态；凭证无效/过期/不匹配返回 `data:null`。
- 前端 `result.vue`：`rt` 存在时改用 `getOrderByReturnToken(rt)` 取订单，**不再依赖 accessToken**，解决了网关跳转只带 `orderNo+provider` 导致结果页「未找到」的问题。
- BFF（`shops/server/api/[...mock].ts`）新增 `payments/capture` 与 `payments/order-by-return-token/:token` 两处直通代理。

### 2.4 对账/补单/超时关单调度 `paymentReconcileService`

- `reconcilePayments()`：扫描 `status='initiated'` 且 `createdAt` 早于 `timeoutMs`（默认 30 分钟，可 `PAYMENT_RECONCILE_TIMEOUT_MS` 覆盖）的支付单：
  - 适配器实现 `query()` → 主动查单，成功走 `applyGatewayEvent`，失败/过期→关单；
  - 不支持查单，或查单结果空且已超硬上限（24 小时）→ 标记 `status='expired'` 并 `releaseReservation`（幂等）。
- `startPaymentReconcileScanner(5min)` 挂入 `app.ts`，与既有工作流超时扫描器同范式。

## 3. 文件改动

| 文件                                                            | 类型                                                       |
| --------------------------------------------------------------- | ---------------------------------------------------------- |
| `server/modules/storefront/services/paymentService.ts`          | 改：抽取 `applyGatewayEvent`、`capturePayment`、回跳 token |
| `server/modules/storefront/services/checkoutService.ts`         | 改：新增 `getOrderByReturnToken`                           |
| `server/modules/storefront/services/paymentReconcileService.ts` | 新：对账调度                                               |
| `server/modules/storefront/controllers/paymentController.ts`    | 改：新增两控制器                                           |
| `server/modules/storefront/routes/payment.ts`                   | 改：新增两条路由                                           |
| `server/modules/storefront/payments/gateways/paypal.ts`         | 改：补充 `query()`                                         |
| `server/modules/storefront/payments/types.ts`                   | 改：`query` 上下文增 `gatewayRef`                          |
| `server/app.ts`                                                 | 改：挂载扫描器                                             |
| `shops/server/api/[...mock].ts`                                 | 改：BFF 透传两条端点                                       |
| `shops/composables/useCheckout.ts`                              | 改：新增 `capturePayment` / `getOrderByReturnToken`        |
| `shops/pages/checkout/result.vue`                               | 改：回跳凭证取单 + 主动确认                                |
| `server/__tests__/payment-gateway-capture-reconcile.test.ts`    | 新：8 例                                                   |

## 4. 测试

- 新增 `payment-gateway-capture-reconcile.test.ts` **8/8**（租户 987712）：回跳 token 往返/篡改/跨单/格式异常、mock 无 capture 返回 422 且不误标、状态机幂等复用、超时关单并释放预占、窗口内不误关。
- 既有支付/回调/退款 41/41 + 评价审核 16/16 全绿；后端全量见 §6 补记。
- 行尾：staged blob CR=0。

## 5. 仍登记（不代改 / 不代决）

| 项                                   | 状态           | 原因                                                         |
| ------------------------------------ | -------------- | ------------------------------------------------------------ |
| 微信/支付宝/银联证书自动下载与轮换   | 待运维方案     | 当前环境变量注入 PEM；生产需轮换机制                         |
| 通道配置按站点/租户隔离              | 待架构决策     | `settings` 为全局表；多站点不同商户号需扩展                  |
| 银联外币实际结算币种                 | 待与收单行确认 | 代码按订单快照原样送 USD；实际结算/DCC 属外部口径            |
| legacy 兼容模式                      | 上线前须关闭   | 未保存过配置时仍可用 mock；生产须后台保存一次勾选并取消 mock |
| 二维码图片渲染                       | 待依赖决策     | 微信 `code_url` 当前以可点击链接展示，未引 `qrcode` 依赖     |
| 对账文件（每日 batch）解析与差错处理 | 未实现         | 需新增对账任务 + 差错队列；属独立运维模块                    |

## 6. 零残留声明

本轮未触碰并行方 `shops/` WIP（package.json、package-lock、pages/cart、shared/commerce、tests/unit 等）及计划文档；提交仅含上方自有文件。审计报告不代勾任何任务行。
