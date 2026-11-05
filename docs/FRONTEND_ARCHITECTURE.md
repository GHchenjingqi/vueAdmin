# FRONTEND_ARCHITECTURE.md · Storefront 前端架构（P1-T02）

> 生成：2026-11-04 · 工程：`shops/`（Nuxt 3 + TypeScript strict + Tailwind + Vitest + Playwright）
> 后端冻结期说明：目录/契约代码已按最终形态落位；`server/api/catalog/*` 已直连现有后台只读接口（真实链路实测通过），商务接口（cart/checkout/orders）暂由 `shared/mock/*` 契约 mock 承载，后端阶段切换真实路由，**前端代码零改动**。

## 1. 目录结构与域映射

| 目录 | 职责 | 域归属 |
| --- | --- | --- |
| `pages/index.vue` | 首页（价值主张/分类/主推） | content |
| `pages/c/[slug].vue` | 集合页（排序/分页/空态） | catalog |
| `pages/products/[slug].vue` | 详情页（变体/库存/配送/退货摘要/JSON-LD） | catalog |
| `pages/search.vue` | 搜索（noindex、参数白名单） | catalog |
| `pages/cart.vue`、`pages/checkout/**` | 购物车/结算/结果页 | cart / checkout |
| `pages/policies/[slug].vue`、`pages/blog/**` | 政策/博客 | content |
| `components/commerce/*` | Price/ProductCard/VariantSelector/WigAttributes/ApparelAttributes/JsonLd | catalog + checkout 共享 |
| `components/ui/*` | AppButton/AppDialog/StockBadge/ShippingInfo | 基础 UI |
| `composables/` | useStoreConfig/useCatalog/useCart/useCheckout/useSeo | 各域一个组合式，跨域仅经组合式 |
| `shared/types` `shared/schemas` `shared/currency` `shared/api` `shared/i18n` | 契约与纯逻辑（无 Vue 依赖，可单测） | 跨域共享 |
| `shared/mock/*` | 契约 mock（fixtures + store） | 后端冻结期专用，切换后仅保留为测试夹具 |
| `server/api/catalog/*` | BFF：真实后台目录代理（信封解包 + 形状适配 + mock 回退） | catalog |
| `shops/server/api/[...mock].ts` | BFF：商务契约 mock（cart/checkout/orders） | cart/checkout |
| `shops/server/api/store-config.get.ts` | BFF：Store Config（币种下发） | 配置 |
| `shops/server/routes/sitemap.xml.ts` `robots.txt.ts` | SEO | content |

## 2. 数据流与边界（无跨域直接引用）

```
Browser → Nuxt SSR/BFF（server/api/**，同源，无 CORS 裸奔）
            ├─ /api/store-config → 币种配置（useStoreConfig 全局单例 useState）
            ├─ /api/catalog/**   → 现有后台 /api/storefront/v1（真实链路，失败回退 mock）
            └─ /api/(cart|checkout|orders)/** → 契约 mock（后端阶段替换为真实路由）
页面/组件只经 composables 取数；金额一律 Money{amount:分, currency}；渲染只经 Price/formatMoney。
```

## 3. 币种铁律落地（C1–C4）

- 前端源码零货币符号字面量（`$`/`¥`/`USD` 仅出现在 mock 配置与测试断言）。
- 唯一格式化入口 `shared/currency/format.ts#formatMoney`（Intl.NumberFormat）；组件唯一渲染入口 `Price.vue`。
- 币种不进环境变量（P1-T03）：`runtimeConfig.public` 仅 siteUrl；配置来自 `/api/store-config`，schema 校验（`shared/schemas/contract.ts`）。

## 4. Cookie 与会话策略（P1-T08）

- 游客购物车：`sb_cart` HttpOnly Cookie（后端阶段由真实 BFF 下发；mock 期用进程内 token）。
- 顾客会话：`sb_access` HttpOnly + SameSite=Lax + Secure（后端阶段启用）。
- BFF 对私有接口（cart/checkout/orders）统一 `Cache-Control: private, no-store`。

## 5. SEO 与缓存（P2 前端部分）

- useSeo：Title/Description/Canonical 每页唯一；hreflang 仅 self（真实存在版本）；搜索页 noindex。
- sitemap/robots：只收录可索引页；私有路径 Disallow。
- JSON-LD：Product/BreadcrumbList，priceCurrency 取配置。
- 缓存分层：目录 BFF `public, max-age=30, stale-while-revalidate=30`；私有 `private, no-store`。

## 6. 验证基线（2026-11-04 实测）

- `nuxi typecheck` 0 错误；`eslint .` 0 错误；`vitest run` 12/12。
- `nuxt build` 成功；SSR HTML 直出商品文本与货币符号（真实数据 + mock 模式均实测）。
- 交易 mock 链路：加购 → 下单（幂等键重放同单号）→ 支付 → captured；越权 token 404。
