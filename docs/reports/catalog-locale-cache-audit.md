# 目录多语言透传与 CMS 缓存键审计

> 发现式实证审计第 12 轮 · 2026-11-09 · 基线 HEAD `c68a11f`
> 范围：`server/modules/storefront/controllers/catalogController.ts`、
> `server/modules/storefront/controllers/cmsController.ts`、
> `server/modules/storefront/services/cmsCacheService.ts`（3 个文件）
> 原则：写库实证坐实 → 最小修复 → 回归 → 登记残留；不代决业务口径、不代勾门禁/签字/任务行。

## 0. 环境与链路说明

开局 3306 无监听（无 `mysqld` 进程），本轮为恢复写库实证与全量回归，仅启动了项目实际使用的
phpstudy `MySQL8.0.12` 实例（数据目录 `D:/phpstudy_pro/Extensions/MySQL8.0.12/data`，
含 `vue_admin` 库且当天 14:00 仍有写入；同机 `MySQL5.7.26` 数据停在 11/4，未启动、未改动）。
属环境恢复，不写入仓库。开局 HEAD 与远端 0/0，5173 在监听，3103/4015 未启动（预检 WARN 因此为 5）。

链路定位：`catalogService` 本身**没有进程内缓存**（每次查库），多语言由 `localized(value, lang)`
决定 title / description / 生成式 slug；缓存治理集中在 `cmsCacheService` 的 ETag（FNV-1a 因子）
与 `cmsController` 的 `Cache-Control` / 304。因此本轮审的是：

1. 多语言参数在 catalog 三个公开端点之间是否一致透传；
2. CMS 详情 ETag 的因子是否覆盖所有会影响响应体的请求维度。

## 1. 缺陷一：商品详情忽略 `?lang=`（中文列表链接 404）

`catalogController.categories` 读 `req.query.lang`；`products` 把整个 `req.query` 交给
`listProducts`（其内部用 `params.lang ?? defaults.lang`）；但 `productDetail` 只传
`site.defaultLocale`。而 `catalogService.getProductBySlug` 在 `spu.slug` 为空时用
`makeSlug(id, localized(name, lang))` 生成并**反向校验** slug：中文标题全被替换为 `-` →
`${id}-product`，英文标题 → `${id}-body-wave-wig`。

写库实证（专属租户 987707，SPU 双语言 name、slug 留空、status=listed）：

| 指标 | 期望 | 修复前实测 |
|---|---|---|
| 列表 `?lang=zh-CN` / `?lang=en-US` 标题 | 波浪假发 / Body Wave Wig | 正确（证明列表侧 lang 生效） |
| 两语言生成式 slug | 不同 | `6332-product` vs `6332-body-wave-wig` |
| 中文 slug 打详情接口（带 `?lang=zh-CN`） | 200 + 中文 title/seo | **404**（`next` 收到 `statusCode=404`，无响应体） |
| 英文 slug 打详情接口（不带 lang） | 200 + 英文 | 通过（阴性对照） |

即：中文列表页给出的商品链接点进去 404；即便后台填了真实 slug 能打开，详情仍固定返回站点默认语种。

## 2. 缺陷二：CMS 详情 ETag 不含 baseUrl，跨域名 304 串内容

`cmsController.getArticle` 用 `baseUrlOf(req)`（Host + `X-Forwarded-Proto`）生成
`structuredData.url`，但 `articleDetailEtag` 的因子只有
`tenantId / siteId / revision / slug / updatedAt`，且响应没有 `Vary` 头。

写库实证（同租户同文章，两次请求仅 Host 不同）：

| 指标 | 期望 | 修复前实测 |
|---|---|---|
| `structuredData.url`（a.example / b.example） | 不同 | `http://a.example/blog/...` vs `http://b.example/blog/...` |
| 两者 ETag | 不同 | **完全相同** |
| `Vary` 响应头 | 应有 | **null** |
| 用 A 的 ETag 请求 B 域名 | 200 + B 的内容 | **304 且无响应体**（复用 A 的结构化数据） |
| 同 Host 重复请求 | 304 正常 | 通过（阴性对照） |
| 列表 ETag 是否随 Host 变 | 不变（列表不含绝对 URL） | 通过（阴性对照） |

影响：结构化数据的 canonical URL 可能指向另一域名，SEO / 分享卡片串站；`Cache-Control: public`
下中间缓存也可能把 A 域名的正文复用给 B 域名。

## 3. 修复（3 个文件，最小范围）

- `catalogController.productDetail`：按 `categories` 同款表达式读取 `req.query.lang`，
  缺失时回退 `site.defaultLocale`，传给 `getProductBySlug`。
- `cmsCacheService.articleDetailEtag`：新增**可选**第 5 参数 `baseUrl = ''` 并纳入 ETag 因子
  （保持既有 4 参调用兼容，列表 ETag 一律不动）。
- `cmsController`：`getArticle` 复用同一个 `baseUrl` 同时传给 `getArticleBySlug` 与 ETag；
  新增 `VARY = 'Host, X-Forwarded-Proto'`，`setCacheHeaders` 与新的 `setNotModified` 辅助
  统一给 200/304 都带上 `Vary`（两个 304 分支收敛到同一辅助函数）。

未改动：`catalogService` / `cmsService` 业务逻辑与内容模型、`storefrontProductQuerySchema` /
`storefrontSlugParamSchema`、路由挂载、列表 ETag 的其它因子、`Cache-Control` 值、404 优先语义、
站点解析、模型与迁移，以及其它任何服务。

## 4. 验证

| 项 | 结果 |
|---|---|
| 新增实证测试 | **3/3 通过**（2 缺陷 + 1 阴性对照） |
| 相关既有回归（串行） | **13 文件 / 114/114**（含 `cms-admin.test.ts` 的 304/404 优先、安全断言、`storefront.test.ts`、站点缓存） |
| 后端串行全量 | **87 文件 / 767/767**（上轮 86/764，+1 文件 +3 例） |
| `npm --prefix server run typecheck` | 0 错 |
| ESLint `--no-ignore` | 0 error |
| `node scripts/check-doc-links.mjs` | **176/176 OK** |
| `node scripts/gate-preflight.mjs --strict --json` | 4 PASS / 5 WARN / **0 FAIL**，签字 1 已签 / 17 项 |

阴性核查：controllers 里 `req.query.lang` / `defaultLocale` 共 4 处，三处 catalog 端点口径已一致；
`baseUrlOf`、`buildArticleJsonLd`、`articleDetailEtag` 均只有本轮这一条消费链；
`cms-admin.test.ts` 详情 304 用例全程同一 Host，故 ETag 因子变更未误伤既有断言。

## 5. 残留登记（未改，需业务/架构决策或另行改造）

| # | 残留 | 说明 |
|---|---|---|
| R1 | 生成式 slug 与语言强耦合 | 同一 SPU 在不同 `lang` 下 URL 不同，列表/详情漏传任一侧仍会 404；彻底解耦需后台固化 slug 或按 id 路由 |
| R2 | CMS 内容模型单语 | `shop_articles` 的 title/content 是单字符串，故列表 ETag 未加 `lang` 因子；若将来引入多语言字段，两个 ETag 函数都需同步纳入语言 |
| R3 | `siteContext.DEFAULT_SITE` 可变单例 | 每个请求都会写 `DEFAULT_SITE.defaultCurrency`，并发请求共享该 fallback 值；建议改为请求级常量，属站点上下文重构 |
| R4 | `storeConfigController` 的 `market.language` | 固定取 `site.defaultLocale`，不随 `?lang` 变化；当前为站点配置语义，未判定为缺陷 |
| R5 | revision 仅进程内 | `cmsCacheService.revisions` 多实例各自计数，跨节点仍依赖外部失效器；既有设计，未改 |
| R6 | CDN 需真正遵守 `Vary` | 代码已发 `Vary: Host, X-Forwarded-Proto`，但 CDN/反代若忽略仍可能串缓存，需部署侧确认 |
| R7 | `X-Forwarded-Proto` 可信度 | 直接取首个值，未校验可信代理链；已有实现口径，未扩范围 |
| R8 | 上几轮残留 | 到货通知断点（业务决策）、购物车合并竞态与分叉历史数据、轨迹缓存多实例外呼等，均未在本轮范围 |
| R9 | 测试与并行方数据 | 租户 987707 的 SPU/文章为测试自建数据（afterAll 已清理）；并行方 WIP 与 G5 业务签字按约定未碰 |

## 6. 本轮边界

- 未代勾门禁、未代替责任方签字、未回填 `shops/mds/storefront-execution-plan_v1.0.md` 任务行；
  `docs/reports/gate-signoff-pack.md` 原件未改动（业务方已签 1 项）。
- 精准暂存仅本轮 5 个文件（3 改 + 1 新增测试 + 1 新增报告），排除并行方 WIP、
  `.box-agent-scratch/`、`.workbuddy/memory/`、计划文档与签字包。
- 环境恢复动作（启动本地 MySQL 8.0.12）只在运行时生效，不产生仓库改动。
