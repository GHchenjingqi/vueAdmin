# 独立站优化实施计划

> 依据：`research/storefront-ops-audit_final.md`（19 项缺口，6 批）
> 规则：每项完成后在 `[ ]` 改为 `[x]`，并在末尾「完成记录」追加验证证据。
> 分支：`master_shop`　工作区：`D:/codes/web`

## 状态图例

- `[ ]` 未开始
- `[~]` 进行中
- `[x]` 已完成（含验证）
- `[-]` 本轮不做（需外部条件或业务确认）

---

## 第 1 批 · 结账链路与数据真实性（最高优先）

> 目标：让券、税、运费真正生效；杜绝生产环境跑在 mock 数据上。

- `[x]` **1.1 BFF 报价补全转发字段**
  - `shops/server/utils/commerce.ts` 新增 `buildQuoteForwardBody`（唯一构造点）
  - 转发 `shippingAddress`、`shippingRateId`、`couponCode`、`customerId`、`pointsToRedeem` + `cartToken`
  - 删除「真实契约仅需 cartToken」的错误注释，改为说明依赖关系
  - 验收：`bff-forward-contract.spec.ts` 断言前端字段全部在转发体中

- `[x]` **1.2 BFF 下单补全转发字段**
  - 新增 `buildOrderForwardBody`，追加 `couponCode`、`pointsToRedeem`、`shippingRateId`
  - 幂等键兜底逻辑移到 API 层计算后传入，行为不变
  - 验收：同上测试 + 既有 24 条结算单测无回归

- `[x]` **1.3 报价返回真实运费档位**
  - `shippingService` 新增 `ShippingOption` / `options` 校验 / `listShippingOptions` / `listShippableCountries`
  - `resolveShipping` 接受 `shippingRateId`，语义为「分区基础运费 + 档位加价」
  - `quoteService` 出参新增 `shippingOptions`、`shippingOptionId`、`shippableCountries`
  - `commerce.ts` 的 `adaptQuote` 透传真实档位（不再返回 `[]`）
  - 结算页：移除写死的 `'std'`，改为消费服务端档位；国家改下拉且与后台配置同源；国家变更触发重算
  - 验收：`storefront-shipping-options.test.ts` 7/7；旧配置（无 options）仍通过校验

- `[x]` **1.4 生产环境强制真实数据源**
  - `getCommerceSource()`：`NODE_ENV=production` 恒返回 `real`，配 mock/auto 时只告警一次
  - 验收：typecheck 通过；逻辑分支可读性确认

- `[x]` **1.5 降级可见化**
  - `[...mock].ts` 新增 `mockFallback` 统一出口，回退时打 `x-data-source: mock`
  - `catalog/[...path].ts` 两处 mock 出口同样打标
  - `shops/.env.example` 的 `NUXT_COMMERCE_SOURCE` 由 `mock` 改为 `auto`，并注明生产被强制覆盖
  - 验收：mock 分支代码路径统一

- `[x]` **1.6 BFF 契约测试**
  - `shops/tests/unit/bff-forward-contract.spec.ts` 6 例
  - 变异验证：删掉 `couponCode`/`pointsToRedeem`/`shippingRateId` 后测试失败（`order 转发体缺少字段 shippingRateId`），恢复后 6/6 通过
  - 验收：测试确实能捕获漏字段

---

## 第 2 批 · 发现层（搜索 / 排序 / 展示 / SEO）

> 目标：把后端已有能力接到前台。

- `[x]` **2.1 搜索透传 keyword**
  - `useCatalog.listProducts` 参数增加 `keyword`，拼入 query
  - `search.vue` 改为服务端检索 + 服务端分页，移除客户端 filter；结果数改用后端 `total`；补分页导航
  - 验收：搜索走 SQL 过滤（后端 `expandTerm` 同义词展开），不再只搜前 24 条

- `[x]` **2.2 后端支持排序**
  - `catalogService` 新增 `normalizeSort` 白名单，`price-asc` / `price-desc` 在**分页前**排序（否则跨页错乱）
  - 价格排序取全量最低价；无报价商品排最后
  - `storefrontProductQuerySchema` 增加 `sort`（宽松字符串，非法值由 service 回退 newest，不返回 400）
  - 验收：类目页三个排序按钮生效

- `[x]` **2.3 商品详情多图**
  - PDP 新增 `gallery`（cover 优先 + images 去重）与缩略图切换
  - 验收：多图商品可点击缩略图切换主图

- `[x]` **2.4 评分进商品卡与结构化数据**
  - 后端列表接口按 `spuId` 分组聚合 `ratingAvg` / `reviewCount`（仅 approved）
  - 详情接口单 SPU 聚合，返回同名字段
  - BFF 透传；`ProductCard` 显示星级与评价数；`JsonLd` 输出 `aggregateRating`（无评价不输出，避免结构化数据造假）
  - 验收：`category-slug.test.ts` 之外，评分口径由既有 review 单测覆盖

- `[x]` **2.5 类目 slug 落库与回填**
  - 迁移 `20261113_000001`：`categories` 增 `slug` 列 + 回填 + `(tenantId, slug)` 唯一索引
  - 迁移 `20261113_000002`：补回迁移后新建类目的空 slug
  - `categorySlugService`：`toKebabCase` / `pickDisplayName` / `generateUniqueCategorySlug`
  - `createCategory` 自动生成 slug；`updateCategory` 仅在 slug 为空时补（改名不漂移 URL）
  - 后端类目树/商品列表/详情输出真实 slug；BFF 不再拼 `c-<id>`
  - 类目页：旧 `c-<id>` 链接 301 到语义 slug；H1 用后台类目名
  - 验收：库中 4992 条类目 **0 条空 slug、0 组非空重复**

- `[x]` **2.6 sitemap 全量 + lastmod**
  - 先取第一页拿 `total`，再按页遍历；输出 `<lastmod>`（商品 `updatedAt`）；XML 转义；45000 条上限保护
  - 验收：商品数 > 60 时条目数等于商品总数

---

## 第 3 批 · 营销与归因

- `[x]` **3.1 促销接入报价**
  - 新增 `storefront/services/promotionService.ts`：`evaluatePromotion` / `explainInactivePromotions` / `isSkuInScope`
  - `quoteService` 促销先于券/会员/积分计算，`subtotalAfterPromotion` 作为后续折扣基数（避免对已让利金额重复打折）
  - 出参新增 `promotion` / `promotionDiscountCents`
  - **保守取舍**：只消费后台界面能写入的 `type='discount'` + `rule.rate`（0..1 开区间）；`scope` 非 `all` 因后台表单无绑定目标字段而跳过；多活动命中取折扣最深的一个，不叠加（叠加顺序未由业务确认）
  - 验收：`promotion-eval.test.ts` 5/5；`rate=0`/`rate>=1`/负数/非数字一律忽略

- `[x]` **3.2 utm 报表维度**
  - `salesReport` 增加 `case 'utm'`，键为 `utmSource::utmCampaign`，无 utm 归入 `direct`
  - `analyticsQuerySchema` 与 `analyticsController` 白名单同步扩容
  - 后台看板：`AnalyticsDashboard.vue` 维度下拉增加「按广告来源」，分组键可读化
    （`utm:google::black_friday` → 「google / black_friday」，无 utm → 「直接访问」）
  - 验收：真实库验证 —— `utm:google::black_friday` 精确聚合 190 单 / 18810 USD，
    无 utm 订单归入 `utm:direct::(none)`，各分组 orderCount 之和等于订单总数

- `[x]` **3.3 成本字段与申报价值分离**
  - `ShopSku` 增 `costAmount`；迁移 `20261113_000003` 已落库
  - `profitReport` 改读 `costAmount`；**不用 declaredValue 兜底**（报关价 ≠ 采购成本）
  - 出参新增 `costBasis.missingCostSkuCount` + `missingCostSkuIds`（最多 20 个）
  - 验收：typecheck 通过；缺失成本时毛利不再被报关价污染

- `[x]` **3.4 SKU 重量与尺寸**
  - `ShopSku` 增 `weightGram` / `lengthMm` / `widthMm` / `heightMm`；迁移已落库（实测 5 字段均为 `int(10) unsigned`）
  - `createSkuSchema` / `updateSkuSchema` 补校验（整数、非负、上限保护）
  - 后台 `SkuManager.vue` 表单补成本/重量/三边输入项 + 中英 i18n
  - 验收：admin `vue-tsc --noEmit` 0 错

---

## 第 4 批 · 履约与复购

- `[x]` **4.1 批量发货**
  - `orderService.batchShip`：逐单复用 `ship`（每单独立事务），单条失败不阻断其余
  - 同一请求内重复订单号先去重；缺承运商的行明确失败（不猜）；上限 100 条
  - 新增 `POST /shop/orders/batch-ship`，**注册在 `/orders/:id/*` 之前**（否则 `batch-ship` 会被当成 `:id` 命中 `idParamSchema` 返回 400）
  - 审计只记汇总与失败单号（不把 100 条运单号写进日志表）
  - 后台 `OrderList.vue` 新增「批量发货」按钮 + 粘贴式弹窗（每行「订单ID 运单号」，支持默认承运商）+ 逐单结果表
  - 验收：`order-batch-ship.test.ts` 6/6（真实 MySQL，租户 987780）

- `[x]` **4.2 RMA 与退款打通**
  - `approveRmaWithRefund`：pending/approved/returned 可一步「批准 + 退款」，支持部分金额
  - **先校验金额 → 再批准 → 后退款**：避免「金额非法但状态已改成 approved」的中间态（测试捕获并修正）
  - 复用 `refundService.createRefund` 的 `rmaId` 通道，由它同事务校验审批额度并驱动终态，不在两处各改状态
  - 幂等键 `rma:<id>`；退款成功后回写实际退款额（refundService 只驱动状态，不回写金额）
  - `approveRmaAsExchange`：pending → exchange，不触发退款、不覆盖顾客填的 reason（备注寄存 `rejectReason`）
  - 路由 `POST /shop/rmas/:id/refund` 与 `/exchange`；`RmaAdmin.vue` 加「批准退款」弹窗与「转为换货」按钮
  - 验收：`rma-refund-action.test.ts` 8/8（真实 MySQL，租户 987790）；既有 RMA/退款 45 例无回归

- `[x]` **4.3 到货订阅入口**
  - 新增 BFF `shops/server/api/restock/subscribe.post.ts`（含邮箱/skuId 本地校验，非法直接 400，不打后端）
  - PDP 在 `!inStock` 时显示邮箱订阅表单，提交后显示已记录态；失败可见（不静默）
  - 中英 i18n 各 7 条
  - 验收：`nuxi typecheck` 0 错；BFF 路由与后端 `POST /restock/subscribe` 契约一致

- `[x]` **4.4 营销邮件 CTA 与退订**
  - 新增 `mailFooterService`：`productUrl` / `cartUrl` / `buildUnsubscribeUrl` / `withCallToAction` / `resolveUnsubscribeToken`
  - 弃购召回追加「Resume your cart」CTA；降价提醒追加商品深链 CTA；两者均带退订链接
  - 未订阅过的收件人补建 newsletter 记录以拿 token（退订入口不能因「没订阅过」缺失）
  - 无 token 时不伪造退订链接
  - 验收：`mail-footer.test.ts` 6/6；弃购/降价/outbox 30 例无回归

---

## 第 5 批 · 合规与治理

- `[x]` **5.1 政策页 CMS 化**
  - `policies/[slug].vue` 改为优先读 `cms/articles/:slug`（后台「文章管理」维护），取不到才回退内置文案
  - 政策页属合规页面，后台无内容时**不回退 404**，避免部署后政策页整体失效
  - 正文按空行分段渲染，纯文本（不收富文本，压缩 XSS 面）；显示更新日期
  - 验收：`nuxi typecheck` 0 错

- `[x]` **5.2 顾客会话升级 httpOnly Cookie**
  - 登录/注册下发 `customer_token`（httpOnly + SameSite=Lax + 生产 Secure + 30 天）
  - 中间件 `extractToken` 优先 Cookie、其次 Bearer —— 旧前端无需同步改造
  - BFF 的 `auth` 直通分支补 `set-cookie` 透传（否则 Cookie 只到 BFF 就断）
  - 前端 `saveSession` 不再持久化 token，仅存展示用顾客信息；新增 `isAuthenticated()`
    （Cookie 模式下 `getToken()` 恒为 null，不能再用它判断登录态）
  - 12 处登录态判断与 authorization 头改为条件附带；`listOrders` 补 `credentials: 'same-origin'`
  - 验收：`customer-session-and-site-name.test.ts` 覆盖 Cookie 优先于 Bearer、无凭据 401、游客放行

- `[x]` **5.3 账号注销与数据导出**
  - `DELETE /auth/me`：需密码二次确认（会话被劫持时不能仅凭 JWT 毁号）
  - 注销 = **匿名化 + 停用**（`status='deleted'`、邮箱换 `@deleted.invalid`、密码随机化、昵称清空）
  - 保留订单/退款/积分流水（财务凭证），删除地址/收藏/购物车/浏览历史，评价解除关联
  - `GET /auth/me/export`：导出本人结构化 JSON（`private, no-store` + 附件下载）
  - 中间件对 `deleted` 状态直接 401，注销后旧令牌立即失效
  - 前端账户页新增「数据与隐私」区块（导出 + 注销弹窗）
  - 验收：`customer-data-rights.test.ts` 6/6（真实 MySQL，租户 987795）

- `[x]` **5.4 品牌名配置化**
  - `store-config` 新增 `siteName`，来源 `settings.site_title` → `SITE_NAME` → 'Aurora Hair Studio'
  - 新增 `plugins/site-head.ts` 动态设置 `titleTemplate`（移除 `nuxt.config.ts` 的硬编码）
  - `useSeo` 的 `og:site_name` 与首页 Organization/WebSite 结构化数据改用下发值
  - 验收：`customer-session-and-site-name.test.ts` 覆盖设置值、JSON 引号包裹、env 回退、内置默认

---

## 第 6 批 · 支付本地化

- `[x]` **6.1 接入 Stripe（card / Apple Pay / Google Pay）**
  - 新增网关适配器 `payments/gateways/stripe.ts`：Checkout Session 建单（redirect 语义与现有收银台契约一致）+ Webhook 验签 + 退款 + 主动查单
  - 验签用 Stripe 的 `t=,v1=` HMAC-SHA256 方案，含 300 秒时间戳窗口防重放；用 `timingSafeEqual` 避免时序侧信道
  - 建会话带 `Idempotency-Key=providerRef`、退款带 `Idempotency-Key=refundNo`，网络重试不重复建单/重复退款
  - 注册到 `gatewayRegistry` / `providerRegistry` / `channelConfig` 三张表；`credentialFields` 增加 5 个凭据字段
  - 缺 `SECRET_KEY` 时 `assertConfigured` 直接 503，**不降级为 mock**（与既有网关一致）
  - 验收：`stripe-gateway.test.ts` 8/8（覆盖篡改 body、错误密钥、超窗重放、畸形头）
  - **需运维补齐**：Stripe 开户后，在后台「支付凭据」填 SECRET_KEY / WEBHOOK_SECRET / 回跳地址，并在 Stripe 后台把 Webhook 指向 `/api/storefront/v1/payments/webhooks/stripe`

---

## 业务待确认项（阻塞对应批次）

| # | 事项 | 阻塞 |
| --- | --- | --- |
| 1 | 运费按国家分区固定价，还是按重量阶梯 | 3.4、1.3 |
| 2 | 美国销售税商家代收代缴 vs DDU 买家承担 | 1.3 |
| 3 | 采购成本由谁维护、更新频率 | 3.3 |
| 4 | 促销 / 券 / 会员 / 积分叠加顺序 | 3.1 |

---

## 完成记录

> 每批完成后追加：日期、改动文件、验证命令与结果。

### 第 3.2 补完 · 2026-11-13

补上 3.2 遗留的前端部分（后端接口此前已就绪）：

| 文件 | 改动 |
| --- | --- |
| `src/api/shop.ts` | `AnalyticsDimension` 增加 `utm` |
| `src/views/shop/analytics/AnalyticsDashboard.vue` | 维度下拉加「按广告来源」；新增 `formatDimensionKey` 做展示层可读化 |
| `src/i18n/{zh-CN,en-US}.json` | 各 2 键（`dimUtm` / `utmDirect`） |

验证：admin `vue-tsc` 0 错、`eslint` 0 错、`vitest run src` 39 文件 / 629 用例全绿；
真实库核对 `dimension=utm` 分组与订单数一致。

### 第 4 批（进行中）· 2026-11-13

**已完成**

| 项 | 改动文件 |
| --- | --- |
| 4.1 批量发货 | `server/modules/shop/services/orderService.ts`（`batchShip`）、`controllers/orderController.ts`、`routes/index.ts`（注册在 `/orders/:id/*` 之前）、`shared/schemas/shop.ts`（`batchShipSchema`）、`src/api/shop.ts`（`batchShip` + 类型）、`src/views/shop/order/OrderList.vue`（工具条按钮 + 粘贴弹窗 + 结果表）、`src/i18n/*.json`（各 8 键）、`server/__tests__/order-batch-ship.test.ts` |
| 4.3 到货订阅 | `shops/server/api/restock/subscribe.post.ts`（新增）、`shops/pages/products/[slug].vue`（缺货表单）、`shops/shared/i18n/messages.ts`（中英各 7 条） |

**验证**

| 命令 | 结果 |
| --- | --- |
| `npx vue-tsc --noEmit`（admin） | 0 错 |
| `npx nuxi typecheck`（shops） | 0 错 |
| `npm --prefix server run typecheck` | 0 错 |
| `npx eslint src/views/shop/order/OrderList.vue src/api/shop.ts` | 0 错 |
| `npx vitest run`（shops 全量） | 11 文件 / 61 用例全绿 |
| `order-batch-ship.test.ts` | 6/6（真实 MySQL，租户 987780） |
| 其余新增测试 3 文件 | 20/20 |

**4.1 关键实现细节**

- `batchShip` **不做「一个大事务包住所有单」**：逐单复用 `ship`，每单仍是独立事务。理由是跨境订单常有部分地址异常，整批回滚会让已正确处理的单白做；且长事务会占用连接。
- 路由顺序有硬约束：`/orders/batch-ship` 必须写在 `/orders/:id/pay` 之前，否则 Express 把 `batch-ship` 当 `:id`，`idParamSchema` 直接返回 400。已在代码注释中标注。
- 缺承运商的行**明确失败**，不用店铺名兜底 —— 否则运单轨迹查不到，问题会延后到客服环节才暴露。
- 审计只记汇总与失败单号（最多 50 个），避免把 100 条运单号写进日志表。

**过程中修正的两个自伤问题**

- 一次“删空行”的编辑把注释与下一行函数声明连成一行，导致 `OrderList.vue` 语法错误；另一次同类操作删掉了 `const wishlist = useWishlist()`。两处均已修复并复验。

**第 4 批全部完成（4.1 / 4.2 / 4.3 / 4.4）**

**全量回归结果（三侧）**

| 命令 | 结果 |
| --- | --- |
| `npx vue-tsc --noEmit`（admin） | 0 错 |
| `npx nuxi typecheck`（shops） | 0 错 |
| `npm --prefix server run typecheck` | 0 错 |
| `npx vitest run src`（admin） | 39 文件 / 629 用例全绿 |
| `npx vitest run`（shops） | 11 文件 / 61 用例全绿 |
| `npx vitest run server` | 140 文件 / **1208 用例全绿** |

**全量回归暴露的 3 类真实问题（均已修复）**

1. **促销实现"过于成功"导致既有金额断言失败**：共享测试库里有 8 折全站活动（2026-11-01~11-30），
   报价被正确打折后，多个文件按原价断言的用例失败（如 12990 → 10392）。
   这不是 bug 而是行为变更，但暴露了测试对共享库状态的隐式依赖。
   解法：给 `promotionService` 加 `setPromotionEvaluator` 注入点（与 `taxService.setTaxProvider` 同款惯例），
   在 7 个受影响测试文件的 `beforeAll` 中显式置为"无促销"。生产不设置时行为不变。
2. **新增模型依赖打破 mock**：`searchRanking` / `recommendationService` / `wishlistService` 的
   `vi.mock('models/index.js')` 未含新增的 `ShopReview` / `ShopCategory` / `ShopNewsletter`，运行时抛
   "No export defined"。已补齐 mock（空集合即可）。
3. **`updatedAt` 假设过强**：列表映射直接 `(spu.updatedAt as Date).toISOString()`，
   遇到 mock 或缺失值即崩。已改为空值回退 epoch。

**两处测试期望的更新（属预期内的口径变更）**

- `storefront.test.ts`：列表 DTO 新增 `category` / `ratingAvg` / `reviewCount` / `updatedAt`，
  这些均为 C 端公开数据，更新字段集合并保留"不泄漏 hsCode 等内部字段"的原断言。
- `analytics-rate-snapshot-n1.test.ts`：成本夹具从 `declaredValue` 改为 `costAmount`，
  正是 PLAN 3.3 要验证的口径分离（若仍读 declaredValue 则该测试应失败）。

4.2 过程中由测试发现并修正一个真实顺序缺陷：原先「先批准再校验金额」，
非法金额被拒时 RMA 已被改成 approved，留下无退款却已批准的中间态；已改为先校验再批准。

4.4 需为 `wishlistService.test.ts` 的模型 mock 补 `ShopNewsletter` 与 `hoist.newsletter`，
因为退订 token 解析新增了 newsletter 依赖。

### 第 6 批 · 2026-11-13

**改动文件**

| 文件 | 改动 |
| --- | --- |
| `server/modules/storefront/payments/gateways/stripe.ts` | 新增：Checkout Session / Webhook 验签 / 退款 / 查单 |
| `server/modules/storefront/payments/credentialFields.ts` | 增加 stripe 的 5 个凭据字段 |
| `server/modules/storefront/payments/gatewayRegistry.ts` | 注册 `stripeGateway` |
| `server/modules/storefront/payments/providerRegistry.ts` | 增加 stripe 通道（卡组织，5 币种） |
| `server/modules/storefront/payments/channelConfig.ts` | `CHANNEL_IDS` 加入 stripe |
| `server/__tests__/stripe-gateway.test.ts` | 新增 8 例验签测试 |
| 2 个既有测试 | 通道清单与"非法 id"用例适配新通道 |

**验证**

| 命令 | 结果 |
| --- | --- |
| `npm --prefix server run typecheck` | 0 错 |
| `npx vitest run server` | 143 文件 / **1247 用例全绿** |
| `npx vitest run src`（admin） | 39 文件 / 629 用例全绿 |
| `npx vitest run`（shops） | 11 文件 / 61 用例全绿 |

**为什么用 Checkout Session 而不是 Elements**

现有契约是「服务端建会话 → 前端按 `action` 拉起收银台」，Checkout Session 的 redirect
与 `GatewaySession.action='redirect'` 天然对齐；Elements 需要 C 端引入 Stripe.js
并额外实现确认流程，改造面大得多。Checkout 同时覆盖 card / Apple Pay / Google Pay，
无需分别接入。

**并行偶发失败**

`order-mail-scanner` 的跨租户用例在全量并发下偶发失败（依赖跨租户扫描时序，
与 dev 库共享状态争用有关），单独复跑 5/5 通过；同 `shopPhases` 销售报表用例的既有现象一致。

### 第 5 批 · 2026-11-13

**改动文件**

| 文件 | 改动 |
| --- | --- |
| `server/modules/storefront/controllers/storeConfigController.ts` | 下发 `siteName`（settings.site_title → SITE_NAME → 默认） |
| `server/modules/storefront/services/customerDataService.ts` | 新增：注销匿名化 + 数据导出 |
| `server/modules/storefront/services/customerService*.ts` | 新增 `verifyCustomerPassword`（注销二次确认，无登录副作用） |
| `server/modules/storefront/controllers/authController.ts` | Cookie 下发/清除；`deleteAccount`、`exportMyData` |
| `server/modules/storefront/middleware/customerAuth.ts` | `extractToken`（Cookie 优先）；`deleted` 状态拒绝 |
| `server/modules/storefront/routes/auth.ts` | `GET /me/export`、`DELETE /me` |
| `server/modules/shop/models/ShopCustomer.ts` | `CustomerStatus` 增加 `deleted` |
| `shops/pages/policies/[slug].vue` | 改为读 CMS，回退内置文案 |
| `shops/pages/account/index.vue` | 数据与隐私区块（导出 / 注销弹窗） |
| `shops/shared/customer/auth.ts` | 不再持久化 token；新增 `isAuthenticated()` |
| `shops/plugins/site-head.ts` | 新增：动态 titleTemplate |
| `shops/composables/useSeo.ts` | `og:site_name` 取下发值 |
| `shops/pages/index.vue` | Organization/WebSite 用下发站点名 |
| `shops/server/api/[...mock].ts` | auth 直通分支透传 `set-cookie` |
| 7 个 account 页 + `useCheckout` | 登录态判断与 authorization 头适配 Cookie 模式 |
| `server/__tests__/customer-data-rights.test.ts` | 新增 6 例 |
| `server/__tests__/customer-session-and-site-name.test.ts` | 新增 7 例 |

**验证**

| 命令 | 结果 |
| --- | --- |
| `npx vue-tsc --noEmit`（admin） | 0 错 |
| `npx nuxi typecheck`（shops） | 0 错 |
| `npm --prefix server run typecheck` | 0 错 |
| `npx vitest run server` | 142 文件 / **1239 用例全绿** |
| 新增测试 | 13/13 |

**关键取舍**

- **注销不物理删除**：订单/退款/积分流水是财务凭证，多地法规要求保留；物理删除会造成账实不符。
  采用「匿名化 + 停用」，既让账号无法再被识别到自然人，也保住账务链。
- **Cookie 与 Bearer 并存**：不强制前端一次性切换，避免登录态回归面过大；
  Cookie 优先保证新会话不被旧 localStorage 令牌干扰。
- **政策页不回退 404**：合规页面宁可显示内置文案，也不能因后台没建文章就整页消失。

**遗留**

- 5.3 注销未处理「订阅邮件/通知偏好」表：这些表按 email 关联，匿名化后自然失效，未额外清理。
  **已补完（2026-11-13）**：`deleteAccount` 注销前捕获原邮箱，同步清理 `newsletters` / `restock_subscriptions`；
  被遗忘权应撤回营销同意，且匿名化后邮箱已不可匹配。新增测试 `customer-data-rights.test.ts` 第 7 例，7/7 通过。
- 5.2 未加 CSRF token（依赖 SameSite=Lax + 同源 BFF）；若未来跨域部署需补。

### 第 1 批 · 2026-11-13

**改动文件**

| 文件 | 改动 |
| --- | --- |
| `shops/server/utils/commerce.ts` | 新增 `buildQuoteForwardBody` / `buildOrderForwardBody` / `adaptQuote` 档位透传；`getCommerceSource` 生产强制 real |
| `shops/server/api/[...mock].ts` | 两个分支改用转发体构造函数；新增 `mockFallback` 打 `x-data-source` |
| `shops/server/api/catalog/[...path].ts` | 两处 mock 出口打 `x-data-source` |
| `shops/pages/checkout/index.vue` | 报价带地址与档位；移除写死 `'std'`；国家改下拉并同源；国家变更重算 |
| `shops/shared/types/commerce.ts` | `Quote` 增加 `shippableCountries` |
| `shops/.env.example` | 数据源默认值改为 `auto` 并注明生产被覆盖 |
| `server/modules/storefront/services/shippingService.ts` | 新增档位模型、校验、`listShippingOptions`、`listShippableCountries`；`resolveShipping` 支持档位 |
| `server/modules/storefront/services/quoteService.ts` | 入参支持 `shippingRateId`；出参新增档位与国家白名单 |
| `server/modules/storefront/services/checkoutService.ts` | 下单透传 `shippingRateId` |
| `server/modules/storefront/controllers/checkoutController.ts` | 控制器透传档位 |
| `server/shared/schemas/storefront.ts` | 报价与下单 schema 增加 `shippingRateId` |
| `shops/tests/unit/bff-forward-contract.spec.ts` | 新增 6 例契约测试 |
| `server/__tests__/storefront-shipping-options.test.ts` | 新增 7 例档位测试 |

**验证命令与结果**

| 命令 | 结果 |
| --- | --- |
| `npx nuxi typecheck`（shops） | 0 错 |
| `npm --prefix server run typecheck` | 0 错 |
| `npx vitest run`（shops 全量） | 11 文件 / 61 用例全绿 |
| `npx vitest run`（server 结算相关 4 文件） | 4 文件 / 24 用例全绿 |
| `npx vitest run server/__tests__/storefront-shipping-options.test.ts` | 7/7 通过 |
| 变异验证（删除转发字段） | 测试如期失败，恢复后通过 |

**行为变更说明**

- 运费语义由「分区固定价」变为「分区基础价 + 档位加价」。旧配置（`shop.shipping` 无 `options`）自动回退单一标准档，加价 0，存量行为不变。
- 生产环境忽略 `NUXT_COMMERCE_SOURCE`，强制真实数据源。
- mock 回退响应新增 `x-data-source: mock` 头。

**遗留**

- 结算页初始渲染仍是一次性 SSR 报价；用户改省/邮编不会自动重算（只监听国家）。
  **结论（2026-11-13）**：当前运费与税费都只依赖 `country`（`resolveShipping` 按分区、`taxService` 按目的国），
  省/邮编不参与定价，加监听只会触发内容完全相同的重复请求，故**不补**；若业务确认「按重量阶梯计费」（待确认项 #1）
  或引入州税，需重新评估。
- `storefront-shipping-options.test.ts` 只覆盖纯函数校验，档位加价的端到端链路（含数据库）依赖既有 `storefront-shipping.test.ts` 未覆盖部分，留待第 3 批重量计费时一并补。
  **已补完（2026-11-13）**：给 `shippingService` 加 `setShippingConfigProvider` 注入缝（与 `setTaxProvider`/`setPromotionEvaluator` 同款），
  新增 3 例端到端用例（选定档位叠加加价 / 档位不存在回退标准档 / 关闭注入缝回真实库配置），`storefront-shipping.test.ts` 12/12 通过。
  共享库的 `settings.shop.shipping` 是全局单行且无 options，直接改会与并行测试竞态，故用注入缝而非改库。

### 第 2 批 · 2026-11-13

**改动文件**

| 文件 | 改动 |
| --- | --- |
| `shops/composables/useCatalog.ts` | `listProducts` 增加 `keyword` 并拼入 query |
| `shops/pages/search.vue` | 服务端检索 + 服务端分页；结果数用 `total`；新增分页导航 |
| `shops/pages/c/[slug].vue` | 旧 `c-<id>` → 语义 slug 的 301；H1/描述用后台类目名 |
| `shops/pages/products/[slug].vue` | 主图 + 缩略图切换（消费 `images`）；标题区星级 |
| `shops/components/commerce/ProductCard.vue` | 星级与评价数 |
| `shops/components/commerce/JsonLd.vue` | `aggregateRating`（仅在有已审核评价时输出） |
| `shops/server/api/catalog/[...path].ts` | 类目 slug 透传、商品 `ratingAvg`/`reviewCount`/`updatedAt`/`category` 透传 |
| `shops/server/routes/sitemap.xml.ts` | 全量分页 + `<lastmod>` + XML 转义 + 上限保护 |
| `shops/shared/types/api.ts` | `CatalogProduct` 增加 `ratingAvg` / `reviewCount` |
| `server/modules/storefront/services/catalogService.ts` | 排序白名单、评分聚合、类目 slug、`updatedAt`、按 slug 过滤 |
| `server/modules/shop/models/ShopCategory.ts` | 增加 `slug` 列 |
| `server/modules/shop/services/categorySlugService.ts` | 新增：kebab / 取显示名 / 唯一 slug 生成 |
| `server/modules/shop/services/categoryService.ts` | 创建生成 slug；更新仅补空值 |
| `server/migrations/20261113_000001_add-shop-category-slug.ts` | 加列 + 回填 + 唯一索引 |
| `server/migrations/20261113_000002_backfill-category-slug-gaps.ts` | 补迁移后新建类目的空 slug |
| `server/shared/schemas/storefront.ts` | `sort`、`category`（slug）字段 |
| `server/__tests__/category-slug.test.ts` | 新增 8 例 |

**验证命令与结果**

| 命令 | 结果 |
| --- | --- |
| `npm --prefix server run typecheck` | 0 错 |
| `npx nuxi typecheck`（shops） | 0 错 |
| `npx vitest run`（shops 全量） | 11 文件 / 61 用例全绿 |
| `npx vitest run`（server 结算 4 文件） | 4 文件 / 28 用例全绿 |
| `npx vitest run server/__tests__/category-slug.test.ts` | 8/8 通过 |
| `npm run migrate` | 000001 + 000002 执行成功 |
| 库内校验 | 类目 4992 条，**空 slug 0 条**，非空重复 0 组，唯一索引 `(tenantId, slug)` non_unique=0 |

**过程中发现并修正的问题**

- 首次迁移写的表名是 `shop_categories`，实际模型表名为 `categories` → 迁移静默跳过（`if (!tables.includes(TABLE)) return`）。已修正表名并回滚重跑。
- 首次回填只覆盖迁移时已存在的行，迁移后新建的 32 条仍为空 → 新增 000002 补洞，并让 `createCategory` 从此自动生成 slug，避免再次产生空值。

**遗留**

- 库中现存类目名多为 `t1793...` / `storefront-cat-sf...` 这类测试命名，因此 `CATEGORY_SEO` 仍无命中。代码侧已支持语义 slug，需运营把类目改名为 `Lace Wigs` / `HD Lace` 等真实品类名后才会命中 TDK。
- `JsonLd.vue` 的 `aggregateRating` 未写端到端快照测试，仅由类型检查与代码路径保证。
  **已补完（2026-11-13）**：把 JSON-LD 计算抽成纯函数 `shops/shared/seo/product-jsonld.ts`
  （`buildProductJsonLd` / `buildBreadcrumbJsonLd`），`JsonLd.vue` 改为调用；新增 `tests/unit/product-jsonld.spec.ts` 8 例，
  锁定「有已审核评价才输出 aggregateRating」「价格用配置币种与小数位」「无价格返回 null」「面包屑含/不含类目」。
  shops `nuxi typecheck` 0 错、`vitest run` 12 文件 / 69 用例全绿。
