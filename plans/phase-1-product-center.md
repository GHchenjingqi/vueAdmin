# 阶段 1：商品中心 MVP

**目标**：落地跨境商品核心模型（类目 / 品牌 / 属性 / SPU / SKU）、多语言字段、多币种价格、汇率快照，以及**上架/发布状态机的基础 CRUD**（阶段 1 先做"直接状态流转"，审批流在阶段 2 接入）。

**周期**：2–3 周
**前置依赖**：阶段 0 完成（模块骨架 + 路由 + i18n 段就绪）

---

## 1.1 数据模型设计（建表迁移）

迁移文件统一命名：`server/migrations/YYYYMMDD_NNNNNN_description.ts`，使用 `queryInterface.createTable`（与 `20260707_*.ts` 风格一致），每个表加 `tenant_id`、`createdAt`、`updatedAt`。

需新建表：

| 表 | 关键字段 | 说明 |
|----|----------|------|
| `categories` | `parent_id`, `name`(JSON 多语言), `level`, `sort`, `tenant_id` | 类目树 |
| `brands` | `name`, `logo`, `tenant_id` | 品牌 |
| `attributes` | `name`, `type`(text/select), `options`(JSON), `tenant_id` | 规格属性（如颜色/尺寸） |
| `spus` | `category_id`, `brand_id`, `name`(JSON), `description`(JSON), `cover`, `status`, `tenant_id` | 标准化商品 |
| `skus` | `spu_id`, `code`, `spec`(JSON 规格组合), `barcode`, `origin_country`, `hs_code`, `declared_value`, `compliance`(JSON 资质), `status`, `tenant_id` | 可售单元（跨境字段） |
| `product_prices` | `sku_id`, `currency`, `amount`, `rate_snapshot_id`, `tenant_id` | 多币种价格 |
| `rate_snapshots` | `base_currency`, `rates`(JSON), `rate_date`, `tenant_id` | 汇率快照 |

- 动作：按上表逐个写迁移文件（建议一张表一个迁移，便于回滚）。
- 产出：7+ 个迁移文件。
- 验收：`npm run migrate:status` 显示新表已执行（count>0 且含新文件名）。

## 1.2 Zod 校验（类型单一来源）

- 动作：在 `server/shared/schemas/shop.ts` 定义并导出：
  - `createCategorySchema` / `updateCategorySchema`
  - `createBrandSchema` / `updateBrandSchema`
  - `createAttributeSchema` / `updateAttributeSchema`
  - `createSpuSchema` / `updateSpuSchema`（含 `status` 枚举 `draft|review|rejected|listed|published|unlisted|archived`）
  - `createSkuSchema` / `updateSkuSchema`（含 `origin_country`、`hs_code`、`declared_value`、`compliance` 字段约束）
  - `createPriceSchema` / `updatePriceSchema`
  - `rateSnapshotSchema`
  - `spuStatusSchema`、`skuStatusSchema`（状态流转枚举）
- 产出：`shop.ts` 校验 schema。
- 验收：`npm --prefix server run typecheck` 通过；前端后续从 schema 推断类型。

## 1.3 模型与 Repository

- 动作：在 `server/modules/shop/models/` 写对应 Sequelize 模型（表名与迁移一致），并统一在 `index.ts` 汇总导出。
- 产出：`models/*.ts`。
- 验收：typecheck 通过，无循环依赖。

## 1.4 Service 层

- 动作：在 `server/modules/shop/services/` 实现：
  - `categoryService`（树形查询/增删改）
  - `brandService`、`attributeService`
  - `spuService`（含状态机方法 `submit/reject/list/unlist/archive`）
  - `skuService`（含 `updateStatus`）
  - `priceService`（按币种写入，关联 `rate_snapshot_id`）
  - `rateService`（拉取/快照汇率，提供 `getSnapshot(date)`）
- 所有 service 注入 `tenant_id` 过滤（复用 `server/modules/tenant`）。
- 产出：service 文件。
- 验收：每个 service 有对应单测（`server/__tests__`），`npm --prefix server run test` 通过。

## 1.5 Controller + 路由

- 动作：
  - `server/modules/shop/controllers/` 写各 `*Controller.ts`。
  - `server/modules/shop/routes/index.ts` 挂载子路由，统一用 `validate(schema)` 中间件校验入参（参照 `server/routes/index.ts` 的 `validate` 用法）。
  - 路由建议：`/categories`、`/brands`、`/attributes`、`/spus`、`/spus/:id/skus`、`/skus/:id/price`、`/rates/snapshot`。
- 产出：controller + 路由。
- 验收：`npm --prefix server run typecheck && npm --prefix server run test` 通过。

## 1.6 前端 API 与页面

- 动作：
  1. `src/api/shop.ts` 导出 `categoryApi / brandApi / attributeApi / spuApi / skuApi / priceApi / rateApi`（风格对齐 `src/api/workflow.ts`）。
  2. 页面（均放 `src/views/shop/`）：
     - `category/CategoryList.vue`：类目树/表格 + 多语言 `name` 输入。
     - `brand/BrandList.vue`、`attribute/AttributeList.vue`。
     - `product/SpuList.vue` + `SpuEdit.vue`：基础信息、多语言标题/详情、类目/品牌关联、状态标签。
     - `product/SkuManager.vue`：SPU 下挂 SKU，规格组合、`hs_code`、`origin_country`、`declared_value`、`compliance` 资质、多币种价格录入。
     - 上架/发布操作区：按钮 `提交审核 / 通过 / 驳回 / 上架 / 发布 / 下架 / 归档`，调用状态机接口（阶段 1 直接流转，阶段 2 接审批流）。
  3. i18n：`shop` 段补充页面与字段文案（中英）。
- 产出：6+ 个页面 + API。
- 验收：`npm run format && npm run typecheck && npm run lint && npm run test` 全绿；页面可完成一次 SPU→SKU→价格→上架→发布的完整手动走查。

## 1.7 阶段收尾

- 动作：
  1. 前端全量验证（format/typecheck/lint/test）。
  2. 后端验证（typecheck/test）+ `npm run migrate:status`。
  3. 提交：`git commit -m "feat(shop): 商品中心 MVP（类目/品牌/属性/SPU/SKU/多币种/状态机）"`
- 完成标准：可在后台完整管理一件跨境商品的"建模→定价→上架→发布"主线，数据落库正确。

---

**阶段 1 完成标准清单**

- [ ] 7+ 张表迁移执行成功
- [ ] Zod schema 覆盖所有写接口
- [ ] 类目树 / 品牌 / 属性 CRUD 可用
- [ ] SPU/SKU 可建，SKU 含跨境合规字段
- [ ] 多币种价格落库并关联汇率快照
- [ ] 上架/发布状态机可手动流转（draft→…→published）
- [ ] 前端全量验证 + 后端验证全绿
- [ ] 已提交 `feat(shop):` commit
