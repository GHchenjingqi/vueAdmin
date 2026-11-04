# API_CONTRACT.md · Storefront API 契约 v0（P0-T15）

> 生成：2026-11-04 · 前缀：`/api/storefront/v1`（独立于 admin `/api/v1/shop`）· 响应包裹：成功 `{code:0, data}`；失败 `{code:<bizCode>, message, requestId}`（HTTP 状态码语义化）· 金额对象：`{amount:int(最小货币单位), currency:code}`，禁止裸数字（C3）。

## 1. 通用约定

- 版本：路径版本 `/v1`；破坏性变更走 `/v2`。
- 幂等：`POST /orders` 必须带 `Idempotency-Key` 头；Webhook 以 `event_id` 幂等。
- 鉴权：顾客 JWT（HttpOnly Cookie `sb_access`，aud=storefront，独立 secret）；游客=`sb_cart` 购物车令牌；订单访问=accessToken。
- 隐私：cart/checkout/orders/customers 响应头 `Cache-Control: private, no-store`（T-11）。
- requestId：BFF 生成 `X-Request-Id`，后端日志与错误响应透传（P1-T09）。

## 2. 端点清单

### 2.1 Store Config（P1-T06）

```
GET /store-config
→ 200 {code:0, data:{
  currency: { code, symbol, decimalDigits, symbolPosition, thousandsSeparator, decimalSeparator, locale },
  market: { country, language },
  version: "<ISO 时间戳>"
}}
错误：CONFIG_MISSING / CONFIG_INVALID（fail-closed，不得默认 USD）
缓存：Cache-Control: public, max-age=30, stale-while-revalidate=30（≤60s 生效，C8）
```

### 2.2 目录（已有，改造币种来源）

```
GET /categories?lang=en-US
GET /products?category=&sort=&page=&pageSize=&attr.<code>=<value>   # 白名单参数
GET /products/:slug          # 下架/不可售 → 404 {code:"PRODUCT_NOT_FOUND"}
```

### 2.3 购物车（P3-T01/T02）

```
GET    /cart                          # 读当前（游客 token 或顾客）
POST   /cart/items {skuId, qty}       # 服务端校验 SKU/库存/可售
PATCH  /cart/items/:id {qty}          # 0=删除
DELETE /cart/items/:id
```
行结构：`{id, skuId, spuId, title, spec, qty, unit:{amount,currency}, lineTotal:{amount,currency}, sellable, stockNote}`；购物车金额仅作展示快照（报价以后端 Quote 为准）。

### 2.4 报价（P3-T04~T07）

```
POST /checkout/quote {address?:{country,province,city,postcode}, couponCode?, shippingRateId?}
→ 200 data:{ quoteId, version, expiresAt, currency,
  items:[{skuId,title,qty,unit:{amount,currency},lineTotal:{amount,currency}}],
  subtotal, discount, shipping, tax, total,          // 均为 {amount,currency}
  shippingRates:[{id,name,amount:{amount,currency},eta}], appliedCoupon?}
错误：CURRENCY_CHANGED（购物车币种≠当前配置，要求重建报价）/ COUPON_EXPIRED / COUPON_EXHAUSTED /
     COUPON_NOT_APPLICABLE / COUPON_CURRENCY_MISMATCH / ADDRESS_NOT_SHIPPABLE / INSUFFICIENT_STOCK
```

### 2.5 订单与支付（P3-T09~T13）

```
POST /orders   (Idempotency-Key) {quoteId, address, email, note?}
→ 201 data:{orderNo, id, accessToken, status:"pending_payment", totals, currency, expiresAt}
重复提交同 key → 返回原订单（不重复建单，T-02）

POST /payments/session {orderId}
→ 200 data:{provider, sessionId, providerRef, sessionUrl, amount:{amount,currency}}
错误：PROVIDER_CURRENCY_UNSUPPORTED / ORDER_NOT_PAYABLE

POST /webhooks/:provider      # 原始请求体验签；重复 event_id → 200 幂等；验签失败 400 无副作用

GET /orders/:id?t=<accessToken>    # 详情（快照金额按订单币种）
GET /orders/:id/status?t=<accessToken>  # 结果页轮询
```

### 2.6 顾客（P4-T01/T02）

```
POST /customers/register {email,password}   → 注册并登录
POST /customers/login {email,password}      → Set-Cookie sb_access
POST /customers/logout                      → 撤销当前会话
GET  /customers/me
GET/POST/PUT/DELETE /customers/addresses    # 仅本人；删除默认地址有兜底
POST /customers/merge-cart                  # 登录后合并游客购物车
```

### 2.7 售后与评价（P4-T05~T08）

```
POST /orders/:id/returns {reason, comment?}     # 服务端资格判断；政策版本快照
GET  /returns/:id
GET  /products/:slug/reviews                    # 仅已审核
POST /products/:slug/reviews {rating,content}   # 订单验证标记；进审核队列
POST /uploads/review-image                      # MIME/大小/分辨率校验，路径不可遍历
```

### 2.8 后台配套（admin，`/api/v1/shop`）

```
GET  /shop/settings/currency                    # 当前配置 + pending 变更
PUT  /shop/settings/currency {config, confirmImpact:true, ackNoConversion:true, effectiveAt?}
     # 审计 shop_config_changes；缓存主动失效；未确认 → 400 CONFIRMATION_REQUIRED
POST /shop/settings/currency/rollback {changeId}
GET  /shop/config-changes                       # 审计查询（X-T03）
```

## 3. 错误码表（首批）

| code | HTTP | 场景 |
| --- | --- | --- |
| CONFIG_MISSING / CONFIG_INVALID | 503 | 币种配置缺失/非法（C7 fail-closed） |
| CURRENCY_CHANGED | 409 | 购物车币种 ≠ 当前配置 |
| PROVIDER_CURRENCY_UNSUPPORTED | 409 | 服务商不支持配置币种 |
| INSUFFICIENT_STOCK | 409 | 库存不足 |
| ADDRESS_NOT_SHIPPABLE | 422 | 地址不在配送范围（T-08） |
| COUPON_EXPIRED / COUPON_EXHAUSTED / COUPON_NOT_APPLICABLE / COUPON_CURRENCY_MISMATCH | 422 | T-07 |
| QUOTE_EXPIRED / QUOTE_MISMATCH | 409 | 报价过期/与购物车不符 |
| IDEMPOTENCY_CONFLICT | 409 | 同 key 不同负载 |
| ORDER_NOT_PAYABLE / ILLEGAL_TRANSITION | 409 | 状态机拒绝 |
| PRODUCT_NOT_FOUND / ORDER_NOT_FOUND | 404 | 越权一律 404（T-10） |
| UNAUTHENTICATED / FORBIDDEN | 401/403 | 鉴权 |
