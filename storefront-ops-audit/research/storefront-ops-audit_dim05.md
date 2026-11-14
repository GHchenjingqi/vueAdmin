# storefront-ops-audit Dimension 05 · SEO / 结构化数据 / 索引

Route: C
证据范围：`shops/composables/useSeo.ts`、`shops/components/commerce/JsonLd.vue`、`shops/server/routes/{sitemap.xml,robots.txt}.ts`、`shops/pages/index.vue`、`docs/SEO_SPEC.md`

## 结论

SEO 骨架（canonical / OG / sitemap / robots / JSON-LD）已经搭好，`SEO_SPEC.md` 也写得比较完整。但三处落地缺口让它打折：类目 URL 无语义（见 Dim02）、商品无评分富摘要、站点品牌与多站点能力脱节。另外 sitemap 只取前 60 个商品。

## 证据链

### 1. 已有能力（先肯定）

- `useSeo` 统一输出 title / description / keywords / robots / og:* / twitter:* / canonical / prev-next。[^dim05-seo]
- 集合页分页 canonical 规则由纯函数 `buildCollectionPaginationLinks` 实现，第 1 页去参数、第 2 页起自指并输出 rel=prev/next，与 `SEO_SPEC.md` 一致。[^dim05-page]
- `JsonLd.vue` 输出 Product（含 offers.price / priceCurrency / availability）与 BreadcrumbList。[^dim05-jsonld]
- 首页输出 Organization + WebSite（含 SearchAction）。[^dim05-org]
- 博客输出 BlogPosting，并对 `<` 做 `\u003c` 转义防 XSS。[^dim05-blog]
- `robots.txt` 屏蔽 checkout/cart/account/api 并声明 sitemap。[^dim05-robots]
- 私有页（cart/checkout/account/track）均 `noindex` + `private, no-store`。[^dim05-cache]

### 2. 商品结构化数据缺评分

`productJsonLd` 只构造 name / description / offers，没有 `aggregateRating`。[^dim05-jsonld2] 后端 `reviewService` 已提供 `summary.average` 与 `summary.total`，[^dim05-rev] 数据齐备但没接。

搜索结果里的星级富摘要依赖 `aggregateRating`，缺了就只能拿普通文字链。

### 3. sitemap 只取前 60 个商品

```js
$fetch<{ categories: { slug: string }[] }>('/api/catalog/categories'),
      $fetch<{ list: { slug: string }[]; total: number }>('/api/catalog/products?pageSize=60'),
```

[^dim05-sitemap]

`pageSize` 上限在 schema 层是 60（`optionalQueryInt(60)`），[^dim05-schema] 也就是说 sitemap 最多收录 60 个商品。商品数超过 60 后，剩余商品不会进 sitemap。

同时 sitemap 每个 `<url>` 只有 `<loc>`，没有 `<lastmod>` / `<changefreq>` / `<priority>`，[^dim05-xml] 而 `SEO_SPEC.md` 要求 `<lastmod>` 取商品更新时间。[^dim05-spec2]

### 4. 品牌名写死，与多站点能力冲突

`useSeo` 内 `const siteName = 'Aurora Hair Studio'`；`nuxt.config.ts` 的 `titleTemplate` 同样写死。[^dim05-brand]

而 `siteContext.ts` 已支持按 `X-Site-Id` 解析不同站点并取该站点的 `defaultCurrency` / `defaultLocale`。[^dim05-site] 品牌名与站点标识没有跟着走。

另外全仓检索 `X-Site-Id` 在 `shops/` 内无命中，[^dim05-xsite] 说明 C 端当前没有把站点标识传给后端，实际恒定落在默认租户。

### 5. 类目 URL 无 slug（与 Dim02 交叉）

见 Dim02 第 3 条：`ShopCategory` 无 slug 列，BFF 输出 `c-<id>`，类目 TDK 表永不命中。

## 影响判断

- 类目 URL 与 TDK 是自然流量主入口，这块不修，其他 SEO 工作收益都受限。
- 无 `aggregateRating` 会显著降低搜索结果点击率（同排名下）。
- sitemap 60 条上限会在商品上架到一定规模后静默失效。
- 品牌写死会导致多站点/多品牌时前台串名。

## 修复方向

1. **类目 slug**：见 Dim02 修复项 2。
2. **补评分**：PDP 的 `JsonLd` 增加 `aggregateRating: { ratingValue, reviewCount }`，数据取 `listReviews` 的 summary；列表页商品卡同步展示。
3. **sitemap 分页遍历**：按 `total` 循环拉取全部分页；输出补 `<lastmod>`（取 `updatedAt`）；商品数超 5 万时拆分 sitemap index。
4. **品牌配置化**：`siteName` 改为从 store config 下发（`/api/store-config` 增加 `siteName`），`titleTemplate` 用 `useHead` 动态设置。
5. **站点透传**：C 端请求统一注入 `X-Site-Id`（来自域名映射或环境变量），让多站点能力真正生效。

[^dim05-seo]: File: shops/composables/useSeo.ts, 输出 title/description/keywords/robots/og/twitter/canonical/prev/next.
[^dim05-page]: File: shops/shared/seo/pagination.ts, `buildCollectionPaginationLinks`.
[^dim05-jsonld]: File: shops/components/commerce/JsonLd.vue, Product offers + BreadcrumbList.
[^dim05-org]: File: shops/pages/index.vue, Organization 与 WebSite + SearchAction.
[^dim05-blog]: File: shops/pages/blog/[slug].vue, BlogPosting 与 `replace(/</g, '\\u003c')`.
[^dim05-robots]: File: shops/server/routes/robots.txt.ts, Disallow checkout/cart/account/api 与 Sitemap 声明.
[^dim05-cache]: File: shops/nuxt.config.ts, routeRules 对 cart/checkout/account/track 设 private no-store.
[^dim05-jsonld2]: File: shops/components/commerce/JsonLd.vue, productJsonLd 无 aggregateRating.
[^dim05-rev]: File: server/modules/storefront/services/reviewService.ts, 返回 summary.average 与 summary.total.
[^dim05-sitemap]: File: shops/server/routes/sitemap.xml.ts, `/api/catalog/products?pageSize=60`.
[^dim05-schema]: File: server/shared/schemas/storefront.ts, `pageSize: optionalQueryInt(60)`.
[^dim05-xml]: File: shops/server/routes/sitemap.xml.ts, `urls.map((u) => \`  <url><loc>${siteUrl}${u}</loc></url>\`)`.
[^dim05-spec2]: File: docs/SEO_SPEC.md, sitemap 的 `<lastmod>` 取商品更新时间.
[^dim05-brand]: File: shops/composables/useSeo.ts 与 shops/nuxt.config.ts, siteName 与 titleTemplate 写死 Aurora Hair Studio.
[^dim05-site]: File: server/modules/storefront/middleware/siteContext.ts, `X-Site-Id` 解析站点并取 defaultCurrency/defaultLocale.
[^dim05-xsite]: File: shops, 检索 X-Site-Id 无命中.
