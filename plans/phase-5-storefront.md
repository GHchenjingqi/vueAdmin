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
| 5 | 评价 / Q&A / newsletter / restock-notify / RMA / CMS / 17track | 🟡 进行中（newsletter + restock-notify 已完成，其余域待续） |
| 6 | 服务端 CAPI 埋点、订单来源字段（site / utm） | 后续 |
| 7 | Nuxt 3 独立站前端工程（另起目录，不在本仓库 admin 内） | 后续 |

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

## 通用验收标准（沿用 §6）

- 后端：`npm --prefix server run typecheck && npm --prefix server run test`
- 前端本轮不改动（独立站前端未建），无需跑前端验证。
- 提交前缀：`feat(storefront):` / `test(storefront):` / `docs(storefront):`。
- GitHub push 走本机代理 `https_proxy=http://127.0.0.1:7892`，直连会 `schannel: server closed abruptly`。
