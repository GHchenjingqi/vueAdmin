# 跨境商城后台（master_shop）可落地执行设计方案

> 视角：多年跨境电商高级运营 + 产品经理
> 基线：本仓库现有 **Vue3 + Vite 管理后台** + **Express / Sequelize / Umzug 后端**（两包 monorepo，各自 `package.json`）
> 分支：`master_shop`（已基于 `master@a176d9a` 创建，工作区干净）
> 定位：本系统 = 跨境商城**运营中台 / 后台**；面向消费者的商城（H5 / 小程序 / 独立站）不在本仓库实现，但**共用同一后端 API**

---

## 1. 总原则

1. **复用优先**：多租户（`server/modules/tenant`）、i18n、权限体系、以及**已完成的 VueFlow 工作流引擎**全部直接复用，不重复造轮子。
2. **商品中心优先**：先把 `SPU/SKU` + 上架/发布状态机做扎实，再向库存 / 履约 / 营销 / 数据延展。商品是跨境的"弹药"，商品中心做错 = 后面全返工。
3. **跨境三支柱从 Day 1 落地**：合规（HS 编码 / 原产地 / 资质）、汇率快照、多语言。缺任何一项，后期都是重写不是迭代。
4. **每一步可独立验证**：改动后必须跑通前端 `format → typecheck → lint → test`，后端 `typecheck → test`（见 §6）。
5. **提交规范**：`feat(shop):` / `fix(shop):` / `refactor(shop):`，符合现有 commitlint。

---

## 2. 目标目录结构

**前端**（`src/`）

```
src/
  views/shop/                 # 页面
    category/  brand/  attribute/   # 基础数据
    product/                    # SPU/SKU 管理
    channel/                    # 渠道/店铺
    inventory/                  # 库存/仓配
    order/                      # 订单履约
    marketing/                  # 营销
    analytics/                  # 数据参谋
  modules/shop/                 # 复用型组件 / composables
  api/shop.ts                   # API 层（后续可按域拆 src/api/shop/*.ts）
  router/dynamicRoutes.ts       # 菜单/路由注入
  i18n/zh-CN.json  en-US.json   # 增加 shop 段
```

**后端**（`server/`）

```
server/modules/shop/
  routes/index.ts               # 挂载子路由，统一前缀 /api/v1/shop
  controllers/                  # *Controller.ts
  services/                     # *Service.ts（含 complianceService）
  models/                       # Sequelize 模型
server/shared/schemas/shop.ts  # Zod 校验（类型单一来源）
server/migrations/2026xxxx_*    # 建表迁移
server/routes/index.ts          # 追加 router.use('/api/v1/shop', shopRoutes)
```

**多租户复用**：所有 `shop` 业务表统一加 `tenant_id`；service 层注入租户过滤（复用 `server/modules/tenant`）。

---

## 3. 阶段地图

| 阶段 | 名称 | 周期(估) | 核心交付 | 状态 |
|------|------|----------|----------|------|
| 0 | 基础框架与脚手架 | ~1 周 | 模块目录、菜单路由、后端挂载、空壳页面跑通 | ✅ 已完成 |
| 1 | 商品中心 MVP | 2–3 周 | 类目/品牌/属性、SPU/SKU、多语言、多币种、上架发布状态机 CRUD | ✅ 已完成 |
| 2 | 上架发布审批流 + 合规卡点 + 渠道管理 | 2–3 周 | 接 VueFlow 审批流、合规校验、渠道/店铺、发布到渠道 | ✅ 已完成 |
| 3 | 库存/仓配 + 订单履约最小闭环 | 3–4 周 | 多仓库存中心、手工建单、1 个物流对接 | ✅ 已完成 |
| 4 | 营销中心 + 数据参谋 | 持续 | 折扣/券、销售/利润/汇率损益报表 | ✅ 已完成 |
| 5 | Storefront 公开接口层（独立站 C 端地基） | 持续 | `/api/storefront/v1` 免鉴权只读、站点上下文、商品浏览字段裁剪 | 🚧 第 1 步已交付 |

> 每个阶段对应一个独立文档：`phase-0-foundation.md` / `phase-1-product-center.md` / `phase-2-publish-workflow.md` / `phase-3-inventory-fulfillment.md` / `phase-4-marketing-analytics.md` / `phase-5-storefront.md`
>
> 阶段 5 依据 `shops/mds/独立站前端架构与功能设计.md`；C 端 Nuxt 3 前端工程另起目录，不在本仓库 admin 内。

---

## 4. 关键复用点（务必先读，避免重复实现）

- **工作流引擎**（阶段 2 强依赖）：
  - 后端：`server/routes/workflowRoutes.ts`、`server/controllers/workflow*.ts`、`server/services/WorkflowEngine.ts`、`server/services/workflowCallbackService.ts`、共享 schema `server/shared/schemas/workflow.ts`
  - 前端：`src/views/WorkflowDesigner.vue`（你已修复箭头/对齐/右键删除）、`src/api/workflow.ts`
  - 用法：在 Designer 中设计"商品发布审批流"（提交 → 合规校验 → 运营审批 → 发布），商品提交发布时创建流程实例，审批通过后由 callback 把 `status` 置为 `published`。
- **多租户**：`server/modules/tenant`，所有 shop 表加 `tenant_id` 并在 service 过滤。
- **i18n**：新增菜单/字段走 `src/i18n/zh-CN.json` + `en-US.json`，菜单标签用 `path → sidebar.*` 映射。

---

## 5. 如何执行

- 从 **阶段 0** 开始，按文档内步骤编号逐步执行。
- 每完成一个步骤，跑一次 §6 对应验证；每完成一个阶段，提一个 `feat(shop):` commit。
- 跨阶段依赖：阶段 1 的"上架/发布"在阶段 1 先做**直接状态流转**，阶段 2 再替换为**工作流审批驱动**，避免前期被审批流阻塞。

---

## 6. 通用验收标准（每步 / 每阶段必须过）

- 前端：`npm run format && npm run typecheck && npm run lint && npm run test`
- 后端：`npm --prefix server run typecheck && npm --prefix server run test`
- 新增迁移后：`npm run migrate:status` 确认 executed count > 0 且含新文件名
- 约束：前端 `strict: true` 禁止 `any`（测试文件除外）；后端 `strict: false`；Prettier 无分号、单引号、`printWidth: 160`、`endOfLine: lf`、UTF-8 无 BOM
- 不允许新增 `sync` 建表；迁移只用 `queryInterface.createTable` / `addColumn` / `addIndex`（与现有 `server/migrations/20260707_*.ts` 风格一致）

---

## 7. 运营视角的红线（来自踩坑，架构必须守住）

1. **汇率**：永远用 `rate_snapshots` 快照计算历史订单利润，禁止实时汇率回溯，否则对账崩。
2. **合规**：发布前必须有 `hs_code` + `origin_country` + 资质，清关第一风险，卡死在发布卡点。
3. **多语言**：翻译不是可选项，详情页多语言缺失 = 该市场转化归零（字段维度存多语言）。
4. **库存**：跨渠道必须有统一库存中心，否则超卖。
5. **上架 ≠ 发布**：先内部上架校准，再按渠道节奏发布，避免价格/合规未审就对外。
