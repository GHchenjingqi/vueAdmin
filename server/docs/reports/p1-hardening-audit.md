# P1 加固批次审计报告（审计覆盖 / 扫描器治理 / 券边界 / 口径 / flake）

- 日期：2026-11-10
- 承接：`payment-terminal-reconcile-audit.md` §7、`order-terminal-gate-audit.md`（P0，已单独提交 `5bad1b9`）
- 本批覆盖待办 #3 #4 #5 #6 #7；P0（#1 #2）见 `order-terminal-gate-audit.md`
- 方法：测绘 → 实证跑红 → 最小修复 → 全量回归 → 精准提交

---

## 0. 范围与边界

测绘确认 `server/app.ts`、`shop/routes/index.ts`、`paymentService.ts`、`storefront/routes/index.ts`
等均为并行方 WIP。本批**全部改动落在干净区**，未对任何 WIP 文件做手术式拆分：
四个扫描器的注册点无需改动——把预占回收挂到**已经注册的支付对账扫描器**上，
既让 sweeper 真正上线，又避免碰 `app.ts`。

---

## 1. 最重要发现：预占 sweeper 从未在生产注册（高危）

`releaseExpiredReservations()` 在全仓库**只有测试调用**，`app.ts` 的四个扫描器注册块
（工作流超时 / 支付对账 / 订单邮件 / 积分过期）没有任何一处调用它。

后果：TTL 到期的 `active` 预占记录永远不会被释放，`inventory.locked` 与
`coupon_redemptions` 持续累积，可用库存被幽灵占用、限量券名额被永久吃掉。
历轮报告一直把 sweeper 当作「已在运行的四条关闭路径之一」来讨论，属于治理盲区——
`order-close-release-audit.md` 验证了它「释放得对不对」，却没人验证「它到底有没有被调度」。

### 先证伪一项历轮残留

历轮报告反复列「多租户 Webhook 的 ambient tenant 兜底 1」。本批核实
`storefront/middleware/siteContext.ts:71` 已对所有 Webhook/前台请求执行
`runInTenant({ tenantId: site.tenantId }, () => next())`，
因此 `credentialService.resolveGatewayConfig` 的 `getTenantContext() ?? 1`
**只在非 HTTP 上下文（扫描器 / 内部调用）才可能兜底**，HTTP 链路无此缺陷。
该残留应从清单中撤销；真正需要治理的是扫描器侧，本批已统一。

### 跑红证据（`scanner-governance.test.ts`，4/4 全红）

| 用例 | 修复前 |
| --- | --- |
| S1 | 过期预占 + 券流水放 4s 无人处理，`waitFor` 超时（扫描器不驱动 sweeper） |
| S2 | 两个租户的过期预占都保持 `active` |
| S3 | `pendingResourceTenantIds is not a function`（旧枚举只看 `order_payments`） |
| S4 | 对账关单成功但同租户预占仍 `active` |

### 修复

- `paymentReconcileService.ts`：新增 `pendingResourceTenantIds()`，从
  `order_payments(initiated/failed)` **与** `shop_inventory_reservations(active)`
  两表取 `DISTINCT tenantId` 并集——只从支付单据枚举会漏掉「建了单但从未创建
  支付会话」的订单，那类预占永远没人扫。
- `startPaymentReconcileScanner` 升级为**「未支付订单资源回收」统一扫描器**：
  同一 tick 内按租户先 `reconcilePayments()` 再 `releaseExpiredReservations()`，
  两个子任务独立 try/catch 失败隔离；`inFlight` 标志防同进程重入。
- **停止函数改为可等待**（`() => Promise<void>`）：原先 `clearInterval` 后仍有
  在途 async tick 与测试清理/优雅关闭抢锁，实测触发 `ER_LOCK_DEADLOCK`。
  现在 `await stop()` 会等在途 tick 结束，生产优雅关闭也受益。
- 另三个扫描器统一口径：邮件扫描器按租户失败隔离；工作流超时扫描器补
  `timer.unref()`；sweeper 单条失败由静默 `catch {}` 改为 `logInfo` 留痕。

---

## 2. P1-3 审计覆盖与查询过滤

- **27 个高敏入口接入 `recordAdminAction`**（6 个 controller，字节级脚本插入，
  保持各文件原行尾）：价格 upsert/删除/汇率快照、评价审核/问答、
  类目 / 品牌 / SPU CRUD 与状态流转、营销活动 / 优惠券 / 搭配购 CRUD。
  全部只记 `action` 与 `req.params` 中的 ID，**不落请求体、不落金额/凭据**。
- **两处扫描器关闭动作**补 `system` 审计：`order.reconcile_closed`、
  `order.reservations_expired_released`（后者只记释放数量与 ref 数）。
- **查询接口补 `actorId` / `actorType` 过滤**：`AuditQuery` → `listByEntity` where
  → `auditLogController.listAuditLogs` 透传，与既有 `action` / 时间范围组合。
- `A2` 用可执行矩阵断言 6 个 controller 的 27 个 action 全部存在，防后续新增入口漏埋。

> **前端查询页现状**：全仓库 `src/` 下**没有任何** `/shop/audit-logs` 消费方，
> 历轮报告里的「审计查询页」并不存在。本批补了后端过滤能力 + `src/api/shop.ts`
> 的 `adminAuditApi.list()` 类型化封装，但**没有造一个无菜单、无路由的孤儿页面**。
> 真正上线页面需要菜单种子 + 动态路由 + i18n 全套，属产品侧需求，见 §8。

---

## 3. P1-5 券治理剩余边界

- **percent 券 0–100 上界**：`createCouponSchema.partial()` 依赖 ZodObject，
  挂 `.superRefine()` 会破坏 `.partial()`，故在 service 层用
  「本次提交值 + 库中现值」合并后校验 `assertCouponValue`。
  `B1` 覆盖创建、只改 value、只改 type（库中 value 合法/越界）四条路径。
  `evaluateCoupon` 本就把折扣封顶到小计，此项是配置口径而非资金漏洞。
- **删除事务行锁**：`deleteCoupon` 改为单事务内
  `coupons FOR UPDATE` → `coupon_redemptions FOR UPDATE`（间隙锁阻止并发
  `redeemCoupon` 插入同券流水）→ 无流水才 destroy，消除「查完再删」窄窗口。
  配套迁移 `20261110_000090_add-coupon-redemption-coupon-index.ts` 新增
  `(tenantId, couponId)` 索引，否则 `FOR UPDATE` 会退化成整表间隙锁、
  阻塞所有券的并发核销。**迁移已在本地 `npm run migrate` 应用，其它环境需执行。**
- **前端字段闭环**：`CouponList.vue` 的 `#column-usedCount` 仍渲染后端已不返回的
  `row.totalCount ?? '∞'`（上一轮遗留 bug），改为 `row.usageLimit || '∞'`，
  并新增「用量上限」列；`zh-CN.json` / `en-US.json` 补 `usageLimit` 文案。
- **提交钩子触发的既有问题**：lint-staged 对改动文件跑全量 `eslint --fix` 时，
  `CouponList.vue` 暴露 14 个既有 `no-undef`（Vue API 依赖自动导入、未显式 import），
  首次提交被 pre-commit 拒绝。按「不跳过 hook」纪律补了一行
  `import { computed, onMounted, reactive, ref } from 'vue'`，
  同时消掉该文件全部 14 个 `vue-tsc` 同类错误；prettier 复核 diff 仅此 2 行。

---

## 4. P1-6 两个业务口径：复核后**保持现状**并固化为护栏

| 口径 | 结论 | 依据 |
| --- | --- | --- |
| 后台取消 `paid` 订单是否退券 | **不退**。已支付订单预占为 `committed`，`cancel` 的 `marked > 0` 门槛不会触发；退券应走独立退款链路，不在 `cancel` 放口子 | `C2` 护栏测试：paid + 券流水 + committed 预占，取消后流水与 `usedCount` 均不变 |
| 已发券是否可改权益（value/type/currency） | **允许**。核销流水存 `discountCents`/`couponCode` 快照，金额对账不受影响；仅券定义与历史快照分裂 | `C1` 护栏测试：改 value 后历史流水快照仍为原值 |

两项均属业务决策，本批**未改变行为**，只把现状写成可执行断言，避免后续被无意改动。
若业务要求变更，需显式指示后再改。

---

## 5. P1-7 消除 `shopPhases` 慢查询 flake

根因测绘（非生产缺陷）：用例固定 `TID = 1`，与全局共享数据同租户，
订单/流水随运行轮次累积；`analyticsService.salesReport` 无日期范围时全表扫 +
`ShopOrderItem` 大 IN + 逐单 `ShopRateSnapshot` 查询，实测从历轮 7.9s → 8.9s → 11.1s
逐步劣化，撞上 vitest 默认 5s。

处理：给该用例单独 `30_000` 超时并写明原因；**不改报表聚合口径、不动资金计算**
（那是独立的性能优化需求）。全量回归本批首次达成 **零 flake**。

---

## 6. 验证

| 项目 | 结果 |
| --- | --- |
| `scanner-governance.test.ts` | **4/4**（修复前 4/4 跑红） |
| `p1-hardening.test.ts` | **7/7**（A1–A3 / B1–B2 / C1–C2） |
| 前序回归 | `order-terminal-gate` 6/6、`payment-terminal-reconcile` 6/6 |
| 全量后端 | **931 passed / 931，1 failed → 0**，零 flake |
| `server tsc --noEmit` | **0 错误** |
| 前端 `vue-tsc` | **本轮触及的 `CouponList.vue` / `src/api/shop.ts` 为 0 错误**；全库仍有 `WorkflowInstance.vue` / `WorkflowList.vue` 等文件的既有 auto-import 错误，与本轮无关 |

> 本批以加固验证与口径护栏为主：A1/A2/A3/B1 在改动前按代码路径必然失败
> （过滤参数被忽略 / 源码无埋点 / 无审计 / 越界值被接受），
> 未逐项留存跑红快照；P0 与 P1-4 两批已完整跑红坐实。

---

## 7. 并行方边界

本批所有改动文件均为干净区，`git diff` 关键词扫描确认**零 WIP 混入**。
`app.ts` / `shop/routes/index.ts` / `paymentService.ts` / `membershipService.ts` /
会员与营销邮件 WIP 全程未改、未暂存、未代提交。上一批 P0 的 WIP 拆分已还原
（`paymentService.ts` 工作区 diff 只剩并行方 14 行会员积分）。

---

## 8. 残留与运维项

1. **前端审计查询页仍不存在**：需菜单种子 + 动态路由 + i18n + 页面，
   后端接口与 `adminAuditApi.list()` 已就绪；建议单独立项。
2. **迁移待执行**：其它环境部署需 `npm run migrate` 应用 `000090` 索引，
   否则删除事务的 `FOR UPDATE` 会锁整表。
3. **扫描器统一治理未彻底合并**：工作流超时 / 订单邮件仍是独立定时器，
   本批只统一了失败隔离与 `unref`；间隔、重试上限、告警阈值尚无统一配置面。
4. **通用兜底审计未做**：本批是逐入口精确埋点，新增高敏入口需同步补埋点
   （`A2` 矩阵可防回归，但不能自动覆盖）。若要「新增路由自动留痕」，
   需引入路由级中间件，会与 `shop/routes/index.ts` 的 WIP 冲突。
5. **报表性能**：`analyticsService` 的逐单汇率快照 N+1 与全表聚合仍在，
   本批只消除了测试噪声；如需根治建议改为单次批量预取快照 + 按日期范围分页。
6. 既有残留不变：生产 `PAYMENT_CREDENTIAL_SECRET` ≥32 字符并与 `JWT_SECRET` 解耦、
   四套网关商户凭据待申请后后台填入、历史孤儿券流水 DBA 核查、
   反代 `trust proxy`/XFF、上线首轮动态租户枚举会处理历史脏单据。
7. `CouponList.vue` 的 `validPeriod` 列 label 误用 `t('common.operation')`（既有 UI 文案
   bug），本批按最小改动未顺手扩散。

---

## 9. 下一轮候选

- 按 §8.1 落地前端审计查询页（含 action / actor 过滤与分页）。
- 按 §8.3 做扫描器统一配置面与告警阈值；按 §8.5 优化报表聚合 N+1。
- 引入路由级通用审计中间件（需与并行方协调 `shop/routes/index.ts` 边界）。
- 上线前运维清单：凭据后台填入、密钥解耦、outbox 与孤儿券流水清理、六项网关运维配置。
