# 订单关闭路径资源释放收口审计 — 2026-11-10

> 发现式实证审计 R-关闭轮。方法：写库实证跑红坐实 → 最小修复转绿；全程避开并行方 WIP。

## 1. 选题与范围

上一轮券治理报告 §7 的候选之一是「订单取消 / 退款释放券占用与 `usedCount` 的一致性全链路复核
（`cancelOrder` 之外的后台取消路径）」。本轮把它落实，并顺带发现同一组路径上的**库存重复释放**。

历轮 T-07 只验证了前台 `checkoutService.cancelOrder` 的「释放预占 + 释放券 + 改状态」三步闭环，
但系统里实际上有 **4 条独立的订单关闭路径**，从未并排核对：

| 关闭路径 | 库存 `locked` | 预占记录状态 | 券占用 | 订单状态 |
|---|---|---|---|---|
| 前台 `checkoutService.cancelOrder` | `releaseReservation` ✓ | released ✓ | `releaseCoupon` ✓ | cancelled ✓ |
| **后台 `orderService.cancel`** | 按明细 `inventoryService.release` ✓ | **仍 active ✗** | **未释放 ✗** | cancelled ✓ |
| **对账关单 `reconcilePayments`** | `releaseReservation` ✓ | released ✓ | **未释放 ✗** | payment expired（订单不变） |
| **TTL `releaseExpiredReservations`** | `inventoryService.release` ✓ | released ✓ | **未释放 ✗** | 不变 |

并行方 WIP 占用 `paymentService.ts` / `checkoutService.ts` / `quoteService.ts` / `routes/index.ts` 等文件，
本轮涉及的 3 个修复文件（`orderService.ts`、`reservationService.ts`、`paymentReconcileService.ts`）均不在 WIP 列表。

## 2. 实证：5 个用例全部跑红

新增 `__tests__/order-close-release.test.ts`，使用独立租户 `987730` + 每例独立 SKU / 券码。
`seed()` 造一笔「已建单、有 active 预占、有券核销」的待关闭订单，`locked=2`
（1 属于本单，另 1 属于同 SKU 的其它在途订单，用于观察误放）。修复前 **5/5 全部失败**：

| 编号 | 缺陷 | 跑红证据 |
|---|---|---|
| **E1 高危** | 后台 `orderService.cancel` 完全不碰 `coupon_redemptions` | 取消后 `ShopCouponRedemption` 流水仍在、`usedCount=1`。用户没买成却永久消耗限量券名额，且 `usedCount` 虚高会让券提前「用尽」 |
| **E2 高危** | 后台取消按明细手工减了 `inventory.locked`，**不把 `ShopInventoryReservation` 标为 released** | 取消后记录仍是 `'active'`（断言 `'released'` 失败） |
| **E2b 高危·超卖** | 上一条的直接后果：TTL sweeper 只扫 `status='active' && expiresAt<now`，到期后**再释放一次** | 取消后 `locked=1`（另一笔在途占用），跑 sweeper 后 **`locked=0`**（断言 1 失败，实测 `+0`）。即别的在途订单占用被误放，可造成超卖 |
| E3 中危 | `paymentReconcileService` 关单只 `releaseReservation` | 支付单据 `expired` 后券流水仍在、`usedCount=1` |
| E4 中危 | `releaseExpiredReservations` 只释放库存 | sweeper 返回 `released>0` 但券流水仍在 |

> E2/E2b 是本轮最实质的发现：它**不是并发边缘问题**，而是后台取消一次、sweeper 再跑一次就必然发生的
> 确定性重复释放。E1/E3/E4 则是同一根因（关闭路径未收口）在券侧的三种表现。

## 3. 修复（3 文件，+40/−4）

**`modules/shop/services/orderService.ts` — `cancel`**
- 在原有订单行锁事务内，把该 `orderNo` 的 `status='active'` 预占记录批量标为
  `released/releasedAt`（**只改状态，不再动库存**，因为库存已由原明细循环释放），修掉 E2/E2b；
- 事务提交后，若本次确有 active 预占被标记（`marked > 0`），动态 import
  `couponService.releaseCoupon(orderNo)` 回退券占用，修 E1。

**`modules/storefront/services/paymentReconcileService.ts` — 关单分支**
- 在 `row.update({status:'expired'})` + `releaseReservation` 之后补 `releaseCoupon(row.orderNo)`，修 E3；
  注释同步为「释放库存预占与优惠券占用」。

**`modules/shop/services/reservationService.ts` — `releaseExpiredReservations`**
- 收集本次成功释放的 distinct `ref`，循环后按 ref 调 `releaseCoupon`（幂等），修 E4；
- 用动态 import 避免 shop → storefront 的静态跨层依赖；失败只 `logInfo` 告警、不影响库存释放结果。

### 安全前提（刻意设计，防止误伤已支付订单）

- 支付成功路径 `paymentService.ts:271` 会 `commitReservation` 把预占标为 `committed`，
  而 sweeper **只扫 `active`**，所以 E4 的券释放不会碰已支付订单。
- 后台 `orderService.cancel` 与前台不同，**允许取消 `paid` 订单**（既有业务口径）。
  为避免把已成交订单的券释放掉，E1 的回收加了 `marked > 0` 门槛：
  已支付订单预占为 `committed`，不会被标记，因此不释放券；退款/退券应走独立退款链路。
  传统后台订单没有预占记录也没有券流水，`releaseCoupon` 本就是 no-op。
- `releaseCoupon` 自身开事务（内含 `SELECT ... FOR UPDATE`），故全部放在订单事务**提交之后**调用；
  它按 `(tenantId, orderNo)` 唯一流水幂等，多路径重复调用只会回退一次。

## 4. 验证

- 新增 `order-close-release.test.ts` **5/5 通过**（修复前 5/5 跑红 → 转绿即坐实证据）。
- 相邻回归 **46/46**：`storefront-coupon`(10) / `order-state-race`(12) /
  `payment-gateway-capture-reconcile`(8) / `payment-callback-order`(6) /
  `checkout-idem-race`(3) / `core-fund-integrity`(7)。
- 全量后端 **903 passed / 904 total**，唯一失败为历轮已知 `shopPhases.test.ts > 销售报表能聚合订单`
  超时（实测 11.1s > 默认 5s）；`--testTimeout=30000` 复跑 **18/18 通过**，与本轮无关。
- `server tsc --noEmit` **0 错误**。测试库为真实 MySQL，行锁与事务行为是实证而非 mock 推断。
- 本轮未改前端，无需 `vue-tsc`。

## 5. 残留与运维项（未代改）

1. **`payment.failed` 路径仍保留券占用**：`paymentService.handleWebhook` 的失败分支只
   `releaseReservation`，是有意保留（订单未关闭、用户可能换方式重试支付，此时释放券会让限量名额被别人占走）。
   但 `reconcilePayments` 只扫 `status='initiated'` 的单据，失败单据不会再被关单 → 若用户放弃，
   这类券占用会长期残留。建议后续把 `failed` 且超时的单据纳入对账关单，或给订单加终态扫描。
   （该文件属并行方 WIP，本轮按纪律未改。）
2. **历史孤儿券占用不会自动回收**：本轮修复只对**新的关闭动作**生效。上线前建议 DBA 核查：
   ```sql
   SELECT r.id, r.tenantId, r.orderNo, o.status, o.paymentStatus
   FROM coupon_redemptions r
   LEFT JOIN orders o ON o.tenantId = r.tenantId AND o.orderNo = r.orderNo
   WHERE o.status IN ('cancelled','closed') OR o.id IS NULL;
   ```
   确认后按 `releaseCoupon` 同口径 `DELETE` 流水并 `UPDATE coupons SET usedCount = usedCount - 1`。
3. **释放失败只记日志**：三处 `releaseCoupon` 失败均降级告警、不重试、不阻断关闭动作；
   高频失败需要监控侧配告警。
4. **后台取消 `paid` 订单的退券口径未定义**：本轮保守跳过；若业务要求「后台取消已支付订单也退券」，
   需在退款链路显式处理，不应在 `cancel` 里放开口子。
5. sweeper 与既有扫描器一样使用 ambient tenant 兜底 1（既有口径），多租户部署需按租户枚举。
6. 这三处关闭动作未接入 `recordAdminAction`（上轮审计矩阵「未补」项）。
7. 既有残留不变：生产 `PAYMENT_CREDENTIAL_SECRET` 建议与 `JWT_SECRET` 解耦、真实扣款联调仍需商户凭据。

## 6. 并行方边界

本轮 4 个提交文件（3 个 service + 1 个新测试）与 1 份报告，diff 关键词扫描确认
**零并行方 WIP 混入**；并行方会员 / 营销邮件 / 顾客管理 / checkout / quote / refundService 等
WIP 全程未改、未暂存、未代提交。

## 7. 下一轮候选方向

- 按 §5.1 审计支付失败单据的终态：把 `failed`/超时单据纳入对账关单，或新增订单终态扫描器。
- 把「未补」高敏操作（改价、评价审核、目录 CRUD）接入 `recordAdminAction`，审计查询页加 action/actor 过滤。
- 三个扫描器（工作流超时 / 支付对账 / 订单邮件）+ 预占 sweeper 的间隔、失败告警、多租户口径统一治理。
- 券治理剩余边界：`coupon-governance-audit.md` §5.1 的删除事务行锁 / 外键、§5.4 的 percent 券面额上界。
