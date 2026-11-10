# 真实支付网关联调就绪清单（凭据门控）

> 状态：集成代码 **已全部就位**，唯一阻塞项是四套网关的**商户凭据（env 变量）**未提供。
> 提供凭据后，按本文档步骤即可一键联调，无需再改业务代码。

## 1. 已就绪的集成代码（无需改动）

| 模块 | 文件 | 说明 |
|---|---|---|
| 统一契约 | `modules/storefront/payments/types.ts` (`GatewayAdapter`) | `createPayment / verifyAndParse / capture / query / refund` |
| PayPal | `gateways/paypal.ts` | Orders v2，HMAC 验签 `verify-webhook-signature` |
| 微信 APIv3 | `gateways/wechat.ts` | RSA 证书 + AES-GCM 回调解密 |
| 支付宝 | `gateways/alipay.ts` | RSA2 验签 |
| 银联全渠道 | `gateways/unionpay.ts` | 全币种，RSA 验签 |
| 路由/注册 | `providerRegistry.ts` / `channelConfig.ts` | 按后台币种自动切换；银联 `*` 全币种可见；后台 `shop.payment.channels` 勾选准入 |
| 状态机 | `paymentService.applyGatewayEvent` | webhook/capture/查单 共用，CAS + 幂等 + 审计/邮件仅赢家 |
| 收口 | `capturePayment` + `paymentReconcileService` | capture 触发、免登录回跳凭证、对账扫描（5min） |

## 2. 待提供的凭据（写入 `server/.env`）

| 网关 | 所需 env 变量 |
|---|---|
| **PayPal**（USD 等外币） | `PAYPAL_CLIENT_ID` `PAYPAL_CLIENT_SECRET` `PAYPAL_ENV` `PAYPAL_WEBHOOK_ID` + 全局 `PAYMENT_PUBLIC_BASE_URL` |
| **微信支付 APIv3**（CNY） | `WECHAT_MCH_ID` `WECHAT_APP_ID` `WECHAT_API_V3_KEY` `WECHAT_SERIAL_NO` `WECHAT_PRIVATE_KEY`(PEM) `WECHAT_PLATFORM_PUBLIC_KEY`(PEM) |
| **支付宝 RSA2**（CNY） | `ALIPAY_APP_ID` `ALIPAY_PRIVATE_KEY`(PEM) `ALIPAY_PUBLIC_KEY`(PEM) `ALIPAY_GATEWAY` |
| **银联全渠道**（全币种） | `UNIONPAY_MER_ID` `UNIONPAY_CERT_ID` `UNIONPAY_PRIVATE_KEY`(PEM) `UNIONPAY_PUBLIC_KEY`(PEM) `UNIONPAY_GATEWAY` `UNIONPAY_FRONT_TRANS_URL` `UNIONPAY_BACK_TRANS_URL` |

> 凭据均为服务端密钥，建议经环境变量/密钥管理注入，**不要提交进仓库**。

## 3. 联调验收步骤（凭据到位后由我执行）

1. 写入凭据 + 公网可访问的回调域名（`PAYMENT_PUBLIC_BASE_URL`）。
2. 后台开启 `shop.payment.channels` 并设定**启用币种**（如 USD→PayPal；CNY→微信/支付宝；银联始终可见）。
3. 沙箱走通：建单 → 支付会话 → 跳转/扫码 → webhook/capture → 对账扫描。
4. **验签验证**：构造无效签名回调，确认返回 401 拒绝（已有 `payment-webhook-binding-race` 用例覆盖逻辑，沙箱再实战确认）。
5. **退款链路 + RMA 联动回归**：`rma-refund-link` 用例 + 真实退款回调。
6. 切 live 前复核：证书轮换机制、租户隔离、银联外币实际结算币种、关闭 legacy(mock)、二维码依赖、对账文件接入。

## 4. 阻塞项（非代码缺口）

- 四套网关商户凭据未提供 → 真实扣款联调无法进行（沙箱/生产均依赖）。
- 6 项运维配置待确认：证书轮换 / 租户隔离验证 / 银联外币结算币种 / legacy(mock) 关闭 / 二维码依赖 / 对账文件接入。

## 5. 结论

代码侧已是 turnkey 状态：通道按币种自动路由、银联全币种、回调双向验签、capture 状态机、对账调度全部实现且被测试覆盖。
**下一步只需用户提供任一网关凭据，即可进入沙箱端到端联调。**
