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
| 1 | Storefront 公开模块骨架 + 站点上下文 + 商品浏览接口 | 本轮交付 |
| 2 | `spus.slug` 列 + 后台可编辑（替代生成式 slug）、JSON_SEARCH 全文检索 | 后续 |
| 3 | C 端顾客模型（customer 表 + 独立 JWT）、register/login | 后续 |
| 4 | 购物车 / 结算报价（运费+税）/ 建单 + 支付会话 + webhook | 后续 |
| 5 | 评价 / Q&A / newsletter / restock-notify / RMA / CMS / 17track | 后续 |
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

## 通用验收标准（沿用 §6）

- 后端：`npm --prefix server run typecheck && npm --prefix server run test`
- 前端本轮不改动（独立站前端未建），无需跑前端验证。
- 提交前缀：`feat(storefront):` / `test(storefront):` / `docs(storefront):`。
- GitHub push 走本机代理 `https_proxy=http://127.0.0.1:7892`，直连会 `schannel: server closed abruptly`。
