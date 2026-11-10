# 支付单据终态扫描器发现式审计报告

- 日期：2026-11-10
- 审计对象：`server/modules/storefront/services/paymentReconcileService.ts`
  （`reconcilePayments` / `startPaymentReconcileScanner`）
- 方法：先写实证测试跑红坐实 → 最小修复转绿 → 相邻回归 → 全量后端回归 → 类型检查
- 提交：`payment-terminal-reconcile.test.ts` + `paymentReconcileService.ts` + 本报告

---

## 0. 选题与边界

上一轮「订单关闭路径资源释放收口」（`order-close-release-audit.md`）验证了**关闭动作本身**
会不会释放库存与优惠券，并在报告 §5.1 / §7 明确点名两个未决方向：

> `payment.failed` 路径仍保留券占用……`reconcilePayments` 只扫 `status='initiated'` 的单据，
> 失败单据不会再被关单 → 若用户放弃，这类券占用会长期残留。
> 建议后续把 `failed` 且超时的单据纳入对账关单，或给订单加终态扫描。

本轮据此把**「谁决定一笔支付单据已经终态」**单独拉出来审计。这是历轮从未并排验证过的一层：
以前只把 `reconcilePayments` 当作「关单并释放资源」的工具函数，没有验证它在
多支付单据、多租户、批次受限、下游失败等真实运行条件下的判定是否安全。

**边界**：本轮只改 `paymentReconcileService.ts`（+148/−37）与新增 1 个测试文件。
`paymentService.ts` / `checkoutService.ts` / `app.ts` / `shop/routes/index.ts` 均为并行方 WIP，
本轮**未改、未暂存、未代提交**；因此 §5.1 的订单终态联动只给出结论与方案，不越界实施。

---

## 1. 实证方法

新增 `server/__tests__/payment-terminal-reconcile.test.ts`，独立租户 `987750` / `987751`，
每例 `beforeEach` 清理，真实 MySQL（非 mock 数据库）：

- 自建订单 / 支付单据 / 优惠券与核销流水 / 库存行与预占记录；
- 通过把 `createdAt` 推到 31 分钟～25 小时前驱动超时与硬上限判定；
- 仅对**外部网关**做局部替身：`gatewayRegistry.getGateway('paypal')` 返回一个
  `query() → null` 的桩，用来确定性复现「网关查单长期无结果」，避免真实网络调用；
- T6 用 `reservationService.releaseReservation` 的一次性 reject 注入「库存释放失败」。

**修复前 6/6 全部跑红**，失败信息即缺陷证据；修复后 6/6 转绿。

---

## 2. 发现的缺陷

| 编号 | 严重度 | 现象（修复前实测） | 根因 |
| --- | --- | --- | --- |
| T1 | **高危** | 已支付订单（`paymentStatus=captured`）存在一张残留的 `initiated` 支付单据时，对账关单把该订单的 `coupon_redemptions` 删除、`coupons.usedCount` 从 1 回退到 0（断言 `expected null not to be null`） | 关单无条件按 `orderNo` 调 `releaseCoupon`，**不区分订单是否已成交**；限量券名额被重复发放 |
| T2 | 中危 | `failed` 支付单据放置 25 小时后，`reconcilePayments()` 返回 0，`pay.status` 仍为 `failed`，券流水与库存预占永久悬挂 | `where` 只筛 `status:'initiated'`，失败单据永远不在扫描集合内 |
| T3 | 中危 | 用户已换通道重试（同单另一张 `initiated` 在途），旧失败单据被关单时会回退仍在途订单的券；修复前旧单据甚至根本不会被关 | 同样缺「同单其它在途支付单据」判定；若只补 T2 的扫描范围而不加守卫，会直接制造这个新缺陷 |
| T4 | 中危 | 进程级扫描器启动后，租户 `987750` / `987751` 的超时单据均保持 `initiated` | `startPaymentReconcileScanner` 在全局 ALS 无上下文时直接调 `reconcilePayments()`，`tid()` 兜底为 1 → **只跑 tenant 1** |
| T5 | 中危 | 60 张「查单返回空」的单据 + 1 张本可关闭的 mock 单据，连续两轮扫描后 mock 单据仍为 `initiated` | 单条 `findAll` 无 `order`、`limit: 50`；永远查不出结果的单据占满唯一批次，饿死其它单据 |
| T6 | 中危 | 注入库存释放失败后，单据已被标成 `expired`，预占仍为 `active`，且下一轮不会再被扫描 | 先 `row.update({status:'expired'})`，再 `.catch(() => null)` 静默吞掉释放异常；终态已落，重试机会被永久剥夺 |

> T1 是本轮最实质的发现：它**不是并发边缘问题**，只要用户换过支付方式 / 前端重复建过会话，
> 已成交订单就会在对账时被动失去券核销流水，直接影响优惠券用量口径与对账。
> T2 与 T3 是一组：只补扫描范围会引入 T3，必须同时加「订单级资源释放守卫」。
> T5 在真实网关（PayPal / 微信 / 支付宝 / 银联均实现 `query()`）下才会出现，
> 沙箱纯 mock 部署不会复现，属于「上线后才暴露」的类型。

### 一次被证伪的修复思路（留档）

T5 最初按「`order: [['updatedAt','ASC']]` + 每轮 touch `updatedAt` 让卡单轮转」修复，
复跑仍红。根因：MySQL `DATETIME` 默认**秒级精度**，同一轮扫描内 50 次 update 落在同一秒，
`updatedAt` 完全相同，排序不变、轮转失效。改为**按可关闭性分组取数**（A 可关闭候选独占一个
`BATCH`，B 仅能查单的在途候选用剩余名额），不依赖时间戳，单轮即可关掉可关闭单据。
以后在此库写「按时间戳轮转」的扫描器必须注意这一精度前提。

---

## 3. 修复（1 个生产文件，+148/−37）

**`paymentReconcileService.ts`**

1. **订单级资源释放守卫** `canReleaseOrderResources(row, tId)`：
   - 订单 `paymentStatus ∈ {captured, refunding, refunded}` 或 `status === 'paid'` → 不释放；
   - 同 `(tenantId, orderNo)` 下存在 `id ≠ 本单` 且 `status ∈ {initiated, authorized, captured}`
     的支付单据 → 不释放；
   - 两者任一命中时**仍把这张单据标为 `expired`**，只是不动库存/券。修 T1 / T3。
2. **`failed` 单据终态治理**：扫描集合扩为
   `initiated(超时)` ∪ `failed(创建时间 < 24h 硬上限)`。24h 即上一轮刻意保留券占用
   所允许的重试宽限期；过期后才关单并回退券/预占，修 T2，并顺带收敛
   `order-close-release-audit.md` §5.1 的残留。`failed` 单据不再主动查单。
3. **CAS 认领 + 失败回滚** `closePayment()`：
   `UPDATE ... WHERE id=? AND tenantId=? AND status=原值` 抢占终态（并发扫描器只有一个赢家）；
   `releaseReservation` / `releaseCoupon` 任一抛错则把 `status` 回滚为原值并记日志，
   下一轮可重试，修 T6。不再 `.catch(() => null)` 静默吞异常。
4. **分两批取数** `loadCandidates()`：按 `getGateway(provider)?.query` 动态算出
   「有主动查单能力」的 provider 列表；A 批（失败超宽限 / 无查单能力 / 已超硬上限）
   独占 `BATCH`，B 批（仅能查单且未到硬上限）用剩余名额，B 永不挤占 A，修 T5。
   查单补单语义保持不变：A 批中超过硬上限的真实网关单据仍会先 `query()` 再关单。
5. **扫描器多租户** `startPaymentReconcileScanner(intervalMs, tenantIds?)`：
   按 `order_payments` 中 `DISTINCT tenantId`（待终态单据）动态枚举租户，
   逐个 `runInTenant({tenantId}, reconcilePayments)` 驱动；`timer.unref()`，
   与上一轮 `startOrderMailScanner` 同口径。修 T4。

> 刻意保留：`reconcilePayments()` 自身仍用 `getTenantContext() ?? 1`，供后台/测试在
> 指定租户上下文内直接调用；多租户枚举只在进程级扫描器这一层完成。

---

## 4. 验证

| 项目 | 结果 |
| --- | --- |
| 新增实证测试 | **6/6 通过**（修复前 6/6 跑红） |
| 相邻回归（9 文件） | **68/68**：capture-reconcile / callback-order / channel-routing / order-close-release / storefront-coupon / order-state-race / core-fund-integrity / checkout-idem-race / webhook-binding-race |
| 全量后端 | **913 passed / 914**，唯一失败为历轮已知 `shopPhases.test.ts > 销售报表能聚合订单` 默认 5s 超时；`--testTimeout=30000` 复跑 **18/18 通过**，与本轮无关 |
| `server tsc --noEmit` | **0 错误** |
| 前端 | 本轮未改前端，无需 `vue-tsc` |

测试库为真实 MySQL；CAS、唯一流水、行锁与 `DISTINCT tenantId` 均为实证而非 mock 推断。

---

## 5. 残留与运维项（未代改）

1. **【高危·建议下一轮优先】关单不落订单终态，可绕过限量券**。
   `closePayment` 释放券占用后，订单仍是 `status='created' / paymentStatus='initiated'`；
   `paymentController.createSession` 只校验 `orderId` 合法，
   `paymentService.createSession` 只拦 `paymentStatus === 'captured'`，
   `applyGatewayEvent` 的 `SETTLED_PAYMENT_STATUSES` 也不含 `initiated/failed`。
   因此用户可在券被释放后对同一订单重新发起支付并成功付款，订单带着折扣快照成交，
   却没有 `coupon_redemptions` 流水、`usedCount` 不增长 → 限量券可无限复用。
   这是上一轮 E3（对账关单补 `releaseCoupon`）引入的联动缺口，本轮**发现但未修**：
   完整修复需同时给订单落终态并在建会话/事件落地两侧拒绝终态订单，
   而 `paymentService.ts` 当前是并行方 WIP，按纪律不越界。
   建议方案：关单时把订单置 `status='cancelled'`，并在
   `paymentService.createSession` 与 `applyGatewayEvent` 增加终态订单门禁；
   上线前可用下列 SQL 核查是否已有此类订单：
   ```sql
   SELECT o.id, o.tenantId, o.orderNo, o.status, o.paymentStatus, o.couponCode, o.discountCents
   FROM orders o
   LEFT JOIN coupon_redemptions r
     ON r.tenantId = o.tenantId AND r.orderNo = o.orderNo
   WHERE o.couponCode IS NOT NULL AND r.id IS NULL;
   ```
2. **并发窗口**：两张同订单支付单据由两个扫描器实例同时关单时，可能出现双方都在
   `canReleaseOrderResources` 里看到对方仍 `initiated` 而都跳过释放。单实例顺序处理不会触发
   （本轮 6 例均为顺序处理）。严格闭环需要把「订单级资源是否仍被占用」做成独立可重入的
   终态扫描，或给订单加行锁；未纳入本轮最小改动。
3. **释放失败只记日志**：回滚后会每轮重试，但无重试上限与告警升级；高频失败需监控侧配告警。
4. **B 批仍有延迟**：超过 `BATCH` 的查单候选按 `createdAt ASC` 排队，前面的卡单会推迟后面
   单据的「补单」时机（但不会永久饿死——到硬上限后自动进入 A 批）。如需严格公平可再加游标。
5. **动态枚举租户会扫到历史脏数据**：上线首轮会把所有租户中超时的 `initiated/failed`
   单据一并关单并释放资源，属预期行为，但建议上线前先看一眼数量。
6. 既有残留不变：`payment.failed` 宽限期内仍占券（有意为之）、sweeper 与 Webhook 的
   ambient tenant 口径、生产 `PAYMENT_CREDENTIAL_SECRET` 建议与 `JWT_SECRET` 解耦、
   真实扣款联调仍等用户申请凭据后在后台填入。

---

## 6. 并行方边界

本轮 3 个交付文件（1 个修改的生产文件 + 1 个新测试 + 1 份报告）均为本任务独有，
`git diff` 关键词扫描确认**零并行方 WIP 混入**。并行方的会员 / 营销邮件 / 顾客管理 /
checkout / quote / refundService / customerAuth / app.ts 积分过期扫描等 WIP
全程未改、未暂存、未代提交；提交后复核保留状态。

---

## 7. 下一轮候选方向

- **优先**：按 §5.1 做「订单终态 ↔ 支付单据终态」联动，堵住限量券绕过（需与并行方协调
  `paymentService.ts` 的 WIP 边界，或采用手术式 hunk 拆分）。
- 把 §5.2 的并发窗口做成独立可重入扫描器，顺带统一三个扫描器（工作流超时 / 支付对账 /
  订单邮件）+ 预占 sweeper 的间隔、失败告警、多租户口径。
- 补齐审计矩阵中「未补」的高敏操作（改价、评价审核、目录 CRUD）并给审计查询页加
  action/actor 过滤。
- 券治理剩余边界：`coupon-governance-audit.md` §5.1 的删除事务行锁 / 外键、
  §5.4 的 percent 券面额上界。
