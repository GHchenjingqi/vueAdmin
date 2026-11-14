# storefront-ops-audit Dimension 02 · 搜索 / 类目 / 商品详情（发现层）

Route: C
证据范围：`shops/composables/useCatalog.ts`、`shops/pages/search.vue`、`shops/pages/c/[slug].vue`、`shops/pages/products/[slug].vue`、`server/modules/storefront/services/catalogService.ts`、`shops/server/api/[...path].ts`

## 结论

后端其实具备关键词检索、同义词展开、IDS 批量取数能力，但前端 composable 没有暴露 `keyword`；类目层因为没有 slug 列，所有类目页 TDK 全部落空；商品详情页不渲染多图。三点叠加，会让"从搜索到商品"这条路明显漏客。

## 证据链

### 1. 搜索退化为"当前 24 条的前端过滤"

`useCatalog.listProducts` 的入参类型里没有 `keyword`。[^dim02-sig]

搜索页因此只传分页参数：[^dim02-search]

```js
() => catalog.listProducts({ page: page.value, pageSize: 24 }),
```

随后在客户端按标题/slug 过滤：[^dim02-filter]

```js
return list.filter((p) => p.title.toLowerCase().includes(term) || p.slug.toLowerCase().includes(term))
```

也就是说：搜索 `lace` 时，系统只会在最新 24 条商品里找，第 25 条以后即使完全匹配也搜不到。

### 2. 后端本来支持

`catalogService.listProducts` 接受 `params.keyword`，并做同义词 OR 展开后推入 SQL：[^dim02-kw]

```js
const keyword = typeof params.keyword === 'string' ? params.keyword.trim() : ''
  if (keyword) {
    const variants = expandTerm(keyword)
```

`expandTerm` 来自 `searchSynonymsService`，内置假发品类同义词表（wig / hairpiece、body wave / bodywave 等）。[^dim02-syn]

`storefrontProductQuerySchema` 也声明了 `keyword` 字段。[^dim02-schema]

结论：能力已存在，只是 composable 没接。

### 3. 类目 URL 是 `c-<id>`，类目 TDK 全部失效

`ShopCategory` 模型只有 `name` / `level` / `sort`，没有 `slug` 列。[^dim02-cat]

BFF 适配类目时用 id 拼 slug：[^dim02-adaptcat]

```js
rows.map((r) => ({ id: r.id, slug: `c-${r.id}`, name: r.name, ... }))
```

而类目页 TDK 表以语义化 slug 为键：[^dim02-catseo]

```js
const CATEGORY_SEO: Record<string, { name: string; desc: string; keywords: string }> = {
  'lace-wigs': { ... },
```

实际 URL 是 `/c/c-11` 这类形态，永远命中不到 `lace-wigs`，于是标题回退为 `humanize(category)`，描述回退为通用模板。[^dim02-fallback]

同时 `SEO_SPEC.md` 明确要求集合页 URL 形如 `/c/lace-wigs`。[^dim02-spec]

### 4. 商品详情页不渲染多图

`ShopSpu` 有 `images` 数组列，[^dim02-spu] 后端 DTO 也返回 `images`，[^dim02-dto] BFF 也透传 `images: p.images ?? []`。[^dim02-bff]。但 PDP 模板只用 `product.cover` 渲染一张图，全文件没有出现 `images`。[^dim02-pdp]

对假发这类需要看发际线、发缝、密度的品类，单图是不够的。

### 5. 排序参数无效

前端类目页提供 newest / price-asc / price-desc 三个排序按钮。[^dim02-sortui] 但 `catalogService` 固定 `order: [['id', 'DESC']]`，全文件不含 `price-asc` / `price-desc` 字符串。[^dim02-order]

### 6. 商品 TDK 只能靠描述截断

`ShopSpu` 无 seo 列，`catalogService` 用商品描述前 160 字生成：`seo: { title, description: description.slice(0, 160) }`。[^dim02-seo] 后台 `SpuEdit.vue` 中检索不到 `seo` 字段，[^dim02-spuedit] 运营无法为单品写独立 TDK。

### 7. 商品卡无评分

`ProductCard.vue` 只渲染价格与缺货标签，无评分/评价数。[^dim02-card] 后端 `listReviews` 已返回 `summary.average` 与 `summary.total`。[^dim02-rev]

## 影响判断

- 搜索命中率直接决定付费流量承接效率；当前实现会把长尾词全部漏掉。
- 类目页是独立站自然流量主入口（`/c/lace-wigs` 这类词），TDK 全空等于放弃类目 SEO。
- 排序无效会让"价格从低到高"这类高意图行为失效。
- 无评分会降低列表页点击率（CTR），也拿不到搜索结果的星级富摘要。

## 修复方向

1. `useCatalog.listProducts` 增加 `keyword` 并透传到 BFF；搜索页改为服务端检索 + 服务端分页。
2. `ShopCategory` 增加 `slug` 列并回填（可用 name 生成 + 唯一性校验），BFF 输出真实 slug，同时保留 id 兼容旧链接。
3. PDP 增加主图 + 缩略图切换（`images` 已有数据，纯前端改造）。
4. 后端 `listProducts` 支持 `sort`（newest / price-asc / price-desc），价格排序需 join 价格表或按 SPU 最低价排序。
5. `ShopSpu` 增加 `seoTitle` / `seoDescription`，后台 SPU 编辑页补两个输入框，`catalogService` 优先取该字段。
6. 列表接口补 `ratingAvg` / `reviewCount` 聚合，ProductCard 显示星级。

[^dim02-sig]: File: shops/composables/useCatalog.ts, `listProducts` 参数类型 `{ category?, sort?, page?, pageSize?, ids?, attr? }`，无 keyword.
[^dim02-search]: File: shops/pages/search.vue, `catalog.listProducts({ page: page.value, pageSize: 24 })`.
[^dim02-filter]: File: shops/pages/search.vue, `list.filter((p) => p.title.toLowerCase().includes(term) || p.slug.toLowerCase().includes(term))`.
[^dim02-kw]: File: server/modules/storefront/services/catalogService.ts, `const keyword = typeof params.keyword === 'string'` 与 `expandTerm(keyword)`.
[^dim02-syn]: File: server/modules/storefront/services/searchSynonymsService.ts, `SYNONYM_GROUPS`.
[^dim02-schema]: File: server/shared/schemas/storefront.ts, `storefrontProductQuerySchema` 含 `keyword: optionalQueryStr(100)`.
[^dim02-cat]: File: server/modules/shop/models/ShopCategory.ts, 字段为 id/parentId/name/level/sort/tenantId，无 slug.
[^dim02-adaptcat]: File: shops/server/api/catalog/[...path].ts, `slug: \`c-${r.id}\``.
[^dim02-catseo]: File: shops/pages/c/[slug].vue, `CATEGORY_SEO` 以 'lace-wigs' 等语义 slug 为键.
[^dim02-fallback]: File: shops/pages/c/[slug].vue, `CATEGORY_SEO[category.value]?.name ?? humanize(category.value)`.
[^dim02-spec]: File: docs/SEO_SPEC.md, 集合页 URL 模式 `/c/:slug`（如 `/c/lace-wigs`）.
[^dim02-spu]: File: server/modules/shop/models/ShopSpu.ts, `declare images: string[] | null`.
[^dim02-dto]: File: server/modules/storefront/services/catalogService.ts, `StorefrontProductDetail` 含 `images: string[]`.
[^dim02-bff]: File: shops/server/api/catalog/[...path].ts, `images: p.images ?? []`.
[^dim02-pdp]: File: shops/pages/products/[slug].vue, 模板仅 `product.cover`，全文件无 `images`.
[^dim02-sortui]: File: shops/pages/c/[slug].vue, `sortOptions` 含 newest/price-asc/price-desc.
[^dim02-order]: File: server/modules/storefront/services/catalogService.ts, `order: [['id', 'DESC']]`，无 price-asc/price-desc.
[^dim02-seo]: File: server/modules/storefront/services/catalogService.ts, `seo: { title, description: description.slice(0, 160) }`.
[^dim02-spuedit]: File: src/views/shop/product/SpuEdit.vue, 检索无 `seo` 字段绑定.
[^dim02-card]: File: shops/components/commerce/ProductCard.vue, 仅 price 与 outOfStock 标签.
[^dim02-rev]: File: server/modules/storefront/services/reviewService.ts, `summary: { total, average, distribution }`.
