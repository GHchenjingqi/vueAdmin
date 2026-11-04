# 阶段 4：营销中心 + 数据参谋

**目标**：补齐**营销能力**（折扣 / 优惠券 / 多语言活动）与**数据参谋**（销售、利润、汇率损益、库存周转报表），让运营从"能上架能发货"升级到"能定价能看数能优化"。

**周期**：持续迭代（可并行于前序阶段收尾）
**前置依赖**：阶段 1（商品/价格）、阶段 2（渠道）、阶段 3（订单/库存）基础就绪

---

## 4.1 营销中心

- 动作：新增迁移：
  - `promotions`：`name`, `type`(discount|full_reduce), `scope`(sku/spu/category/all), `rule`(JSON), `start_at`, `end_at`, `tenant_id`
  - `coupons`：`code`, `type`(fixed|percent), `value`, `min_spend`, `currency`, `valid_from`, `valid_to`, `tenant_id`
- Zod：promotionSchema / couponSchema（放 `shop.ts`）。
- 服务：`marketingService.ts`（创建/校验有效期/叠加规则），复用 `rateService` 做多币种优惠换算。
- 前端（`src/views/shop/marketing/`）：`PromotionList.vue`、`CouponList.vue`，活动支持多语言名称（字段维度多语言，复用阶段 1 的多语言存储方式）。
- 验收：可建活动/券，前台（后续）可抵用；本期至少保证后台配置与数据正确。

## 4.2 数据参谋（销售 / 利润 / 汇率损益）

- 动作：
  - 复用现有 `dashboardService` / `dashboardRoutes` 模式，新增 `analyticsService.ts`：
    - 销售报表：按渠道/国家/类目/时间聚合 `order_items` 销售额
    - **利润核算**：收入 − 成本 − 物流 − 关税；汇率损益基于 `rate_snapshots` 快照（历史订单锁定当时汇率，**禁止**用实时汇率回溯）
    - 库存周转：基于 `inventory_log` 计算周转天数/滞销
  - 新增路由 `/api/v1/shop/analytics/*`，Zod 校验查询参数（日期区间/维度）。
  - 前端（`src/views/shop/analytics/`）：`SalesReport.vue`、`ProfitReport.vue`（含汇率损益）、`InventoryTurnover.vue`，用图表组件（沿用项目现有图表库）。
- 验收：`npm run typecheck && npm run lint && npm run test` 通过；报表数据与现实订单一致，利润按快照汇率计算。

## 4.3 阶段收尾

- 动作：
  1. 前端全量验证；后端 typecheck/test。
  2. 提交：`git commit -m "feat(shop): 营销中心与数据参谋"`
- 完成标准：运营可在后台配置营销活动，并能看到销售/利润/汇率损益/库存周转的核心报表。

---

## 4.4 跨阶段收口建议（上线前）

- 多平台渠道适配：阶段 2 的 `channelAdapter` 由 mock 替换为 Amazon / TikTok Shop / Shopify 等真实 API（独立迭代，不在本阶段强约束）。
- 面向消费者的商城前端（H5/小程序/独立站）：单独仓库或子包，复用本系统后端 `/api/v1/shop` 与 `/api/v1/workflow`。
- 自动化：商品发布、库存同步、订单拉取等可用 `automation_update` 设定周期任务（如每日汇率快照、库存对账）。

---

**阶段 4 完成标准清单**

- [ ] 折扣/优惠券可配置（多语言活动名）
- [ ] 销售报表可按渠道/国家/类目/时间聚合
- [ ] 利润报表含汇率损益（基于快照）
- [ ] 库存周转报表可用
- [ ] 前端全量验证 + 后端验证全绿
- [ ] 已提交 `feat(shop):` commit
