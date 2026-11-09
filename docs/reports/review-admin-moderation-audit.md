# 商品评价 / 问答后台审核链补齐审计

- 日期：2026-11-09
- 分支基线：`c0f90a8`（`master_shop`）
- 范围：`shop` 后台审核服务 / 控制器 / 路由 / schema，`storefront` 侧零改动

## 1. 结论

坐实一个**功能断点**：C 端提交的评价与问答一律落 `pending`，而公开侧 `reviewService.listReviews` 只查 `approved`、`listQuestions` 只查 `answered`；修复前**全仓没有任何后台状态迁移实现**（`shop/routes`、`shop/controllers`、`shop/services` 中 `review` / `qa` 零命中）。即用户提交的内容永久不可见，评价审核、商家回答两条业务链路均无法闭合。

本轮补齐后台审核链，采用与 RMA 审批一致的 **CAS 条件更新**收口并发，公开侧代码一行未改，既有测试契约不回退。

## 2. 断点实证

| 证据 | 内容 |
| --- | --- |
| `storefront/services/reviewService.ts:76` | `submitReview` 写死 `status: 'pending'` |
| `storefront/services/reviewService.ts:158` | `listReviews` 固定 `status: 'approved'` |
| `storefront/services/reviewService.ts:229 / :255` | `submitQuestion` 写死 `pending`；`listQuestions` 固定 `status: 'answered'` |
| 全仓 grep | `ShopReview` / `ShopProductQA` 仅被模型定义、迁移、`reviewService` 与测试引用；admin 侧无路由、无服务、无控制器 |
| 新增用例 | 「pending 评价公开不可见」「pending 问答公开不可见」在补齐后台列表后可查到同一行 |

公开评价 / 问答列表**无缓存层**（`catalogService` / `cmsCacheService` 均无引用），因此审核动作不需要缓存失效，与 CMS 发布链不同。

## 3. 修复设计

新增 `server/modules/shop/services/reviewAdminService.ts` 与 `controllers/reviewAdminController.ts`，在 `shop/routes/index.ts` 注册 6 个端点：

| 端点 | 迁移 | 说明 |
| --- | --- | --- |
| `GET /shop/reviews` | — | status / spuId 过滤，id 倒序分页（默认 20，上限 100） |
| `POST /shop/reviews/:id/approve` | `pending → approved` | 公开列表随即可见、可被投票 |
| `POST /shop/reviews/:id/reject` | `pending → rejected` | 公开不可见 |
| `GET /shop/qa` | — | status / spuId 过滤，分页 |
| `POST /shop/qa/:id/answer` | `pending → answered` | 答案 / `answeredAt` / `answeredBy` 一并固化 |
| `POST /shop/qa/:id/hide` | `pending / answered → hidden` | 公开不可见；允许下架已回答内容 |

关键约定：

- **CAS 原子迁移**：期望旧状态进 `WHERE`（`status IN (...)`），以受影响行数判定胜负；0 行时回读同一租户行，区分 404（不存在 / 跨租户）与 400（状态不允许）。并发 `approve` / `reject`、并发 `answer` / `answer` 严格一方胜出。
- **租户隔离**：列表、迁移、回读全部带 `tenantId`（来自 `getTenantContext()`），跨租户调用返回 404。
- **答案不被后写覆盖**：重复回答 400，原答案与回答者保持不变。
- **回答者不可伪造**：`qaAnswerSchema` 只收 `answer`（1..2000 字），`answeredBy` 从 JWT `username` 注入，不接收请求体字段。
- **权限口径**：沿用 `authMiddleware`（与既有 `POST /shop/rmas/:id/approve` 一致），不擅自加严为 `requireAdmin`——客服角色能否审核属 G4-S2 权限矩阵决策。
- `hide` 允许从 `answered` 出发是刻意设计（下架已回答内容）；因此与 `answer` 并发时可能串行都成功、终态 `hidden`。测试改为断言「终态 ↔ 公开可见性一致、无状态回退、无半写入答案」，不把不同语义的两个动作误判为互斥。

## 4. 回归验证

| 检查 | 结果 |
| --- | --- |
| 新增 `server/__tests__/shop-review-admin.test.ts` | 16/16（独立租户 987711，跨租户对照 987712，结束后清理本轮数据） |
| 既有评价三文件（`storefront-review` / `review-verified-spoof` / `storefront-review-image`） | 31/31 |
| `tsc -p server/tsconfig.json --noEmit` | 0 错误 |
| 后端全量 / doc-links | 见 §6 补记 |

用例覆盖：pending 不可见→后台可查、审核后可见且汇总计入、重复审核 400、驳回不可见、并发 approve/reject 一方胜出、不存在与跨租户 404、列表过滤分页与非法状态 400、问答回答后公开可见且三字段固化、重复回答不覆盖、隐藏后不可见、并发 answer/answer 互斥、并发 answer/hide 一致性、重复隐藏 400、`markHelpful` 仅 approved（既有契约）。

## 5. 未纳入 / 残留（不代改、不代决）

| 项 | 状态 | 原因 |
| --- | --- | --- |
| 已通过评价的下架 / 复审路径 | **待业务口径** | 状态枚举仅 `pending/approved/rejected`，是否允许 `approved → rejected`、是否需要独立「下架」态，属审核规则决策；本轮 approve/reject 仅作用于 pending，与 RMA 契约一致 |
| 审核动作写入 X-T03 审计日志 | **未做** | 现有审计链面向订单/支付/库存/退款/文章；客服操作留痕是否纳入，随 G4-S2 权限矩阵一并确认 |
| 端点权限是否收紧为 `requireAdmin` | **待业务决策** | 沿用 RMA 的 `authMiddleware` 以不破坏客服履约；权限矩阵未定 |
| 审核驳回原因落库 | **待迁移决策** | `ShopReview` 无 `rejectReason` 列（RMA 有）；加列需新迁移 |
| 后台审核界面 | **未补** | 本轮交付 API 与测试；`src/views` 无评价管理页，界面属独立前端批次 |
| HTTP 端点级冒烟 | **未做** | 既有 admin 测试（含 `shop-rma-admin.test.ts`）均为服务层测试，本轮对齐该口径；路由挂载由 typecheck + 代码审查保证 |
| `shopPhases > 销售报表能聚合订单` 超时 flake | **既有 flake** | 历轮多次复现（并行负载下 >5000ms 阈值），单跑可过，按最小改动约定未改既有测试 |
| MySQL 3306 开机掉线 | **环境项** | 本轮 3306 正常监听（PID 4636）；无服务注册的根因待环境治理 |

## 6. 全量与门禁补记

（提交前回填）

## 7. 零残留声明

本轮仅新增审核服务 / 控制器 / 路由 / schema / 测试 / 报告，未修改 `storefront` 公开侧、未改模型与迁移、未改业务口径、未代勾门禁或签字。并行方 WIP 未触碰。
