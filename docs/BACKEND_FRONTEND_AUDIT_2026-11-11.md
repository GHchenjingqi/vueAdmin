# 后端控制器 ↔ 前端页面 对照审计报告

> 生成日期：2026-11-11
> 范围：`server/modules/shop`（后台商城模块，前缀 `/api/v1/shop`）+ `src/views`（含 `src/views/shop`）+ `shops/`（C 端独立站）
> 方法：比对 `server/modules/shop/routes/index.ts` 的全部路由，与 `src/views/**` 页面、前端 API 模块、菜单种子迁移逐一对照；C 端对照 `shops/pages/**` 与 `shops/composables`、`shops/server/api`。

---

## 一、总体结论

- **后台商城模块 28 个业务域**中，**23 个已有对应后台管理页面**，**5 个后端已就绪但缺后台页面**（孤儿后端）。
- **C 端独立站**：商品浏览 / 顾客 / 购物车 / 结算 / 支付 / 订阅 / 评价 / CMS / RMA / 物流 / 埋点 等公开接口与页面基本齐备；仅「次屏 Banner」此前未在前台渲染（本次已修复）。
- **明确缺后台页面的后端（按业务优先级）**：
  1. `order-mails` — 订单邮件发件箱监控（list / drain / retry）
  2. `reviews` + `qa` — 商品评价 / 问答后台审核台（approve / reject / answer / hide）
  3. `articles` — CMS 文章后台管理（list / create / update / publish / unpublish）
  4. `bundles` — 搭配购 / 捆绑销售管理（list / create / update / delete）
  5. `channel-products` — 渠道商品发布（list / publish）
- **需确认的疑点**：`factory`（生产排产）模块在 `D:/codes/web` 仓库中**零文件**，与用户 profile 记录的「当前聚焦 factory 模块」不符，疑似属于另一工程或尚未起步（见第七节）。

---

## 二、后台后端 ↔ 前端对照表（完整）

| 后端域（路由前缀） | 主要接口 | 前端页面 | 状态 |
|---|---|---|---|
| categories | CRUD | `shop/category/CategoryList.vue` | ✅ |
| brands | CRUD | `shop/brand/BrandList.vue` | ✅ |
| attributes | CRUD | `shop/attribute/AttributeList.vue` | ✅ |
| spus | CRUD / 状态 / 提交发布 | `shop/product/SpuList.vue` + `SpuEdit.vue` | ✅ |
| skus | CRUD / 按 SPU 列表 | `shop/product/SkuManager.vue` | ✅ |
| prices（多币种） | 按 SKU 增删改查 | `shop/product/SpuEdit.vue`（内嵌） | ✅ |
| rates（汇率快照） | 快照查询 / 保存 | `shop/product/SpuEdit.vue`（内嵌） | ✅ |
| channels | CRUD | `shop/channel/ChannelList.vue` | ✅ |
| shops | CRUD | `shop/channel/ShopList.vue` | ✅ |
| channel-products | list / publish | — | ⚠️ 无独立页面 |
| warehouses | CRUD | `shop/inventory/WarehouseList.vue` | ✅ |
| inventory | list / logs / adjust | `shop/inventory/InventoryList.vue` | ✅ |
| orders + refunds | list / detail / pay / ship / cancel / refunds | `shop/order/OrderList.vue` | ✅ |
| **order-mails** | list / drain / retry | — | ❌ **无页面** |
| **rmas**（退货审核） | list / approve / reject | `shop/order/RmaAdmin.vue`（本次新增） | ✅ 本次补 |
| **reviews + qa** | list / approve / reject / answer / hide | — | ❌ **无页面** |
| promotions | CRUD | `shop/marketing/PromotionList.vue` | ✅ |
| coupons | CRUD | `shop/marketing/CouponList.vue` | ✅ |
| **bundles**（搭配购） | list / get / create / update / delete | — | ❌ **无页面** |
| analytics | sales / profit / turnover / events | `shop/analytics/AnalyticsDashboard.vue` | ✅ |
| settings/currency | 币种配置治理 | `shop/settings/CurrencyConfig.vue` | ✅ |
| settings/payment-channels | 支付通道开关 / 凭据 | `shop/settings/PaymentChannels.vue` | ✅ |
| audit-logs | 操作审计查询 | `shop/settings/AuditLog.vue` | ✅ |
| **articles**（CMS） | list / create / update / publish / unpublish | —（C 端 `shops/pages/blog` 仅消费） | ❌ **无后台管理页** |
| banners | CRUD | `Banners.vue`（顶层） | ✅ |
| customers | list / 详情 / 状态 / 积分 | `CustomerList.vue`（顶层） | ✅ |
| mail-campaigns | list / 受众统计 / send / recipients | `MailCampaigns.vue`（顶层） | ✅ |
| membership-tiers | list / recalculate / expiry / expire-now | `MemberTiers.vue`（顶层） | ✅ |

> 顶层 `src/views/*.vue`（Banners / CustomerList / MailCampaigns / MemberTiers）与 `shop/` 子目录页面共同覆盖上述域；菜单通过 `server/migrations/*_seed-shop-*-menus.ts` 种子落库，由后端 `menus` 表动态驱动侧栏与路由。

---

## 三、孤儿后端（已就绪，缺后台页面）—— 详细

### 1. 订单邮件发件箱 `order-mails`（优先级：中）
- 后端：`GET /order-mails`、`POST /order-mails/drain`（手动投递）、`POST /order-mails/:id/retry`（失败重发）
- 用途：监控订单相关邮件（如发信失败）的 outbox，人工干预投递。
- 前端：**无任何页面或 API 模块**。

### 2. 评价 / 问答审核台 `reviews` + `qa`（优先级：高）
- 后端：
  - `GET /reviews`、`POST /reviews/:id/approve`、`POST /reviews/:id/reject`
  - `GET /qa`、`POST /qa/:id/answer`、`POST /qa/:id/hide`
- 用途：把顾客提交的 `pending` 评价 / 问答审核为 `approved` / `answered`，否则前台不展示。
- 前端：**无任何页面或 API 模块**。当前 C 端评价/问答提交后，后台无法审核，存在「提交即石沉大海」断点（与 RMA 修复前同类问题）。

### 3. CMS 文章后台管理 `articles`（优先级：中）
- 后端：`GET/POST /articles`、`PUT /articles/:id`、`POST /articles/:id/publish`、`POST /articles/:id/unpublish`
- 用途：创建 / 编辑 / 发布博客文章（C 端 `shops/pages/blog` 仅做只读消费）。
- 前端：**无后台管理页**。运营无法在后台写文章，只能靠数据库或 C 端 mock。

### 4. 搭配购 / 捆绑销售 `bundles`（优先级：低）
- 后端：`GET/POST /bundles`、`GET/PUT/DELETE /bundles/:id`
- 用途：组合多个 SKU 做捆绑折扣促销。
- 前端：**无页面**（营销中心仅有优惠券 / 活动，无 bundle 入口）。

### 5. 渠道商品发布 `channel-products`（优先级：低）
- 后端：`GET /channel-products`、`POST /channel-products`（发布到渠道）
- 用途：把 SPU/SKU 发布到具体渠道 / 店铺。
- 前端：**无独立页面**（可能被渠道管理页内部消化，或尚未暴露 UI）。

---

## 四、前端无对应后端的页面（壳页面排查）

- 经核查，`src/views/**` 中**未发现**完全无后端支撑的静态壳页面。
- C 端 `shops/pages/account/rma.vue` 此前误判为壳页面，实已通过 `@shared/customer/auth` 的 `submitRma` / `listMyRmas` 接真实接口，**功能完整**。

---

## 五、C 端独立站（shops/）缺口

| 功能 | 状态 |
|---|---|
| 商品浏览 / 搜索 / 详情 | ✅ |
| 顾客注册登录 / 账户 / 地址 / 订单 / 会员 / RMA 提交 | ✅ |
| 购物车 / 结算 / 支付 / Webhook | ✅ |
| 订阅 / 到货提醒 / 评价 / 问答 / CMS / 物流轨迹 / 埋点 | ✅ |
| **次屏 Banner（position=secondary）前台渲染** | ⚠️→✅ **本次修复**：`shops/pages/index.vue` 现同时拉取并渲染 `secondary` 位 Banner（hero 轮播 + 次屏促销宫格） |

> 说明：C 端 `useCms.listBanners('secondary')` 早可调用，但首页此前只拉 `hero`；本次在首页新增次屏 Banner 区块（后台可配 `position='secondary'` 的活动 / 促销入口）。

---

## 六、本次已交付（A + B + 本报告）

- **A**：C 端首页接入次屏 Banner（`shops/pages/index.vue`）。
- **B**：新增 RMA 后台审核处理台 `src/views/shop/order/RmaAdmin.vue` + API 模块 `src/api/shopRma.ts` + 菜单种子迁移 `20261111_000001_seed-shop-rma-menu.ts`（菜单已落库 id=51）+ 中英文 i18n。typecheck / lint 通过。
- **C**：本报告。

---

## 七、需用户确认的疑点

- **工厂排产模块（factory）**：`D:/codes/web` 仓库检索 `factory / 排产 / SelectOrder / taskList` **零命中**。若该功能属于本仓库，则尚未起步；若属于另一工程，请告知路径以便后续协同。

---

## 八、建议下一步（按性价比）

1. **高**：补「评价 / 问答审核台」（模式与本次 RMA 页完全同构，可快速复制）。
2. **中**：补「CMS 文章后台管理」与「订单邮件发件箱监控」。
3. **低**：补「搭配购 / 渠道商品发布」页面。
4. 运行 `npm run dev` 后于浏览器验证 RMA 菜单入口与次屏 Banner 渲染（dev server 当前未运行，需启动）。
