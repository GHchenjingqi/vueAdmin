# G5 门禁 · 扩展未破坏主链路回归报告（2026-11-06）

> 关联任务：`P5-T09 G5 门禁：扩展未破坏主链路回归`
> 验收标准：**主市场交易 E2E 全绿；币种切换回归通过；缓存与 SEO 无回归**（依赖 P5-T01 ~ P5-T08）
> 本报告只登记**实测证据与缺口**，不代勾门禁状态；G5 在计划文档中保持 `[ ]`。

## 1. 结论摘要

| 验收项 | 结果 | 证据 |
| --- | --- | --- |
| 主市场交易 E2E | ✅ 通过（服务端） | A 组 69/69（6 文件），含 §9 T-01~T-12 并发/幂等/异常路径 |
| 币种切换回归 | ✅ 通过 | B 组 57/57（5 文件）+ `t12-currency-switch.md` / `t12-jsonld-currency-switch.md` 全链路实测 |
| 缓存与 SEO | ✅ 通过 | C 组 47/47（6 文件）+ `performance-acceptance.md`（LCP 140ms / CLS 0） |
| 扩展能力不污染主链路 | ✅ 通过 | 隔离性 27/27（4 文件）：feature flag / A/B 关闭态 / CMS 缓存失效 |
| 浏览器级冒烟 E2E | ✅ 3/3 | 独立生产构建（`:4015`，mock 自洽源）实测全过；根因见 §5（数据源不一致已修复） |
| **真实链路冒烟 E2E（2026-11-09 增量）** | ✅ 3/3 含支付终态 | 后端 dev（5173，MySQL/Redis 就绪）+ 前端 `auto`：加购→下单→**Pay Now→Paid** 全绿（§9）；SEO 增强（TDK/OG/Twitter/robots/JSON-LD）无回归（§9） |
| 后端全量 / 前端单测 | ✅ 630/630 · 43/43 | 68 文件 / 8 文件，见 §2；前端 43/43 为 2026-11-09 复测（单语收敛后词条用例调整，见 §9） |

**门禁判定：✅ 已关闭（2026-11-09 业务签字）**——技术侧证据全 PASS（本表），2026-11-09 业务方签字确认「扩展能力上线不破坏主市场交易链路」（`gate-signoff-pack.md` §4 签字记录：勾选①）；生产环境验收项（生产级 E2E 抽样 / 币种切换真实验收 / 真实 CDN 失效链路）签字人知悉，随 X-T06 生产部署回验，不阻塞本门禁。

## 2. 环境与全量基线

| 项 | 值 |
| --- | --- |
| 采集时间 | 2026-11-06 11:00 (GMT+8)，dev 本地环境 |
| 后端 | `cd server && npx vitest run` → **68 files / 630 tests 全绿，0 失败** |
| 前端 | `cd shops && npx vitest run --config vitest.config.ts` → **8 files / 45 tests 全绿** |
| typecheck | ✅ 0 错误（server + shops） | 复测于 11:55：`server tsc --noEmit` 0 错、`shops nuxi typecheck` 0 错；T05 并行 WIP 的 `bundleService.ts` 3 错已由并行方修复（导入路径改 `../../shop/models/...`） |
| 运行中服务 | BFF/SSR `http://localhost:3014`、后台 `https://127.0.0.1:5173` 均 200（旧构建产物，见 §5） |

注：上一轮记录的唯一失败（并行方 `featureFlags.test.ts` bnpl 断言，dev 库残留 `bnpl:true`）本轮已被并行方自行修复，全量恢复 630/630。

## 3. 三组针对性回归（逐项实测）

### A · 主市场交易 E2E — 69/69（6 文件）

```
storefront-trade-gate · storefront-commerce · shopPhases
storefront-orders-list · storefront-refund · storefront-cart-merge
```

覆盖 §9 T-01~T-12 的核心断言：同 SKU 并发 `occupy` 不超卖、相同 `idempotencyKey` 不重复建单、Webhook 重复投递 `alreadyProcessed`、支付成功不依赖浏览器回跳、失败/超时释放预占、改价后服务端重报价、优惠券过期拒绝、配送白名单、退款与 RMA、订单列表、购物车合并。

### B · 币种切换回归 — 57/57（5 文件）

```
storefront · storefront-order-mail · storefront-tax
storefront-coupon · storefront-shipping
```

互补实测报告：
- `t12-currency-switch.md`：admin 双确认 USD→CNY 后，store-config / 新购物车 / 报价均为 CNY；**旧 USD 购物车报价返回 409 CURRENCY_CHANGED**（不静默换算）；**切换前订单快照保持 USD 259.80 不变**；`shop_config_changes` 审计链完整；可回滚 USD。
- `t12-jsonld-currency-switch.md`：CNY→USD→CNY 逐次抓 SSR HTML 解析 `application/ld+json`，`priceCurrency` 与前台可见符号同步。

### C · 缓存与 SEO — 47/47（6 文件）

```
cache · siteCache · dictCache · storefront-cms · cms-admin · cms-admin-security
```

- `cmsCacheService` 站点级 revision + 可插拔失效器；发布/下线逐次 bump，失效器异常仅 `warn` 不阻断发布。
- 公开列表/详情 ETag + 304；**详情先查库再判 ETag**，下线文章持旧 ETag 仍返回 404（防缓存"复活"）。
- `cms-admin-security.test.ts` 锁定 JSON-LD `<` 转义、admin 鉴权、禁改 `status`、slug 正则。
- `performance-acceptance.md`：移动端 LCP P75 最大 **140ms** < 2500ms、CLS 全为 0、TTFB 34–95ms。

### D · 扩展能力隔离性 — 27/27（4 文件）

```
experiments · featureFlags · cms-admin · cms-admin-security
```

`ab_test` / 5 个新功能 flag 关闭态降级 `control` 且不计算分桶、不触发曝光 hook（零副作用）；CMS 写操作不改报价库存。这直接支撑 G5「扩展能力上线不破坏既有交易链路」。

**T08 业务接入实测（本会话）**：`shops/composables/useExperiment.ts` `assign(key)` 网络级失败 fail-closed `control` 不阻塞页面；`checkout_cta` variant_a 仅替换「Place order securely」文案、其余 control；`product_recommendation` 仅控制「You may also like」推荐位数量（control=4/variant_b=8/variant_c=12，排除当前商品、仅浏览行为）。报价与库存路径零改动，购物车/结算/预占服务不感知实验 → **实验接入不污染主链路**。

## 4. 浏览器级冒烟 E2E（本轮改进与实测）

**发现并修复的用例缺陷**（`shops/tests/e2e/smoke.spec.ts`）：
1. 原用例硬编码 mock fixtures 的商品 slug `101-hd-lace-glueless-body-wave-wig`。运行中 BFF 走真实数据源（`NUXT_COMMERCE_SOURCE=auto`）时该商品不在库中，SSR 返回 **404 `Product not found`**，两个用例因找不到 `Add to Cart` 直接超时。改为**从首页 SSR 链接动态取商品**，mock / 真实数据源均适用。
2. 真实库首页首个商品为 `Out of stock`、按钮 disabled，click 仍会超时。改为**跳过缺货卡片 + 逐个验证 `Add to Cart` 可用**（最多 6 个候选）。

**实测结果（Chromium / 系统 Chrome channel / `E2E_BASE_URL` 指向独立生产构建）**：

| 轮次 | 结果 | 说明 |
| --- | --- | --- |
| 修前 | 1 passed / 2 failed | 商品详情、下单均因硬编码 slug 404 超时 |
| 第 1 次修后 | 2 passed / 1 failed | 详情页通过；首个商品缺货、按钮 disabled |
| 第 2 次修后 | **2 passed / 1 failed** | 首页 ✅、商品详情 ✅（含 `toBeEnabled()`）；下单卡在 `/checkout` |
| 第 3 次（本会话，根因修复后） | **3 passed / 3 passed** | 独立生产构建 `:4015`（`NUXT_COMMERCE_SOURCE=mock` 自洽源），三个用例全过，2.1s |

> 注：本地 Playwright 浏览器 revision（期望 1248，仅装 1226）缺失，本会话以系统 Chrome（`channel: 'chrome'`）运行；此为环境差异，非用例/代码问题。生产 CI 由 `npx playwright install chromium` 补齐后按 §8 命令执行。

**根因（§5 修正）**：`/checkout` 500 确由运行中旧构建产物失效引发；但即使重建服务，下单用例仍会因**数据源不一致**失败——`shops/server/api/catalog/[...path].ts` 始终真实后台优先（不认 `commerceSource=mock`），而购物车/下单走 `mockStore`（`'guest'` token，SKU 仅 10101+/20100+）。首页展示真实库**测试商品**（`2904-...`，`price:null`/SKU 不在 mockStore）→ `Add to Cart` 报 `variant not found`，购物车为空 → 下单 `CART_EMPTY`。**修复**：catalog 路由在 `commerceSource=mock` 时直接服务 mock fixtures，mock 模式自洽（首页现为 `101-hd-lace-...` 等 mock 商品，SKU 可加购、可下单）。改动仅影响 mock 分支，auto/real 路径不变；回归 45/45 单测 + typecheck 全绿。

## 5. 阻断项归因（已修复）

**历史**：下单用例原停在 `page.fill('#fullName')`，因运行中 3014 旧 Nuxt 构建的 `/checkout` 500（`Cannot find module '...index-CDn8YrA2.mjs'`，chunk 已被替换）。属构建产物与运行中进程不同步的环境问题，非交易链路代码回归。

**深层根因（本会话定位并修复）**：重建服务后下单仍 `CART_EMPTY`，定位为 **catalog 与 commerce 数据源不一致**（见 §4 根因段）。已在 `shops/server/api/catalog/[...path].ts` 修复：`commerceSource=mock` 时直接返回 mock fixtures。修复后独立生产构建 `:4015` 冒烟 E2E **3/3**（§4）。运行中的 3014 属并行方旧进程，未代重启。

## 6. 当前工作树的 WIP 干扰（如实登记）

| 项 | 状态 | 归属 / 影响 |
| --- | --- | --- |
| `bundleService.ts` / `ShopBundle.ts` | 已由并行方收口 | P5-T05 已 `[x]`；导入路径已修正为 `../../shop/models/...`，`server tsc --noEmit` 0 错（见 §2）。 |
| `000066_add-cart-locale.ts` / `000067_add-warehouse-routing.ts` / `000068_create-bundles.ts` / `000069_add-referral-system.ts` | 未跟踪迁移 | 并行方 P5-T01 / T04 / T05 / T07，已自行在 dev 库执行并计入各自任务证据；本轮未触碰。 |
| `storefront-warehouse-routing.test.ts` | 未跟踪测试 | 并行方 P5-T04，已计入本轮全量 630/630。 |
| `featureFlags.ts` / `checkoutService.ts` / `quoteService.ts` / `cart.vue` / `useExperiment.ts` / `pages/checkout/index.vue` / `pages/products/[slug].vue` 等 | 工作树 `M` / 新增 | P5-T08 本会话业务接入（T08 已 `[x]`，shops 45/45 + typecheck 0 错）；其余并行方未提交 WIP，全程未夹带、未覆盖。 |

## 7. 缺口与行动项（G5 达成前）

1. **服务重建 + E2E 复跑**：✅ 本会话已独立生产构建 `:4015`（`NUXT_COMMERCE_SOURCE=mock` 自洽源）实测冒烟 E2E **3/3**（§4）。运行中 3014 仍为并行方旧进程，未代重启；其重启后即等价。
2. **P5 批次收口**：✅ P5-T01（多语言）、T02（币种切换治理）、T03（区域支付/BNPL）、T04（多仓路由）、T05（Bundle）、T06（博客 CMS）、T07（Referral）、T08（A/B 与个性化）均已 `[x]` 且各自证据齐备；G5 依赖项已闭合。
3. **商业规则定稿**：Bundle 组合报价、Referral 归因窗口/佣金币种，非代码实现缺口（规则已在 T05/T07 落码为可配置常量，需业务复核数值）。
4. ~~**业务签字与真实环境**~~：✅ 业务签字已落（2026-11-09，`gate-signoff-pack.md` §4 签字记录，勾选①）；生产级 E2E 抽样、币种切换真实验收、真实 CDN 失效链路随 X-T06 生产部署回验。
5. ~~`bundleService.ts` 导入路径~~：✅ 已由并行方收口，typecheck 0 错。
6. **Playwright 浏览器补齐**：本地期望 revision 1248（仅装 1226）缺失，本会话以系统 Chrome channel 运行；生产 CI 需 `npx playwright install chromium`。

## 8. 复跑命令

```bash
# 后端全量 + 三组针对性回归
cd server && npx vitest run
npx vitest run __tests__/storefront-trade-gate.test.ts __tests__/storefront-commerce.test.ts \
  __tests__/shopPhases.test.ts __tests__/storefront-orders-list.test.ts \
  __tests__/storefront-refund.test.ts __tests__/storefront-cart-merge.test.ts
npx vitest run __tests__/storefront.test.ts __tests__/storefront-order-mail.test.ts \
  __tests__/storefront-tax.test.ts __tests__/storefront-coupon.test.ts \
  __tests__/storefront-shipping.test.ts
npx vitest run __tests__/cache.test.ts __tests__/siteCache.test.ts __tests__/dictCache.test.ts \
  __tests__/storefront-cms.test.ts __tests__/cms-admin.test.ts __tests__/cms-admin-security.test.ts
npx tsc --noEmit -p tsconfig.json

# 前端单测 + 浏览器级冒烟（生产构建 `node .output/server/index.mjs`，独立端口；mock 自洽源）
cd ../shops && npx vitest run --config vitest.config.ts
PORT=4015 NUXT_COMMERCE_SOURCE=mock NUXT_API_INSECURE_TLS=1 \
  node .output/server/index.mjs &   # 需先 `npx nuxt build`
E2E_BASE_URL=http://localhost:4015 npx playwright test \
  --config tests/e2e/playwright.config.ts --reporter=line
```

---

## 9. 2026-11-09 增量回归：真实链路（数据库就绪）

> 背景：用户启动 MySQL (3306) / Redis (6379) 与后端 dev 服务（5173，自签名证书）后，前端切换 `NUXT_COMMERCE_SOURCE=auto`（real 优先、网络级失败回退 mock）完成端到端验证。**本节均为实测记录。**

### 9.1 真实链路端到端（浏览器 + API 双通道实测）

| 步骤 | 结果 |
| --- | --- |
| 真实 catalog | 可购商品（$129.90 / 库存 50）正常渲染，价格缺失商品显示 "—"（§9.2 已禁用加购） |
| 真实加购 | `POST /api/cart/items` 200；导航 Cart 数量角标实时 +1（`useCart` 改 `useState` 全局共享，修复"加购无反馈"） |
| 真实下单 | orderId `5897`、`SO202611090917368441`（后端日期格式单号），金额 $137.90（含标准运费 $8.00），quote 含仓库分配（SF Warehouse） |
| 真实支付 | `payments/session` + BFF mock-provider webhook 投递 → 订单 **Paid**；后端查询 `status=paid`、`paymentStatus=captured` |

### 9.2 本轮发现并修复（主链路质量项）

| # | 缺陷 | 修复 | 影响 |
| --- | --- | --- | --- |
| 1 | mock 层支付路由 `endsWith('/pay')` 未剥离 query（`?t=`）→ **支付 404**（mock 模式 Pay Now 无效） | `[...mock].ts` pay 匹配剥离 query | mock/真实链路支付均通 |
| 2 | `useCart` 每次调用独立实例，布局层无法感知加购 → 导航无数量角标、"加购无反馈" | `useState` 全局共享 + 布局 Cart 角标 | 加购反馈可见 |
| 3 | 真实库价格 null 但 In stock 的商品，Add to Cart 可点 → 运行时守卫拦截无反馈 | 产品页 `:disabled="!inStock \|\| !price"` | 与守卫一致，防守数据质量问题 |
| 4 | `useExperiment` 请求带 `storefront/v1/` 前缀与 BFF 路由不匹配 → console 404 | 统一 `/api/experiments/...` + mock 层 fail-closed 兜底 | console 零错误；真实端点 200 直通 |
| 5 | E2E 用例点击 Add to Cart 后立即 `goto('/checkout')` 中断加购 POST（mock 快掩盖真实链路慢）→ 购物车空、下单 400 | 等待加购响应成功再导航 | E2E 真实链路可用 |
| 6 | vitals 埋点 sendBeacon 以 text/plain 发送 → BFF 400 | `application/json` Blob | 埋点正常上报 |

### 9.3 SEO 增强（TDK/OG/Twitter/robots/JSON-LD，无回归）

- `useSeo` 增强：keywords / ogType / ogImage / noindex / og:site_name / Twitter Card；全站页面级 TDK（首页/分类/产品/博客/政策），交易页统一 `noindex`。
- 首页 Organization + WebSite（SearchAction）JSON-LD；产品页 Product + BreadcrumbList、`og:type=product`。
- 修复 Title 品牌重复（页面 + 全局 `titleTemplate` 双品牌）。
- 验证：SSR head 全标签断言（`/`、`/c/hd-lace`、`/products/*`、`/cart`、`/blog`）+ robots.txt / sitemap.xml 正常。

### 9.4 真实链路冒烟 E2E（主链路含支付终态）

```
cd shops && npx nuxt build
PORT=3103 NUXT_COMMERCE_SOURCE=auto NUXT_API_INSECURE_TLS=1 node .output/server/index.mjs &
E2E_BASE_URL=http://127.0.0.1:3103 npx playwright test --config tests/e2e/playwright.local.config.ts
# 结果：3 passed（首页 SSR / 详情变体 / 加购→下单→Pay Now→Paid，主链路 2.8s）；诊断辅助用例 skip
```

- `playwright.local.config.ts`（untracked）：系统 Chrome channel（本地 playwright chromium revision 1248 缺失，同 §7-6）。
- 每次回归在真实库产生一笔测试订单（含真实 quote/库存/webhook），支付路径已固化进用例。

### 9.5 静态检查（2026-11-09 复测）

| 项 | 结果 |
| --- | --- |
| shops `nuxi typecheck` | 0 错误 |
| shops eslint | 0 errors（4 warnings 均在 `coverage/` 构建产物目录） |
| shops vitest | 8 文件 43/43（单语收敛 P5-T01b 后 `locale.spec.ts` 调整为单语语义，用例总数 45→43） |

### 9.6 剩余边界（维持不代勾）

1. ~~G5 门禁签字~~：✅ 2026-11-09 业务签字关闭（`gate-signoff-pack.md` §4 签字记录：勾选①；②③④生产环境验收项随 X-T06 生产部署回验）。
2. 真实库为测试数据（价格 null 的 Slugged Wig 等已由页面禁用防守）；正式演示内容需后台配置。
3. 本轮改动未提交，v3 平行库同步待库路径（同步包见会话交付）。

---

*本报告由回归实测生成；门禁状态变更须由业务/责任方在 `storefront-execution-plan_v1.0.md` §P5-T09 回填。*
