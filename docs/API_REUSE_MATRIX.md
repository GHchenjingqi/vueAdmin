# API_REUSE_MATRIX.md · 现有 `/api/v1/shop` 与公开接口盘点（P0-T12）

> 审计日期：2026-11-04 · 依据：`server/routes/index.ts`（`router.use('/shop', shopRoutes)`，前缀 `/api/v1/shop`）+ `server/app.ts`（`/api/storefront/v1`）+ 运行实测。

## 1. 后台接口（`/api/v1/shop/*`，admin 鉴权 + 租户上下文）

| 接口 | 用途 | 金额字段 | 携带 currency | 复用结论 |
| --- | --- | --- | --- | --- |
| GET /shop/health | 健康检查 | — | — | 直接复用 |
| /shop/categories /brands /attributes | 类目/品牌/属性 CRUD | — | — | 直接复用 |
| /shop/spus /skus（含 status 审批回调） | 商品/变体管理 | — | — | 直接复用；slug 列由 T-1 扩展 |
| /shop/prices（upsertPriceSchema）/rates/snapshot | 按币种定价行、汇率快照 | amount DECIMAL(12,2) | ✓（price 行 currency 列；coupons.currency 亦有） | 直接复用；C 端读取时转整数分 |
| /shop/channels /shops /channel-products | 渠道/店铺/上架关系 | — | — | 直接复用；站点上下文读取 credentials.defaultCurrency |
| /shop/warehouses /inventory（adjust） | 仓库/库存调整 | — | — | 直接复用；预占链路新增（见 BACKEND_AUDIT §3） |
| /shop/orders /orders/:id/ship | 订单/发货 | amount DECIMAL(12,2) | ✓（shop_orders.currency） | 复用；C 端订单扩展列见审计 §4 |
| /shop/promotions /coupons | 促销/优惠券 | value/minSpend DECIMAL(12,2) | ✓（coupons.currency） | 复用；核销表新增 |
| /shop/analytics | 经营数据 | — | — | 直接复用 |
| /shop/settings（P1-T06 新增） | 币种配置治理 | — | ✓ | 新建（settings 表 key=shop.currency） |

## 2. 公开接口（`/api/storefront/v1/*`，免 admin 鉴权，siteContext 注入站点+租户）

| 接口 | 现状 | 币种来源 | 复用结论 |
| --- | --- | --- | --- |
| GET /health | 正常 | — | 保留 |
| GET /categories | 正常（多语言 name） | — | 保留 |
| GET /products /products/:slug | 正常（35 条测试数据实测） | query.currency + 站点默认，回退硬编码 USD | **改造**：币种改读全局配置（见 BACKEND_AUDIT §2） |
| GET /rates/snapshot | 汇率快照只读 | — | 保留为后台辅助能力；C 端结算链路不使用（C5 不做运行时换算） |
| GET /store-config | **不存在（实测 404/空）** | — | 新建（P1-T06） |

## 3. 新建公开接口（本计划交付，契约见 `API_CONTRACT.md`）

| 接口 | 任务 | 说明 |
| --- | --- | --- |
| GET /store-config | P1-T06 | 单一启用币种下发给 C 端（缓存 60s + 配置保存主动失效） |
| /cart/* /checkout/quote /orders /payments/session /webhooks/:provider /customers/* /returns /reviews | P3、P4 | C 端交易闭环；金额一律 `{amount:int 分, currency}` |

## 4. 金额字段口径统一（C2/C3 复核）

- 新链路所有金额对象形如 `{ amount: 129900, currency: "USD" }`（amount=最小货币单位整数）。
- 读取存量 DECIMAL(12,2)（orders.amount / product_prices.amount / coupons.value）→ 报价层一次性 `Math.round(x*100)` 转分，运算全程整数；写回后台展示字段时除以 100。
- 错误结构：HTTP 状态码 + `{ code, message, requestId }`（bizCode 扩展见 storefront/errors.ts）。
