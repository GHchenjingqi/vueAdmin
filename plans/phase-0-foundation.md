# 阶段 0：基础框架与脚手架

**目标**：在 `master_shop` 上建立商城后台模块骨架，复用现有权限 / 多租户 / i18n / 工作流，搭出菜单、路由、后端挂载与一个空壳页面，后续阶段往里填功能。

**周期**：~1 周
**前置依赖**：无（基于 `master_shop` 当前状态）

---

## 0.1 确认分支与环境

- 动作：`git branch --show-current` 应为 `master_shop`；确认 `git status --short` 干净（仅 `.workbuddy/` 本地记忆未跟踪，不纳入）。
- 产出：分支状态确认。
- 验收：当前分支 = `master_shop`。

## 0.2 建立前端模块目录

- 动作：创建目录
  - `src/views/shop/`（含占位子目录 `category/ brand/ attribute/ product/ channel/ inventory/ order/ marketing/ analytics/`）
  - `src/modules/shop/`
- 产出：目录骨架（可放 `.gitkeep` 或先建一个空 `Dashboard.vue`）。
- 验收：`src/views/shop/Dashboard.vue` 可被 Vite 解析（下一步路由引用）。

## 0.3 菜单与路由注入

- 动作：
  1. 在 `src/i18n/zh-CN.json` 与 `en-US.json` 增加 `shop` 段，至少包含：商城、商品中心、类目管理、品牌管理、属性管理、SPU/SKU、渠道管理、库存中心、订单履约、营销中心、数据参谋。
  2. 在 `src/router/dynamicRoutes.ts` 增加商城顶级菜单 + 上述子菜单（component 指向 `src/views/shop/*.vue`，menu 标签走 `sidebar.*` key；新增多段 path 时**必须**同步两个 i18n 文件的 `sidebar.*`）。
- 产出：菜单配置 + i18n 键。
- 验收：`npm run typecheck` 通过；菜单不报 i18n 缺失（英文不回退到中文 DB 名）。

## 0.4 后端模块目录

- 动作：创建
  - `server/modules/shop/routes/index.ts`
  - `server/modules/shop/controllers/`
  - `server/modules/shop/services/`
  - `server/modules/shop/models/`
  - `server/shared/schemas/shop.ts`（先放占位 export，阶段 1 填充）
- 产出：后端模块骨架。
- 验收：TypeScript 编译无未使用导入告警。

## 0.5 后端路由挂载

- 动作：编辑 `server/routes/index.ts`
  - 顶部 `import shopRoutes from '../modules/shop/routes/index.js'`
  - 挂载 `router.use('/api/v1/shop', shopRoutes)`
  - `shopRoutes` 内部先用一个 `GET /health` 占位返回 `{ ok: true }`，便于联调。
- 产出：`server/modules/shop/routes/index.ts`。
- 验收：后端启动后 `GET /api/v1/shop/health` 返回 200。

## 0.6 空壳页面跑通联调

- 动作：
  1. `src/views/shop/Dashboard.vue` 渲染一个简单的"商城运营中台"欢迎卡片 + 调 `GET /api/v1/shop/health` 显示状态。
  2. `src/api/shop.ts` 导出 `shopApi.health()`。
- 产出：前端页面 + API 调用。
- 验收：本地 `npm run dev`（HTTPS `https://localhost:5173`）打开商城菜单，页面显示接口健康状态。

## 0.7 阶段收尾验证与提交

- 动作：
  1. 前端：`npm run format && npm run typecheck && npm run lint && npm run test`
  2. 后端：`npm --prefix server run typecheck`
  3. 提交：`git add -A && git commit -m "feat(shop): 搭建商城后台模块骨架与路由挂载"`
- 产出：一个可运行的脚手架 commit。
- 完成标准：菜单可见、路由可达、后端 `/api/v1/shop/health` 通，无类型/lint 错误。

---

**阶段 0 完成标准清单**

- [ ] 分支 `master_shop`，工作区干净（除 `.workbuddy/`）
- [ ] `src/views/shop/` 与 `server/modules/shop/` 骨架存在
- [ ] 商城菜单在中文/英文下均正常显示
- [ ] 后端 `/api/v1/shop/health` 200
- [ ] 前端 `format/typecheck/lint/test` 全绿
- [ ] 已提交一个 `feat(shop):` commit
