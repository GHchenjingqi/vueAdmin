# 阶段 2：上架发布审批流 + 合规卡点 + 渠道管理

**目标**：把阶段 1 的"直接状态流转"升级为**工作流审批驱动**；增加发布前**合规校验卡点**；落地**渠道/店铺管理**与"发布到渠道"动作。系统化复用已完成并修复的 VueFlow 工作流引擎。

**周期**：2–3 周
**前置依赖**：阶段 1 完成（SPU/SKU 与状态机基础已就绪）

---

## 2.1 设计商品发布审批流（复用 VueFlow 工作流引擎）

- 动作：
  1. 用现有 `src/views/WorkflowDesigner.vue`（已修复箭头/对齐/右键删除）设计一条名为"商品发布审批流"的流程：`开始 → 提交 → 合规校验(自动节点) → 运营审批(approve) → 发布(notify/结束)`。
  2. 保存为一条 workflow 定义，记录其 `workflowId`，在 shop 配置中引用（如 `shop.publishWorkflowId`）。
- 复用点（务必读，不要重写）：
  - 后端：`server/routes/workflowRoutes.ts`、`server/services/WorkflowEngine.ts`、`server/services/workflowCallbackService.ts`、schema `server/shared/schemas/workflow.ts`
  - 前端：`src/views/WorkflowDesigner.vue`、`src/api/workflow.ts`
- 产出：一条已发布的 workflow 定义 + 配置引用。
- 验收：在 Designer 中该流程可被加载、编辑、发布；`workflowApi` 可取到 `workflowId`。

## 2.2 商品提交发布接入工作流

- 动作：
  1. `spuService.submitForPublish(spuId)`：创建 workflow 实例（复用 `workflowService`），把 `spuId` 作为业务上下文传入；SPU `status` 置为 `review`。
  2. 审批通过后，由 `workflowCallbackService` 的回调把 SPU `status` 从 `review` 流转为 `published`（建议新增一个 shop 专属回调处理，避免污染通用工作流）。
  3. 驳回时 `status` 回到 `rejected`，并记录驳回原因（复用 `rejectReasonController` 思路或新增 `reject_reasons` 关联）。
- 产出：`spuService` 增强 + 回调接入。
- 验收：提交后 SPU 进入待审批；在审批待办（现有 task/approval 体系）通过 → SPU 自动变 `published`；驳回 → `rejected`。

## 2.3 合规校验卡点（发布前必须过）

- 动作：在 `server/modules/shop/services/complianceService.ts` 实现：发布/审批前校验每个 SKU 必须齐备 `hs_code`、`origin_country`、非空 `declared_value`、且 `compliance` 资质满足渠道要求。
  - 校验失败 → 拦截，返回缺失项清单（前端以红色提示哪些字段缺失）。
- 触发点：阶段 2.2 的"合规校验(自动节点)"调用 `complianceService`；同时在前端"发布"按钮做前置校验。
- 产出：`complianceService.ts` + 自动节点对接。
- 验收：缺失 HS 编码/原产地的商品在审批流合规节点被卡住，提示明确。

## 2.4 渠道 / 店铺管理

- 动作：新增表（迁移）：
  - `channels`：`name`, `type`(amazon|shopify|tiktok|shopee|独立站), `config`(JSON), `tenant_id`
  - `shops`：`channel_id`, `name`, `credentials`(JSON 加密存储), `tenant_id`
  - `channel_products`：`channel_id`, `shop_id`, `spu_id`, `sku_id`, `external_id`, `status`(listed|published), `tenant_id`
- 在 `shop.ts` 增加对应 Zod schema；新增 `channelService` / `shopService`；挂载路由 `/channels`、`/shops`、`/channel-products`。
- 产出：渠道域 CRUD + 三张表。
- 验收：可新建"Amazon / 自营独立站"等渠道与店铺；typecheck/test 通过。

## 2.5 发布到渠道（适配层，本期先 mock）

- 动作：
  1. `spuService.publishToChannel(spuId, channelId, shopId)`：写入 `channel_products(status=listed)` 表示"上架到渠道"；审批通过后更新为 `published`，并调用 `channelAdapter.push()`（本期为 mock：仅记录日志/返回假 external_id）。
  2. `server/modules/shop/services/channelAdapter.ts`：定义统一接口 `push/pull/status`，本期仅 `mock` 实现，后续阶段 4 接真实平台 API。
- 产出：发布动作 + 适配层抽象（为后续多平台预留）。
- 验收：发布后 `channel_products` 出现对应记录，状态正确流转。

## 2.6 前端：渠道管理 + 发布弹窗

- 动作：
  1. `channel/ChannelList.vue`、`channel/ShopList.vue`：渠道/店铺 CRUD。
  2. `product/PublishDialog.vue`：选择渠道/店铺 → 触发提交审批流；显示合规校验结果（缺项红标）。
  3. 审批待办接入现有 task/approval 列表；审批详情页展示商品摘要。
- 产出：2 个列表页 + 发布弹窗 + 待办接入。
- 验收：`npm run format && npm run typecheck && npm run lint && npm run test` 全绿；完整走查"提交→合规卡→审批→发布到渠道"。

## 2.7 阶段收尾

- 动作：
  1. 前端全量验证；后端 `typecheck/test` + `migrate:status`。
  2. 提交：`git commit -m "feat(shop): 商品发布审批流、合规卡点与渠道管理"`
- 完成标准：商品发布由工作流驱动且合规前置校验生效，发布结果落到渠道维度。

---

**阶段 2 完成标准清单**

- [ ] 商品发布审批流（含合规自动节点）已设计并发布
- [ ] 提交→审批→发布 自动流转打通（回调更新 status）
- [ ] 合规缺失（HS/原产地/资质）发布被拦截并提示
- [ ] 渠道/店铺 CRUD 可用
- [ ] 发布到渠道写入 channel_products 并区分 listed/published
- [ ] 前端全量验证 + 后端验证全绿
- [ ] 已提交 `feat(shop):` commit
