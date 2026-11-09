# 真实支付网关接入：按后台币种切换通道 + 后台勾选启用

> 2026-11-09 16:40 · 性质：需求口径拍板 → 架构改造 → 四网关适配器 → 前台/后台接线 → 回归
> 不代勾任何门禁任务行；未修改、未暂存并行方 WIP 文件。

## 1. 需求口径（本轮由业务方明确）

1. 美元（PayPal）与人民币（微信 / 支付宝 / 云闪付）**两套都要打通**，按后台启用币种自动切换支付通道；
2. 预留其他币种与其他支付方式的扩展点；
3. **银联 / 云闪付全国通用，无论后台启用哪个币种都要显示**；外币订单原样按订单快照币种送网关，代码不做换汇；
4. 前台不做复杂通道推荐：由**后台账户配置 + 自定义勾选启用**决定，「勾选微信就显示，不勾选就不显示」；
5. 直接写真实 SDK/网关调用代码。

## 2. 现状冲突（改造前）

| 冲突 | 说明 |
| --- | --- |
| 注册表只有 mock / bnpl | `providerRegistry.ts` 硬编码两个通道，无真实网关 |
| 会话不调外部 API | `createSession` 只生成本地 `pay_{orderNo}_{random}` 与 `sess_...`，返回结构无收银台凭证 |
| 验签写死 HMAC | `handleWebhook` 用 `HMAC-SHA256(secret, rawBody)` + 自定义 JSON，controller 只读 `x-mock-signature`；四家真实网关验签机制完全不同 |
| BFF 伪成功 | `shops/server/api/[...mock].ts` 对非 mock 通道直接返回结果页 URL，订单永远不会变成已支付 |
| 平台为单一启用币种 | `currencyConfig` 全站同一时刻只有一个 `settings.shop.currency`，因此通道路由是**站点级切换**，不是订单级多币种并存 |

## 3. 架构设计

### 3.1 通道注册表（`providerRegistry.ts`）
- `supportedCurrencies: string[] | '*'`，`'*'` = 全币种（银联），`supportsCurrency()` 恒通过；
- `real: boolean` 区分真实网关与 mock/bnpl；
- `listProviders(currency)` = **后台勾选 ∩ flag ∩ 币种能力**；
- `isProviderUsable()` 同时被建会话与 webhook 调用，含后台开关校验——避免「只改展示层、回调侧仍可改单」；
- 新增其它币种/通道只需在 `PROVIDERS` 增一项 + 在 `gateways/` 增一个适配器，无需改状态机。

### 3.2 后台开关（`channelConfig.ts` + 后台页面）
- 唯一数据源 `settings.optionKey='shop.payment.channels'`，存 `{ enabled: [...], accounts: {...} }`；
- **密钥/证书一律走环境变量**，绝不落 settings（该表有通用读取接口且全局明文）；后台只回显「凭据是否已配置」与缺失项，不返回密钥值；
- 60s 进程内缓存 + 保存后主动失效；`setChannelConfigOverride()` 供多站点下发与单测注入（不写库、不污染并行测试）；
- **legacy 兼容模式**：从未保存过配置时只暴露 mock/bnpl，保证既有 8 个测试文件与沙箱链路不回退；一旦保存过配置则严格按勾选过滤（含 mock）；
- 后台页面 `src/views/shop/settings/PaymentChannels.vue`（菜单 `/shop-payment-channels`，迁移 000072 种入，i18n sidebar 键已补）；API：`GET/PUT /shop/settings/payment-channels`、`GET .../state`。

### 3.3 网关适配器契约（`types.ts` + `gatewayRegistry.ts`）
统一接口 `createPayment / verifyAndParse / capture / query / refund / successResponse`，把「各网关不同的下单、验签、事件格式、退款」收敛在适配器内；`paymentService` 只处理统一 `GatewayEvent`，**完整复用既有 `(provider, providerRef)` 幂等、`paymentStatus` CAS 认领、库存预占 commit、审计、邮件入队底座**。

新增 `gatewayOrderNo`（纯字母数字商户订单号）与 `gatewayRef`（网关交易号）两列（迁移 000071），供 `out_trade_no` / `invoice_id` / `orderId` 及通知回查内部绑定；通知只带网关单号时自动回查 `order_payments` 补齐 `providerRef` / `orderNo`。

**fail-closed**：真实网关缺配置时 `assertGatewayConfigured()` 抛 503，不建会话、不静默降级为 mock。

### 3.4 四个适配器（纯 Node `crypto` + `fetch`，未引入新依赖）

| 通道 | 币种 | 下单 | 验签 | 退款 / 应答 |
| --- | --- | --- | --- | --- |
| PayPal | USD/EUR/GBP/CAD/AUD | Orders v2，`PayPal-Request-Id` 幂等，返回 approve 跳转 | `/v1/notifications/verify-webhook-signature` 在线验签（非本地 HMAC） | captures/{id}/refund；用户返回后服务端主动 `capture` |
| 微信支付 | CNY | APIv3 Native → `code_url` 二维码 | `WECHATPAY2-SHA256-RSA2048` 请求签名；通知用平台公钥验 `Wechatpay-Signature`，再用 APIv3 密钥 **AES-256-GCM 解密 resource** | `/v3/refund/domestic/refunds`；应答 JSON `SUCCESS` |
| 支付宝 | CNY | `alipay.trade.page.pay` 带 RSA2 签名的 GET 表单 | 通知剔除 sign/sign_type 后字典序拼接、支付宝公钥验 RSA2 | `alipay.trade.refund`；应答纯文本 `success` |
| 银联/云闪付 | `'*'` 全币种 | 全渠道 `frontTransReq` 带签名表单，`currencyCode` 走 ISO 4217 数字码 | 银联公钥证书验 `signature` | `backTransReq` txnType=04 |

**外币不换汇**：银联外币订单 `txnAmt` 原样为订单快照分、`currencyCode=840(USD)`，代码不做任何换算（`payment-channel-routing.test.ts` 有实证）。

### 3.5 会话 / 回调 / 退款接线
- `createSession`：按币种选默认通道（配置模式）→ 校验准入 → 真实网关 `createPayment` → 落库 `gatewayOrderNo/gatewayRef` → 返回 `action: redirect|qr|form|sdk|mock` + 凭证；
- `handleWebhook(provider, rawBody, signature, headers)`：委派适配器验签解析 → 规范化事件 → 沿用原绑定校验 / CAS / 审计；controller 按网关返回专用应答体；
- 退款：`app.ts` 启动期注入 `installRefundGatewayProvider()`，按 `orderNo` 找原支付通道并调其 `refund`，本地 `refundNo` 作网关幂等键；mock/查不到原支付时沿用本地记账（沙箱不回归）。

### 3.6 前台/BFF
- BFF 新增 `GET /api/payments/providers` 直通；`pay` 分支对真实通道**不再伪造结果页**，透传收银台动作；
- `useCheckout.listProviders()` + `pay()` 扩展返回；结果页按后端列表渲染通道单选（勾选才显示），按 action 拉起跳转 / 二维码链接 / 表单自动提交，保留既有 3s 状态轮询与 mock 链路。

## 4. 回归验证

| 项 | 结果 |
| --- | --- |
| 新增 `server/__tests__/payment-channel-routing.test.ts` | **13/13** |
| 既有支付/回调/退款相关 8 文件 | **41/41**（迁移后复跑） |
| 后端 `tsc -p server/tsconfig.json --noEmit` | 0 错误 |
| 前端 `vue-tsc --noEmit` | 0 错误 |
| Nuxt 商城 `nuxi typecheck` | EXIT=0 |
| 迁移 `000071` / `000072` | 均已 applied |
| `node scripts/check-doc-links.mjs` | 183/183 OK |
| 后端全量 | **795/796（90 文件）**，唯一失败为既有 `shopPhases > 销售报表能聚合订单` 超时 flake（5028ms > 5000ms）；较上轮 783 增 13 例、1 文件，正好对应新增测试 |

关键用例：USD→`[paypal, unionpay]`、CNY→`[wechat, alipay, unionpay]`、银联在 USD/CNY/EUR/JPY 均可见、未勾选通道建会话 422、缺凭据 503 且无副作用、四家通知验签解析（自生成 RSA 密钥对）、篡改金额验签失败。

## 5. 上线前必须补齐（本轮无法完成，非代码缺陷）

**真实扣款尚未与任何沙箱联调**：仓库内没有四套商户号/密钥/证书，本地无法验证真实收款。适配器为配置驱动，填完下列环境变量并做一次沙箱全链路即可启用：

```
PAYMENT_PUBLIC_BASE_URL=https://<公网 HTTPS 域名>     # 各网关 notify/return 基址
PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET / PAYPAL_ENV / PAYPAL_WEBHOOK_ID
WECHAT_MCH_ID / WECHAT_APP_ID / WECHAT_API_V3_KEY / WECHAT_SERIAL_NO /
WECHAT_PRIVATE_KEY(PEM) / WECHAT_PLATFORM_PUBLIC_KEY(PEM)
ALIPAY_APP_ID / ALIPAY_PRIVATE_KEY(PEM) / ALIPAY_PUBLIC_KEY(PEM) / ALIPAY_GATEWAY
UNIONPAY_MER_ID / UNIONPAY_CERT_ID / UNIONPAY_PRIVATE_KEY(PEM) / UNIONPAY_PUBLIC_KEY(PEM) /
UNIONPAY_GATEWAY / UNIONPAY_FRONT_TRANS_URL / UNIONPAY_BACK_TRANS_URL
```

外部资质：PayPal 商户号与跨境结汇、微信/支付宝境内主体签约、银联商户号与证书、域名备案与 HTTPS 回调。

## 6. 未纳入 / 残留（不代改、不代决）

| 项 | 状态 | 原因 |
| --- | --- | --- |
| 银联外币实际结算币种 | **待与收单行确认** | 代码按业务口径原样送 USD；网关/收单机构实际以何币种结算、是否需要 DCC，属外部口径 |
| PayPal 返回后主动 capture 的触发端点 | **待接线** | 适配器已实现 `capture()`，但 `returnUrl` 回到结果页后尚无路由调用它（当前依赖 webhook 通知）；需决定「主动 capture 为主」还是「通知为主」 |
| 网关返回页免 token 查询 | **待安全决策** | 现有结果页需 `id + accessToken`；网关跳转回来只带 `orderNo`，前端需补一条安全的免 token 状态查询或一次性回跳凭证 |
| 微信平台证书下载/轮换、银联证书轮换 | **待运维方案** | 当前用环境变量注入公钥 PEM；生产需自动下载与轮换机制 |
| 二维码图片渲染 | **待组件** | 微信 `code_url` 目前以可点击链接展示，未生成二维码图片（未引入 qrcode 依赖） |
| 主动查单补单 / 超时关单 / 对账文件 | **未实现** | 适配器已有 `query()`，但无定时任务与对账差错处理 |
| 回调免鉴权 + 无租户上下文 | **既有架构项** | `/shop/workflow-callback` 之外的支付 webhook 依赖网关验签；多租户商户号归属尚未建模（当前配置为全局） |
| 通道配置按站点/租户隔离 | **待架构决策** | `settings` 为全局表，与「单一启用币种」口径一致；多站点不同商户号需扩展 |
| legacy 兼容模式 | **上线前须关闭** | 未保存过配置时仍可用 mock；生产上线前必须在后台保存一次勾选（并取消勾选 mock） |

## 7. 零残留声明

本轮未触碰并行方 `shops/` WIP 之外的既有文件（仅 `shops/server/api/[...mock].ts`、`shops/composables/useCheckout.ts`、`shops/pages/checkout/result.vue` 三处接线）；提交只含本轮自有文件与新增迁移、页面、测试、报告。迁移已执行，测试数据使用独立租户 987711。

---

*修复与门禁状态变更须由各责任方在提交后回填；本报告不代勾任何任务行。*
