# BACKEND_AUDIT.md · 现有后台审计与目标模型定稿（P0-T06 ~ T11）

> 计划版本：v1.2 · 审计日期：2026-11-04 · 审计方式：源码审计 + 运行中系统实测（证据见 `docs/reports/live-api-evidence.md`）
>
> **前提说明**：本仓库即「现有后台」（Vue Admin：Vue3 + Vite 前端；`server/`：Express + Sequelize + Umzug + MySQL）。审计结论按「已有 / 需扩展 / 需新建」三态给出；跨端独立站开发以此为准，不建第二套后端。

## 0. 环境与基线事实（实测）

- 数据库 `vue_admin` 就绪（utf8mb4），迁移 **已执行 70、待执行 0**（`npm --prefix server run migrate:status`，2026-11-04）。
- 开发服务器运行于 `https://localhost:5173`（`/health` 正常，自签证书）。
- 商城域迁移已就位：`shop-categories/brands/attributes/spus/skus/rate-snapshots/product-prices/channels/shops/channel-products/warehouses/inventory/inventory-log/orders/order-items/order-shipments/promotions/coupons`（迁移号 20261104_000002~000032）。
- 公开面现状：`/api/storefront/v1` 仅 4 个只读接口（health/categories/products/products/:slug/rates/snapshot），挂载于 `server/app.ts:160`。
- 后台面现状：`/api/v1/shop/*`（`server/modules/shop/routes/index.ts`，admin 鉴权 + 租户上下文）。

## 1. 商品模型（P0-T06）——结论：已有，可复用；少量扩展

| 对象 | 现状（模型/表） | 结论 |
| --- | --- | --- |
| SPU | `shop_spus`（`ShopSpu`）：name/description 多语言 JSON、cover、images[]、categoryId、brandId、status(draft/pending/listed/published…)、tenantId | 已有，直接复用；**缺 slug 列**（C 端现用生成式 slug `{id}-{kebab}`，见 `storefront/services/catalogService.ts:95`） |
| SKU | `shop_skus`：code、spec JSON、barcode、hsCode/originCountry/declaredValue/compliance、status | 已有；跨境申报字段已备 |
| 类目 | `shop_categories`（树形、name 多语言 JSON、level/sort） | 已有 |
| 品牌 | `shop_brands` | 已有 |
| 属性 | `shop_attributes`（categoryId、type text\|select、options JSON、required、sort） | 已有；**无「决定SKU/仅展示/可筛选」标注位** → 需扩展（见 §7 整改 T-1） |
| 上下架 | SPU status + 工作流发布审批（`/shop/workflow-callback`） | 已有；C 端只露 listed/published（`catalogService.PUBLIC_STATUSES`） |

## 2. 价格模型与币种配置（P0-T07）——结论：需扩展（本阶段最高优先）

- **价格行**：`shop_product_prices`（`ShopProductPrice`：skuId、currency、amount **DECIMAL(12,2)**、rateSnapshotId、唯一索引 `uq_product_prices_tenant_sku_currency`）。→ 按币种显式定价行，可复用。
- **汇率快照**：`shop_rate_snapshots`（baseCurrency、rates JSON、rateDate）+ `rateService`。→ 属后台定价辅助能力。
- **币种配置现状（关键缺口）**：
  1. 币种值**没有**后台「商城设置」级配置：`siteContext.ts` 从 `shops.credentials.defaultCurrency` 读站点默认，`catalogService` 还接受 **query 参数**并硬编码回退 `'USD'`（`normalizeCurrency`）。违反计划 C1/C7（配置缺失应 fail-closed，不得默认 USD）。
  2. settings 表为 WordPress 风格 key-value（`settings.optionKey/optionValue TEXT JSON/autoload`），已有 `getSettingByKey/saveSettings/refreshSiteInfo` 缓存失效链路。→ **币种配置落点：`settings.optionKey='shop.currency'`（JSON：code/symbol/decimalDigits/symbolPosition/locale）**。
  3. `/api/storefront/v1/store-config` 当前 404（实测 2026-11-04）→ 本阶段新建。
- **金额精度**：存量 DECIMAL(12,2)（orders.amount、product_prices.amount、coupons.value/minSpend）。违反计划 C2（整数最小单位）。→ **整改口径：C 端全部新链路以整数「分」计算与存储（BIGINT）；报价层读取存量 DECIMAL 行时一次性转换为分（round half up）；新表全部 BIGINT。后台展示字段照旧，不做存量改列。**
- **Store Config 接口可读取路径**：`Setting.findOne({where:{optionKey:'shop.currency'}})` → JSON 解析 + 校验（code/symbol/decimalDigits/symbolPosition/locale）→ 失败返回 CONFIG_MISSING / CONFIG_INVALID（fail-closed，禁止默认 USD）。

## 3. 库存模型（P0-T08）——结论：已有底座，需扩展预占

- `shop_inventories`（skuId、warehouseId、quantity、locked）：**可售库存 = quantity - locked**，与计划假设一致。
- `shop_inventory_logs`（skuId、warehouseId、delta、type、ref）：有流水。
- 现状缺口：**无预占模型/TTL/条件更新并发防护**（`inventoryService` 目前为后台手动 adjust + 流水）。→ 新建 `shop_inventory_reservations`（TTL、状态、幂等）+ 事务内条件更新（`UPDATE shop_inventories SET locked=locked+:q WHERE ... AND quantity-locked>=:q`）+ 过期释放定时任务。
- 并发控制可行性：MySQL InnoDB 行锁 + 条件 UPDATE 可行（结论：可实现，见 `ORDER_PAYMENT_STATE_MACHINE.md` §库存）。

## 4. 订单模型（P0-T09）——结论：需扩展（C 端结算字段）

- `shop_orders`：orderNo、channelId、shopId、buyer JSON、**currency（✓ 币种已固化进订单）**、amount DECIMAL(12,2)、status、tenantId。历史订单不随后台改币种变化（C6 天然满足：currency 字段已固化）。
- `shop_order_items`：orderId、skuId、qty、price DECIMAL。→ **缺商品标题/属性/单价币种快照**（title/spec 快照需补，防商品改名后对不上账）。
- `shop_order_shipments`：carrier、trackingNo、customsNo、status。→ 已有履约底座。
- 缺失快照与补建方案：新增迁移 `20261104_000040_add_shop_orders_storefront_columns.ts`（见 §7 T-4）：paymentStatus、email、shippingAddress JSON、totalsCents（subtotal/discount/shipping/tax BIGINT）、amountCents BIGINT、couponCode、accessToken、idempotencyKey（唯一）、reservationId、paidAt/closedAt/cancelledReason。订单项补 title/spec/unitAmountCents 快照列。

## 5. 顾客与权限（P0-T10）——结论：需新建（与 Admin 完全隔离）

- 现状：仅管理端 `users`（JWT 双 Token + HttpOnly Cookie），无 C 端 Customer。
- → 新建：`shop_customers`（email 唯一、passwordHash bcrypt、status）、`shop_customer_addresses`（收货地址簿）。JWT 采用**独立 secret**（`JWT_CUSTOMER_SECRET`）+ audience `storefront`，与 admin JWT 完全隔离；Cookie `sb_access`（HttpOnly、SameSite=Lax、Secure）。Guest 身份用 `sb_cart` 购物车令牌（随机 128bit，不可枚举）。

## 6. 促销与售后（P0-T11）——结论：促销已有底座，售后需新建

- `shop_coupons`：**已含 currency 字段**（优惠券绑定币种 ✓，与计划一致）、type/value/minSpend/validFrom/validTo。缺：核销记录（redemptions）→ 新建 `shop_coupon_redemptions`。
- `shop_promotions`：name 多语言、type/scope/rule JSON、startAt/endAt。
- Return/Refund：**全缺** → 新建 `shop_return_requests`（政策版本快照、状态流）、`shop_payments`（退款载体）。

## 7. 整改任务映射（审计 → 开发任务）

| # | 整改项 | 审计依据 | 落点任务 |
| --- | --- | --- | --- |
| T-1 | 属性标注位（决定SKU/展示/筛选） | §1 | P2-T05/T06 品类模块（迁移加列 `usage`） |
| T-2 | 币种配置唯一数据源 + fail-closed | §2 | P1-T06 Store Config 服务 + 迁移种子行 |
| T-3 | 币种配置治理（二次确认/审计/定时/回滚） | §2 | P5-T02（admin API + 审计表 `shop_config_changes`） |
| T-4 | C 端订单快照扩展列 + 订单项快照 | §4 | P3-T10（迁移 20261104_000040） |
| T-5 | 库存预占/TTL/条件更新 | §3 | P3-T08（`shop_inventory_reservations` 迁移 + 服务） |
| T-6 | 顾客/地址/购物车 | §5 | P3-T01、P4-T01/T02（迁移 shop_customers 等） |
| T-7 | 支付/Webhook/退款/评价/邮件 | §6 | P3-T11/T12/T14、P4-T05~T08（迁移 shop_payments 等） |
| T-8 | 精度整改：报价层整数分 | §2 | P3-T04 报价服务（读取 DECIMAL→分，整数运算） |

## 8. 历史订单展示（C6 复核）

订单创建时 currency 已固化进 `shop_orders.currency`，历史订单原币种展示不受后台改币种影响 → 结论：**满足 C6，无需回改历史单**；C 端展示一律读订单快照币种，禁止读当前配置。

## 9. 审计签字状态

- 本审计由 AI 于 2026-11-04 基于源码与运行中系统实测产出；后台模型负责人：本仓库维护者（server/modules/shop + storefront 模块）。
- 待业务复核项集中在 `MARKET_STRATEGY.md` §6（审批状态表）。
