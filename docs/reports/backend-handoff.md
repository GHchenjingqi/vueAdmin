# 后端交易闭环 · 交接备忘（移交并行 Agent / WorkBuddy）

> 日期：2026-11-04 · 依据用户裁决（option: yield-to-parallel）：后端交易闭环由并行 Agent 实现，本会话专注前端与接线层。
> 契约基线：`docs/API_CONTRACT.md`（本会话产出，已在 git eb6e299 归档）+ `docs/ORDER_PAYMENT_STATE_MACHINE.md`

## 1. 已就绪、可直接依赖的资产（本会话交付）

| 资产 | 状态 | 说明 |
| --- | --- | --- |
| 迁移 20261104_000040 | **已应用** | shop_orders C 端扩展列（paymentStatus/email/shippingAddress/amountCents 等 BIGINT 分 + accessToken + idempotencyKey 唯一索引）；order_items 快照列（title/spec/unitAmountCents/lineTotalCents/currency） |
| 迁移 000042 / 000043 / 000044 | **已应用** | carts+cart_items（token 唯一）、inventory_reservations（TTL/ref）、order_payments（providerRef 幂等） |
| 迁移 000046~000050 | **已应用** | webhook_events（provider+eventId 唯一）、order_events（审计）、config_changes（币种治理审计）、coupons 扩展列（usageLimit/usedCount/kind）+ coupon_redemptions、**settings 种子（shop.currency=USD 配置、shipping/tax 规则表）** |
| `shop/models/`（你方草稿） | 进行中 | ShopCart/ShopCartItem/ShopInventoryReservation/ShopOrderPayment 与上述迁移对齐；注意 init() 需补 createdAt/updatedAt 键（server typecheck 当前红在这 4 个文件） |
| 前端独立站 `shops/` | 完成 | Nuxt3 全量页面 + BFF；单测 12/12；构建/SSR 冒烟通过（docs/reports/frontend-smoke.md） |
| 前端接线层 | 完成 | `shops/server/api/[...mock].ts` + `shops/server/utils/commerce.ts`：`NUXT_COMMERCE_SOURCE=mock/real/auto` 三态，默认 mock |

## 2. 后端接口约定（前端已按此实现 real 模式，请对齐路径与响应）

- 前缀：`/api/storefront/v1`（siteContext 注入租户）
- `GET /cart`、`POST /cart/items {skuId,qty}`、`PATCH /cart/items/:itemId {qty}`、`DELETE /cart/items/:itemId`
  - 购物车令牌：Cookie `sb_cart`（HttpOnly；不存在时下发）
- `POST /checkout/quote {address?,couponCode?,shippingRateId?}` → 服务端重算（金额整数分，currency=启用币种；cart 币种不一致 → 409 CURRENCY_CHANGED）
- `POST /checkout/orders`（Header `Idempotency-Key`）→ 201 `{orderNo,id,accessToken}`；同键重放返回原单
- `POST /checkout/orders/:orderNo/pay-session {returnUrl}` → 支付会话（金额/币种取订单快照；provider 币种能力前置校验 PROVIDER_CURRENCY_UNSUPPORTED）
- `GET /orders/:orderNo?t=<accessToken>` → 越权/缺 token 一律 404（防枚举）
- `POST /webhooks/:provider` → 验签（X-Mock-Signature: t=<ts>,v1=HMAC(secret, t+'.'+body)）+ 事件去重（webhook_events）+ 幂等改单 + 币种/金额不一致告警不改单
- 响应包裹 `{code:0,data}`；私有接口 `Cache-Control: private, no-store`
- 金额口径：**整数分**（C2）；金额对象 `{amount, currency}`（C3）；读取 DECIMAL 元列时一次性转分
- 库存预占：事务内条件更新 `UPDATE inventory SET locked=locked+:q WHERE id=:id AND (quantity-locked)>=:q`，ref 建议用 `order:{orderNo}`（释放/实扣幂等）

## 3. 前端切换步骤（你方接口就绪后）

1. 确认上述端点可用（curl 冒烟）。
2. `shops/.env.example`（或启动环境）设 `NUXT_COMMERCE_SOURCE=real`（或 auto=真实优先+网络级兜底）。
3. 重启 `shops`（`npm run dev` / 重新 `nuxt build`）。
4. 回归：加购 → 报价 → 下单（幂等重放同单号）→ 支付会话 → Webhook → 结果页 captured；越权 token 404；T-01~T-12 按计划 §9。

## 4. 本会话已撤出的后端代码（避免重复实现）

按裁决，本会话曾实现的后端草案（storefront 模块的 cart/quote/reservation/order/payment/webhook/sweeper 服务与 commerceController、shared/schemas/storefront-commerce.ts、shop/controllers/storeConfigController.ts）已全部移除，避免与你方 `shop/models` 命名空间冲突；**仅保留已应用迁移 + 本备忘**。币种治理（settings 键 `shop.currency` + 二次确认/审计/定时/回滚，参考实现要点见 git 历史与本契约）请按 `docs/MARKET_STRATEGY.md §5` 落地。

## 5. 运行中观察到的环境事实（供排障）

- 后台 dev 进程 `tsx app.ts`（无 watch）——改码后需重启；本会话 16:4x 观察到 5173 短暂不可达（疑似你方重启窗口）。
- MySQL `vue_admin` 已迁移 81 版本，全部成功。
- dev 证书自签名：跨进程调用需 `NUXT_API_INSECURE_TLS=1`（仅本地）。

## 补记（2026-11-05）：Store Config 与币种治理已补位

- `GET /api/storefront/v1/store-config` 上线（settings.shop.currency 唯一数据源，C7 fail-closed）
- siteContext.defaultCurrency 跟随全局设置（缺失回退 credentials + warn）
- admin API：GET/PUT/rollback/config-changes（二次确认 literal 强制 + config_changes 审计 + 定时生效就绪）
- T-12 全链路实测通过（切换/旧车 CURRENCY_CHANGED/订单快照不变/回滚），证据 docs/reports/t12-currency-switch.md
- 后台设置界面待做；BFF shops/server/api/store-config.get.ts 已切 real-first（503 fail-closed）

