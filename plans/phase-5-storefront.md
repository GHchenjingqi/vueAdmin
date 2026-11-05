# 阶段 5：Storefront 公开接口层（独立站 C 端地基）

> 依据：`shops/mds/独立站前端架构与功能设计.md` v1.0（2.2 / 2.4 / 第 5 节）
> 定位：新增 `server/modules/storefront` 公开接口模块，挂 `/api/storefront/v1`，**不走 admin 鉴权**，
> 与 shop 模块共用同一套 Sequelize 模型与服务层 —— **不复制数据、不建第二套后端**。
> 一个独立站 = 后台一个 `channel(type=independent)` + 一条 `shops` 记录，天然支持未来多站点。

---

## 边界（本轮只做第 1 步）

本阶段只落地「C 端商品浏览」这一地基，**不实现**购物车、结算、支付、顾客账户、评价、CMS、埋点。
不做 Nuxt 3 前端工程（`shops/` 下只保留设计文档），不新建任何业务表、不新增迁移。

| 步骤 | 内容 | 状态 |
|------|------|------|
| 1 | Storefront 公开模块骨架 + 站点上下文 + 商品浏览接口 | ✅ 已完成 |
| 2 | `spus.slug` 列 + 后台可编辑（替代生成式 slug）、JSON_SEARCH 全文检索 | ✅ 本轮交付 |
| 3 | C 端顾客模型（customer 表 + 独立 JWT）、register/login | ✅ 已完成 |
| 4 | 购物车 / 结算报价（运费+税）/ 建单 + 支付会话 + webhook | ✅ 已完成 |
| 5 | 评价 / Q&A / newsletter / restock-notify / RMA / CMS / 17track | ✅ 已完成（7 域全数落地：newsletter+restock / 评价+问答 / CMS / RMA / 17track） |
| 6 | 服务端 CAPI 埋点、订单来源字段（site / utm） | ✅ 已完成 |
| 7 | Nuxt 3 独立站前端工程（另起目录，不在本仓库 admin 内） | ✅ 已由并行方建成（`shops/`，不纳入后端提交树） |

---

## 第 1 步：C 端商品浏览（本轮）

### 1.1 站点上下文中间件 `siteContext.ts`

公开接口没有 `authMiddleware`，因此**必须自己建立租户上下文**（`runInTenant`），
否则 `getTenantContext()` 为空，service 层会兜底成 tenantId=1，跨租户站点会串数据。

- 解析顺序：`X-Site-Id`（`shops.id`）→ 查 `ShopShop` 取 `tenantId` / `channelId` / `credentials`；
  未提供时回退 `tenantId=1`（与 admin 平台兜底一致），`channelId/shopId=null`。
- `credentials` 中可选 `defaultCurrency` / `defaultLocale` 作为站点默认值。
- `runInTenant({ tenantId }, () => next())`，与 `tenantContext.ts` 同款写法；
  站点信息挂 `res.locals.site`，供 controller 读取。

> 后续接真实域名时，把 `X-Site-Id` 换成 `Host` → 站点映射即可，其余链路不变。

### 1.2 目录与文件

```
server/shared/schemas/storefront.ts        # Zod：列表查询 / slug 参数（.passthrough()）
server/modules/storefront/
  middleware/siteContext.ts                # 站点解析 + 租户上下文
  services/catalogService.ts               # 只读聚合 + C 端字段裁剪
  controllers/catalogController.ts         # 薄封装
  routes/index.ts                          # 公开路由（无 authMiddleware）
server/app.ts                              # app.use('/api/storefront/v1', storefrontRoutes)
```

### 1.3 接口清单

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/storefront/v1/health` | 健康检查，不查库 |
| GET | `/api/storefront/v1/categories` | 类目树（C 端字段：id/parentId/name/level/sort） |
| GET | `/api/storefront/v1/products` | 商品分页列表：`page/pageSize/keyword/categoryId/currency/lang` |
| GET | `/api/storefront/v1/products/:slug` | 商品详情：SPU + SKU 变体 + 多币种价格 + 可用库存 + SEO 字段 |
| GET | `/api/storefront/v1/rates/snapshot` | 最新汇率快照（C 端换算用） |

### 1.4 硬约束

1. **只露出 `listed` / `published`**：`draft/review/rejected/unlisted/archived` 一律不返回，详情查不到按 404 处理。
2. **字段裁剪**：显式组装返回对象，绝不直接 `res.json(row)`。
   不得泄漏 `tenantId` / `hsCode` / `originCountry` / `declaredValue` / `compliance` / `barcode` 等内部与合规字段。
3. **租户隔离**：所有查询 `where` 显式带 `tenantId`（全局 `beforeFind` 钩子对读不生效，见阶段 1 复盘）。
4. **query 参数**：schema 必须 `.passthrough()`，否则 `validate` 中间件会静默剥离筛选字段（见阶段 2/3/4 复盘）。
5. **slug**：当前 `spus` 无 slug 列。MVP 用生成式 slug `{id}-{kebab(en-US name)}`，
   路由解析取开头数字 id；同时支持纯 id。返回体带 `slug` 供前端构造 SEO URL。第 2 步再加真实列。
6. **库存**：`available = quantity - locked`，按 skuId 跨仓聚合；不返回仓库明细（送达日预估属后续）。
7. **价格**：按 `currency` 取 `product_prices`；该币种无价时回退全部币种，返回体标 `currency` 实际值。

### 1.5 验证

- 后端 `npm --prefix server run typecheck` 通过。
- 后端 `npm --prefix server run test`（新增 `storefront.test.ts`）：状态过滤、keyword、
  字段裁剪、slug 详情组装、类目树、汇率快照、跨租户隔离。
- HTTP 冒烟：不带 token 直接 `GET /api/storefront/v1/health` 与 `/products` 返回 200；
  `draft` 商品不出现在列表；详情不出现 `tenantId`。
- 无需迁移：`npm run migrate:status` 数量不变。

---

## 第 3 步：C 端顾客模型与独立 JWT（本轮）

### 3.1 数据模型（迁移 `20261104_000041_create-customers.ts`）
- `customers`：`tenantId / email(租户内唯一) / passwordHash(bcrypt) / nickname / status(active|blocked)`
- `customer_addresses`：地址簿（步骤 5 顾客账户使用，本步仅建表）

### 3.2 认证链路（复用 shop 模型层，不建第二套后端）
- `customerService`：`registerCustomer` / `authenticateCustomer` / `getCustomerById`；
  密码 `bcryptjs` 哈希（SALT_ROUNDS=10）；JWT 使用**独立 secret** `config.jwt.customerSecret`，
  payload 带 `type:'customer'`，与 admin JWT 彻底隔离。
- storefront 路由 `/api/storefront/v1/auth`：`POST /register`、`POST /login`（站点上下文定租户，公开）、
  `GET /me`（需 `customerAuth` 中间件）。
- `customerAuth`：Bearer 解析 + `type` 校验，失败统一 401。

### 3.3 硬约束
1. 顾客与 admin `users` 完全隔离（独立表、独立 JWT secret）。
2. 注册/登录邮箱同一租户唯一；错误密码统一 `401 邮箱或密码错误`，不暴露账号是否存在。
3. 禁用账号 `403`；返回体裁剪，绝不携带 `passwordHash`。
4. 租户隔离由 service 层显式 `where:{tenantId}` 保证（与全局钩子脱钩）。

### 3.4 验证
- 后端 `tsc --noEmit` 通过；`vitest run` 全量 397 用例通过（新增顾客注册/登录/me/跨租户隔离/JWT 隔离 5 例）。

---

## 第 4 步：购物车 / 结算 / 建单 / 支付 / Webhook（本轮）

> 复用 shop 模型与服务层（inventoryService / priceService），**不建第二套后端**；storefront 仅做薄编排层。

### 4.1 模型与迁移
- 迁移 `000040` 给 `orders` 增补结算列（`paymentStatus` / `email` / `shippingAddress` / `note` / `*Cents` 金额 / `couponCode` / `accessToken` / `idempotencyKey` / `reservationId` / `policySnapshot` / `paidAt` / `closedAt` / `cancelledReason`）与 `order_items` 快照列（`title` / `spec` / `unitAmountCents` / `lineTotalCents` / `currency`）；
- 迁移 `000042` `carts` / `cart_items`；`000043` `inventory_reservations`（TTL + 状态机）；`000044` `order_payments`。
- 模型层 `server/modules/shop/models/` 注册 `ShopCart` / `ShopCartItem` / `ShopInventoryReservation` / `ShopOrderPayment`，并扩展 `ShopOrder` / `ShopOrderItem` 的 000040 列。**金额一律整数「分」（BIGINT）**。

### 4.2 购物车（`storefront/services/cartService.ts`）
- 游客以不可枚举随机 token 标识（`X-Cart-Token` / httpOnly cookie），登录顾客自动归属 `customerId`；
- 加购按购物车币种快照单价（仅展示），明细行唯一（tenantId, cartId, skuId）。

### 4.3 结算报价（`quoteService.ts`）
- **服务端重算**：忽略前端总价；按站点配置币种（`siteContext` 注入的 `site.defaultCurrency`）取 `product_prices`；逐项校验可售 + 可用库存；
- 购物车币种与配置不一致返回 `CURRENCY_CHANGED`（409）；
- 运费 / 税费为占位规则（`config.checkout`，待 P3-T05/T06 接入真实 Provider）；返回 `version` + `expiresAt`。

### 4.4 建单 + 库存预占（`checkoutService.ts` + `reservationService.ts`）
- **幂等**：`idempotencyKey` 重复返回首单（unique 约束兜底）；
- **服务端重算**：先 `createQuote` 重算，绝不信任前端金额；
- **库存预占**：建单即 `occupy` 锁库存 + 写 `inventory_reservations`（TTL），支付失败 / 取消由补偿路径释放（`releaseExpiredReservations` 供 sweeper）；
- **快照**：商品标题 / 规格 / 单价（分）/ 地址 / 政策固化进订单，历史订单不受后台币种切换影响；返回 `accessToken`（防枚举）。

### 4.5 支付会话 + Webhook（`paymentService.ts`）
- 创建会话金额 / 币种取自订单快照；
- Webhook：原始 body HMAC-SHA256 验签 → `provider+providerRef` 去重 → 幂等更新；验签失败 / 重复投递均无副作用；回调币种与快照不一致以订单快照为准并告警。

### 4.6 验证
- `npm run typecheck` 通过；`vitest run` 全量 407 用例通过（新增 10 例：购物车 / 报价重算 / 币种切换 / 库存拦截 / 建单幂等 / 预占 / 支付 Webhook 验签·成功·去重·错签）。
- 提交一并纳入迁移 `000040` / `000042` / `000043` / `000044`（均已 apply 到 DB）。

---

## 第 5 步：订阅 + 到货通知（步骤 5 首个切片）

> 步骤 5 共 7 个独立域（评价 / Q&A / newsletter / restock-notify / RMA / CMS / 17track）。
> 按用户拍板，**先落地 newsletter 订阅 + restock 到货提醒**这一自包含后端切片；
> 其余域（评价/Q&A/RMA/CMS/17track）留作后续，避免一次性铺开造成范围蔓延。
> 全程复用 shop 模型与服务层（不建第二套后端），storefront 仅做薄编排层。

### 5.1 模型与迁移
- 迁移 `000051` `newsletters`（租户内 `email` 唯一；`token` 唯一用于退订链接；`status` ∈ subscribed/unsubscribed/pending）；
- 迁移 `000052` `restock_subscriptions`（租户内 `email+skuId` 唯一；`token` 唯一；`status` ∈ waiting/notified/cancelled）；
- 模型层 `server/modules/shop/models/` 注册 `ShopNewsletter` / `ShopRestockSubscription`（含 `createdAt/updatedAt`，复用 shop 模型层）。

### 5.2 订阅服务（`storefront/services/subscriptionService.ts`）
- `subscribeNewsletter`：租户内同邮箱幂等（已退订则重新订阅）；返回不可枚举 `token`；
- `unsubscribeNewsletter(token)`：凭令牌退订，无效/已退订返回 `404`（不暴露账号是否存在）；
- `subscribeRestock`：校验 SKU 存在（404 否则）；租户内同邮箱同 SKU 幂等；返回 `inStock` 即时库存态；
- `notifyRestock(skuId, tenantId)`：把关心的 `waiting` 订阅标记为 `notified` 并返回待发送邮件列表（去重）；
  **实际邮件发送由后续营销/邮件任务消费（P4-T09），本层只负责落库与触发收口**。

### 5.3 到货提醒触发（保持 shop → storefront 单向依赖）
- `inventoryService` 新增 `setRestockHook(fn)`；在 `adjust(delta>0)` **提交后**调用钩子；
- `subscriptionService` 模块加载时登记钩子：`adjust` 入库后自动触发 `notifyRestock`，把等待中的订阅标记为已通知；
- 钩子异常被 `try/catch` 隔离，通知失败不影响入库本身。
- 同时给 `inventoryService` 的 `adjust/occupy/release/deduct` 四个事务写入加**死锁重试**（MySQL 死锁为可重试瞬态，并行测试下偶发），事务回滚后重试安全。

### 5.4 公开路由（免 admin 鉴权，走 siteContext）
- `POST /api/storefront/v1/newsletter/subscribe`
- `POST /api/storefront/v1/newsletter/unsubscribe` 与 `GET /api/storefront/v1/newsletter/unsubscribe?token=`（邮件一键退订链接）
- `POST /api/storefront/v1/restock/subscribe`

### 5.5 验证
- `npm run typecheck` 通过；
- `vitest run` 全量 **414 用例通过**（新增 `storefront-subscription.test.ts` 7 例：邮件订阅/重复幂等/退订/重订/无效令牌 404、到货订阅/未知 SKU 404/库存补货触发钩子标记 notified + 去重）；
- 提交一并纳入迁移 `000051` / `000052`（已 apply 到 DB）。

---

## 第 5 步（第二切片）：评价 + 问答（步骤 5 第二个自包含域）

> 步骤 5 共 7 个独立域。继 newsletter + restock-notify 之后，本切片落地**商品评价 + 问答**；
> 其余域（RMA / CMS / 17track）留作后续。全程复用 shop 模型与服务层（不建第二套后端），storefront 仅做薄编排层。

### 5.6 模型与迁移
- 迁移 `000053` `shop_reviews`：`tenantId / spuId / skuId(可空) / customerId(可空) / orderId(可空) / rating(TINYINT 1-5) / title / content / images(JSON) / status(pending|approved|rejected) / verified / isAnonymous / helpfulCount / locale`；
- 迁移 `000054` `shop_product_qa`：`tenantId / spuId / skuId(可空) / customerId(可空) / question / answer(可空) / answeredBy / answeredAt / status(pending|answered|hidden) / locale`；
- 模型层 `server/modules/shop/models/` 注册 `ShopReview` / `ShopProductQA`（含 `createdAt/updatedAt`，复用 shop 模型层）。均已 apply 到 DB。

### 5.7 评价服务（`storefront/services/reviewService.ts`）
- `submitReview`：校验 SPU 存在（404）、SKU 归属该 SPU（404）、评分 1-5（service 兜底 400）；提交即 `pending`，登录顾客自动填 `customerId`；
- **已购验证**：仅当传入 `orderId` 且已登录时，以顾客 `email` 匹配 `orders.email` 且订单含该 `skuId`、状态为已支付及以上（`paid/fulfilled/shipped/done`）→ `verified=true`；（`ShopOrder` 无 `customerId` 列，故以 email 关联买家）；
- `listReviews`：仅 `approved` 可见，附评分汇总（平均 / 各星级分布 / 总数）；批量取顾客昵称供展示，匿名折叠为「匿名用户」；
- `markHelpful`：仅对公开评价自增 `helpfulCount`（不存在 / 未公开 404），防越权投票。

### 5.8 问答服务
- `submitQuestion`：校验 SPU/SKU 存在 → `pending`（回答由后台 / admin 填充，本步仅建表 + 公开读取 `answered`）；
- `listQuestions`：仅 `answered` 可见。

### 5.9 公开路由（免 admin 鉴权，走 siteContext）
- `GET /api/storefront/v1/reviews?spuId=&page=&pageSize=`
- `POST /api/storefront/v1/reviews`
- `POST /api/storefront/v1/reviews/:id/helpful`
- `GET /api/storefront/v1/qa?spuId=`
- `POST /api/storefront/v1/qa`

### 5.10 验证
- `npm run typecheck` 通过；
- `vitest run` 全量 **428 用例通过**（新增 `storefront-review.test.ts` 14 例：游客/登录提交、SPU 不存在 404、SKU 归属 404、评分越界 400、列表仅 approved + 汇总、pending 不计入、markHelpful 自增 / 越权 404、问答提交 / 列表仅 answered、已购验证 命中 / email 不符 / 未支付 三种场景）。
- 提交一并纳入迁移 `000053` / `000054`（已 apply 到 DB）。

### 第 5 步（三）：内容管理 CMS（博客 / 内容页）—— 薄层复用 shop 模型

- **迁移 `000055`**：`shop_articles`（tenantId / siteId / title / slug / summary / content / coverImage / status / authorName / tags(JSON) / publishedAt / sortOrder / 时间戳），唯一索引 `(tenantId, siteId, slug)`。
- **模型**：`server/modules/shop/models/ShopArticle.ts`（class extends Model + `declare`，与 ShopReview 同约定），`models/index.ts` 注册。
- **服务** `storefront/services/cmsService.ts`：
  - `listArticles(site, {page,pageSize,tag,keyword})`：仅 `status='published'`，按 `tenantId + siteId` 隔离，`publishedAt DESC, sortOrder DESC, id DESC`；`keyword` 走 `title LIKE`、`tag` 走参数化 `JSON_CONTAINS(tags, :tag)`（MySQL 语法，`Op.contains` 会被翻成 PG 的 `@>`，故禁用）。
  - `getArticleBySlug(site, slug)`：仅 published，未发布/不存在 → `404`。
  - `createArticle(site, input)`：供测试与未来 admin 写入；公开接口不暴露本方法（admin 路由属后续）。
- **公开路由**（免 admin 鉴权，走 siteContext）：`GET /cms/articles`、`GET /cms/articles/:slug`。
- **验证**：`storefront-cms.test.ts`（5 例：写入自动置 publishedAt、列表仅 published、草稿不可见、分页+排序、keyword/tag 过滤、slug 取详情、未发布/不存在 404、跨站点隔离）。
- 提交一并纳入迁移 `000055`（已 apply 到 DB）。

---

## 第 5 步（四）：退货 / 售后 RMA（薄层复用 shop 服务）

> 步骤 5 共 7 个独立域。继 newsletter+restock / 评价+问答 / CMS 之后，本切片落地**退货售后 RMA**；
> 仅剩 **17track 轨迹**待续。全程复用 shop 模型与服务层（不建第二套后端），storefront 仅做薄编排层。
> RMA 为敏感链路（涉及退款），故**强制顾客登录**（customerAuth），并以订单归属 + 可退状态双重校验。

### 5.11 模型与迁移
- 迁移 `000056` `shop_rma_requests`：`tenantId / siteId / orderId / customerId(可空) / email / status(pending|approved|rejected|returned|refunded|cancelled) / reason / items(JSON 明细) / refundAmountCents(BIGINT) / refundCurrency / trackingNo / rejectReason / 时间戳`；索引 `(tenantId,customerId)`、`(tenantId,orderId)`。
- 模型层 `server/modules/shop/models/` 注册 `ShopRmaRequest`（class 写法 + `declare`，与 ShopArticle 同约定），`models/index.ts` 注册。已 apply 到 DB。

### 5.12 退货服务（`storefront/services/rmaService.ts`）
- `submitRma`：校验订单存在（404）、**订单邮箱 == 登录顾客邮箱**（403 防越权）、订单状态 ∈ `fulfilled/shipped/done`（否则 400 不可退）；
  逐项校验退货明细归属该订单且数量 ≤ 已购（否则 400）；**退款金额按订单快照单价(分) × 退货数服务端重算**（绝不信前端传入）；
- `listMyRmas` / `getMyRma`：仅本人可见，非本人 `getMyRma → 404`；
- `cancelRma`：仅 `pending` 可取消（否则 400）；
- `submitReturnTracking`：仅 `approved`（审核通过）可回寄，状态置 `returned` 并记录物流单号（否则 400）；`rejected/refunded` 由 admin 侧填写，本切片不实现。

### 5.13 公开路由（需 customerAuth，走 siteContext）
- `POST /api/storefront/v1/rma` —— 提交退货申请
- `GET  /api/storefront/v1/rma` —— 我的退货申请列表
- `GET  /api/storefront/v1/rma/:id` —— 申请详情（非本人 404）
- `POST /api/storefront/v1/rma/:id/cancel` —— 取消（仅 pending）
- `POST /api/storefront/v1/rma/:id/track` —— 回寄物流单号（仅 approved）

### 5.14 验证
- `npm run typecheck` 通过（顺带修复上一刀 CMS 切片 `cmsService.ts` 中 `where[Op.and]` 以 `unique symbol` 索引 `Record<string,unknown>` 的严格类型报错）；
- `vitest run` 全量 **442 用例通过**（新增 `storefront-rma.test.ts` 9 例：提交退货+pending+退款重算、订单不存在 404、email 不符 403、状态不可退 400、明细不归属 400、超量 400、列表/详情+非本人 404、取消仅 pending、回寄仅 approved）；
- 提交一并纳入迁移 `000056`（已 apply 到 DB）。

---

## 第 5 步（五 · 收官）：物流轨迹 17track（薄层复用 shop 服务）

> 步骤 5 最后一个域。复用 shop 的 `orders` + `order_shipments`（已有 carrier/trackingNo），
> **仅新增轨迹缓存表**，不建第二套订单数据。外部 17track 用**可插拔 provider 钩子**，
> 默认无外网依赖，异常自动降级本地缓存（与 `inventoryService.setRestockHook` 同款单向依赖思路）。

### 5.15 模型与迁移
- 迁移 `000057` `shop_tracking_events`：`tenantId / siteId / orderId / shipmentId / carrier / trackingNo / status / events(JSON 轨迹数组) / provider / syncedAt / 时间戳`；唯一索引 `(tenantId, shipmentId)`、索引 `(tenantId, orderId)`。
- 模型层注册 `ShopTrackingEvent`（class + `declare`），`models/index.ts` 注册。已 apply 到 DB。

### 5.16 轨迹服务（`storefront/services/trackingService.ts`）
- `getOrderTracking(site, orderNo, accessToken)`：**orderNo + accessToken 双要素 + tenantId 隔离**，任一不符一律 404（防订单枚举，对齐 P4-T04 / P3-T16）；无物流单返回空轨迹视图 `not_shipped`（不泄漏发货态之外信息）；
- `setTrackingProvider(fn)`：注入真实 17track 客户端；仅当缓存缺失或 `syncedAt` 超过 10 分钟时拉取并刷新缓存，拉取异常 `try/catch` 降级到本地缓存，外部 API 故障不打挂 C 端；
- `upsertTrackingCache`：供后台发货/测试写入轨迹缓存，同 `(tenantId, shipmentId)` 幂等 upsert（公开接口不暴露）。

### 5.17 公开路由（免 admin 鉴权，走 siteContext）
- `GET /api/storefront/v1/track/:orderNo?accessToken=` —— 订单号 + 访问凭证双要素查询轨迹

### 5.18 验证
- `npm run typecheck` 通过；`vitest run` 全量 **448 用例通过**（新增 `storefront-tracking.test.ts` 6 例：双要素防枚举/空凭证 404、跨租户隔离、缓存写入+幂等、provider 过期拉取刷新、未过期不重复拉取、provider 异常降级、无缓存拉取成功落库）；
- 提交一并纳入迁移 `000057`（已 apply 到 DB）。

---

## 第 6 步：服务端 CAPI 埋点 + 订单来源（site / utm）

> 对齐 `docs/ANALYTICS_EVENTS.md`（GA4 九事件 + 服务端侧 refund）与设计文档 §4.12 / §5。
> 全程复用 shop 模型层，storefront 仅做薄编排；服务端事件落库供后台抽样对账（G4）。

### 6.1 模型与迁移
- 迁移 `000058`：
  - `orders` 增补归因列 `sourceSiteId / utmSource / utmMedium / utmCampaign / utmTerm / utmContent / landingPage / referrer`（全部可空，存量订单不受影响）+ 索引 `(tenantId, utmSource, utmCampaign)`；
  - 新建 `shop_analytics_events`：`tenantId / siteId / eventId / eventName / consentAnalytics / customerId / sessionId / orderId / transactionId / currency / valueCents(BIGINT) / params(JSON) / dispatchStatus / dispatchedAt / 时间戳`；唯一索引 `(tenantId, eventId)` 幂等、索引 `(tenantId, siteId, eventName, createdAt)` 供报表。
- 模型层注册 `ShopAnalyticsEvent`（class + `declare`）；扩展 `ShopOrder` 归因列。`models/index.ts` 注册。已 apply 到 DB。

### 6.2 埋点服务（`storefront/services/analyticsService.ts`）
- **事件白名单**：GA4 九事件 + 服务端侧 `refund`；未知事件 / 空 eventId → 400。
- **幂等**：`(tenantId, eventId)` 唯一，重复上报只落一行、不重复派发；并发撞唯一约束按已受理处理。
- **同意门控（P4-T11）**：`consent.analytics !== true` → 仅落库 `skipped_no_consent`，**绝不外发**；同意撤回后新事件同样不外发。
- **服务端事实**：`purchase` / `refund` 金额与币种一律取**订单快照**（忽略前端伪造 value/currency），且校验订单确为已支付 / 退款态，否则 400（防伪造转化）。浏览类事件前端 GA4 已发，服务端只落库 `local_only`，不重复外发。
- **可插拔 CAPI provider**：`setCapiProvider(fn)` 注入 Meta / Google sender；默认 null（仅落库，测试零外网依赖）；派发成功 `sent`、异常隔离为 `failed`，绝不把第三方故障抛给 C 端。
- `countEvents(site, eventName)` 供后台抽样对账。

### 6.3 订单来源接线
- `createOrderSchema` 新增可选 `attribution`（UTM 五参数 + landingPage + referrer）；
- `checkoutController` 透传 → `checkoutService.createOrder` 随订单固化 `sourceSiteId = site.shopId` 与 UTM 字段；未传则来源列为 null（游客 / 存量下单不受影响）。

### 6.4 公开路由（免 admin 鉴权，走 siteContext）
- `POST /api/storefront/v1/track-event` —— 上报埋点事件

### 6.5 验证
- `npm run typecheck` 通过（同款 `Op.or` 为 `unique symbol`，用 `Record<string | symbol, unknown>` 索引签名处理）；
- `vitest run` 全量 **462 用例通过**（新增 `storefront-analytics.test.ts` 14 例：白名单 400 / eventId 幂等不重复派发 / 空 eventId 400、同意门控不外发、已同意 sent 且金额币种取订单快照、provider 异常 failed 隔离、无 provider local_only、purchase 未支付 400 / 缺 transaction_id 400、refund 需退款态、浏览类 local_only、跨租户隔离、建单归因落库 + 未传为 null）；
- 提交一并纳入迁移 `000058`（已 apply 到 DB）。

---

## 第 7 步：Nuxt 3 独立站前端（`shops/`）—— 核查结论

> 该目录由**并行方**按 `shops/mds/storefront-execution-plan_v1.0.md` 交付，
> 按贯穿全程的边界约定：本会话后端主线只提交 `server/` 与本文档，**不纳入 `shops/` 提交树、不越界改动**。

- 工程已建成：Nuxt 3 + TS + Tailwind，`nuxt.config.ts` / `app.vue` / `layouts` / `pages`
  （首页 / 集合 / 详情 / 搜索 / 购物车 / 结算 / 结果 / 政策 / 博客 / 订阅退订）/ `components` / `composables`
  / `shared`（currency / analytics / schemas / i18n / mock）/ `server`（BFF 代理、store-config、sitemap、robots）/ `tests`。
- 埋点侧已具备：`shared/analytics/{consent,events,ecommerce}.ts` + `plugins/analytics.client.ts` + `ConsentBanner`，
  GA4 九事件字典与 Cookie 同意门控（P4-T10 / P4-T11）已落地。
- 本会话核查验证：`npm --prefix shops run typecheck`（nuxi）通过；`npm --prefix shops test` **12/12 通过**
  （另有 2 条 `EPERM` 为沙箱临时目录写入权限告警，非业务失败）。
- 交接边界：本次新增的 3 个后端接口（`GET /track/:orderNo`、`POST /track-event`、建单 `attribution`）
  尚未在前端 BFF 接线，属并行方步骤 7 后续工作量（其执行计划 P4-T04 物流跟踪、P4-T10 CAPI 仍登记待办）。
  后端契约已就绪并有测试覆盖，前端只需按 `shops/shared/api/client.ts` 现有范式转发即可。

---

## 通用验收标准（沿用 §6）

- 后端：`npm --prefix server run typecheck && npm --prefix server run test`
- 前端（步骤 7，并行方）：`npm --prefix shops run typecheck && npm --prefix shops test`；本会话仅核查不改动。
- 提交前缀：`feat(storefront):` / `test(storefront):` / `docs(storefront):`。
- GitHub push 走本机代理 `https_proxy=http://127.0.0.1:7892`，直连会 `schannel: server closed abruptly`。
