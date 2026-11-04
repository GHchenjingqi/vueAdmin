# SEO_SPEC.md · 独立站 SEO 规范（P0-T16）

> 生成：2026-11-04 · 币种表述一律取后台配置（不写死 currency/符号）

## 1. URL 结构（canonical）

| 页面 | URL 模式 | 索引 |
| --- | --- | --- |
| 首页 | `/` | index |
| 集合页 | `/c/:slug`（如 `/c/lace-wigs`） | index |
| 商品详情 | `/products/:slug`（`{id}-{kebab}` 生成式 slug，id 段保证唯一解析） | index |
| 搜索页 | `/search?q=…` | **noindex**（含参数页一律 noindex） |
| 购物车/结算/账户 | `/cart /checkout/** /account/**` | noindex + `private, no-store` |

## 2. Canonical 规则

- 集合页带筛选/排序/分页参数时，canonical 指向**无参数 URL**（`/c/:slug`）；分页第 2 页起 canonical 指向自身（`?page=2` 自 canon）并在页面输出 `rel=prev/next`。
- 商品页 canonical=当前 slug；旧 slug → 新 slug 走 301（重定向表，P2-T12）。

## 3. hreflang

- 首发单语言：不输出 hreflang 自指（仅 en-US 版本存在时不输出）；P5-T01 第二语言上线时按「真实存在的语言版本」输出，禁止指向 404。

## 4. sitemap 与 robots

- sitemap 只收录：首页 + 集合页 + index 商品页（listed/published）；不含 noindex/参数页/私有页；`<lastmod>` 取商品更新时间。
- robots.txt：允许全部重要路径；`Disallow: /checkout, /cart, /account, /api/`；Sitemap 指向绝对 URL。

## 5. 筛选/排序/搜索参数白名单（可索引判定）

| 参数 | 可索引 | 处理 |
| --- | --- | --- |
| `page` | 集合页 canon 自指时可索引 | ≥1 整数 |
| `sort` | 否（canonical 去参数） | 白名单：newest/price-asc/price-desc |
| `attr.<code>` | 否（canonical 去参数；仅「可筛选」属性进白名单） | code 必须在属性字典 usage=filter 集合内 |
| `q`（搜索） | 否 | 搜索页 noindex |
| 其余参数 | 否 | 忽略并从链接剔除 |

## 6. 结构化数据（JSON-LD）

- Product：`priceCurrency` **取 Store Config 的 currency.code**（禁止写死）；price 与页面可见价格一致（同一数据源）；availability 与库存一致；`aggregateRating`/`review` 仅收录**已审核**评价。
- BreadcrumbList、Organization（logo/sameAs）配套输出。

## 7. 状态码与重定向（P2-T12 细化）

| 场景 | 状态码 |
| --- | --- |
| slug 变更 | 旧 URL 301 → 新 URL（重定向表：`shop_redirects` from_slug/to_slug/status） |
| 下架但保留记录 | 410（保留 30 天后可 404） |
| 从未存在/已删除 | 404 |

## 8. 币种与 SEO（T-12 联动）

- 结构化数据 priceCurrency 必须与页面可见货币符号同源（Store Config）；后台切币种后页面 HTML 与 JSON-LD 同步更新（缓存失效 P2-T13）。
