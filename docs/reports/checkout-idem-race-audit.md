# 建单幂等并发竞态审计（checkoutService）

> 生成：2026-11-09 · 关联：P3-T10 建单 / T-07 优惠券 / G3 沙箱与异常路径 / G5 主链路回归
> 定位：发现式实证审计（无固定清单），针对**尚未审过的下单资金链路**。本轮只修一个根因，不扩大到架构改造。

---

## 1. 结论

`checkoutService.createOrder` 的幂等检查（`findOne(idempotencyKey)`）与 `ShopOrder.create` **非原子**，且券核销、库存预占都以「每次新生成的 `orderNo`」为幂等键。并发提交同一 `idempotencyKey` 时，两个请求各自占用一次券与库存，随后一个 `create` 撞 `uq_orders_idempotency_key` 抛 `SequelizeUniqueConstraintError` → 请求 500，且**失败方的券用量与库存预占不回滚**，形成孤儿占用（库存被白占至 30 分钟 TTL / sweeper 释放）。

已最小修复并回归全绿；未代勾任何门禁或任务行。

---

## 2. 缺陷机理（修复前代码路径）

| 步骤 | 请求 A | 请求 B |
| --- | --- | --- |
| 1 | `findOne(idempotencyKey)` → null | `findOne(idempotencyKey)` → null（A 尚未落库） |
| 2 | `createQuote` 服务端重算 | 同左 |
| 3 | `orderNo = A1`；`redeemCoupon(A1)` → `usedCount +1` | `orderNo = B1`；`redeemCoupon(B1)` → `usedCount +1`（**幂等键是各自 orderNo，互不排斥**） |
| 4 | `reserveItems(A1)` → `locked +qty`、写 active 预占 | `reserveItems(B1)` → 再 `locked +qty`、再写 active 预占 |
| 5 | `ShopOrder.create` 成功 | `ShopOrder.create` 撞唯一键 → 抛错 |
| 6 | 返回订单 | 原 `try/catch` **只包住 `reserveItems`**，create 的异常不触发回退 → B1 的券与预占全部残留 |

另一条同源路径：`pickWarehouse` 抛错时也发生在原 `try` 之外，已占用的券同样不回退。

---

## 3. 修复前写库实证（专属租户 987693）

新增 `server/__tests__/checkout-idem-race.test.ts`，`Promise.allSettled` 并发两个 `createOrder` 同 `idempotencyKey`，一次性快照全部指标：

| 指标 | 期望 | 带券并发实测 | 无券并发实测 |
| --- | --- | --- | --- |
| 订单数 | 1 | 1 | 1 |
| 成功 / 失败请求 | 2 / 0 | **1 / 1** | **1 / 1** |
| 失败异常 | — | `SequelizeUniqueConstraintError: Validation error` | 同左 |
| 券核销流水 | 1 | **2** | — |
| `coupons.usedCount` | 1 | **2** | — |
| 新增 active 预占 | 1 | **2** | **2** |
| 可用库存 | 基数 −1 | **基数 −2** | **基数 −2** |

顺序重放用例（先建单再重放）在修复前即通过，说明缺陷只在**并发窗口**暴露，既有顺序幂等测试覆盖不到。

---

## 4. 修复（最小改动，仅 `checkoutService.ts` 一个函数）

1. `import { UniqueConstraintError } from 'sequelize'`。
2. 把 `extractCountry` / `pickWarehouse` 循环 / `reserveItems` / `ShopOrder.create` 收进**同一个 `try`**，统一在 `catch` 里 `releaseReservation(orderNo)` + `releaseCoupon(orderNo)` 回退。
3. 仅当异常是 `UniqueConstraintError` **且**能按 `(idempotencyKey, tenantId)` 回读到首单时，回退后 `return toOrderView(winner, true)`（与顺序重放同语义、同 `accessToken`）；其它错误照抛。
4. **未改**：订单字段、状态集合、明细 `ShopOrderItem.create`、推荐佣金、返回结构、报价与幂等键生成逻辑。

副作用：顺带闭合了 `pickWarehouse` 抛错时的孤儿券占用，属同一根因（失败路径回滚不完整），未引入新功能。

---

## 5. 复验

| 项 | 结果 |
| --- | --- |
| 新增 `server/__tests__/checkout-idem-race.test.ts` | **3/3**（带券并发 / 无券并发 / 顺序重放回归保护） |
| 修复后快照 | `orders=1, fulfilled=2, rejected=0, redemptions=1, usedCount=1, activeReservations=1, available=基数−1` |
| 相关既有测试（串行） | 8 文件 **84/84**（优惠券 / 商务主链路 / 交易门禁 / 配送并发 / 支付回调 / 退款 / P5 就绪包） |
| 串行全量 | **81 文件 / 742 测试全绿**（上轮 80 / 739，正好 +1 文件 +3 例） |
| `npm --prefix server run typecheck` | 0 错 |
| ESLint | 0 error（`server/` 被根配置 ignore，仅作记录） |
| 文档链接 | 本轮新增报告的 5 条引用全部有效；全仓校验 106 条中有 2 条失效，均来自并行方 10:36 新增的未跟踪 `docs/patches/v3-sync-20261109.README.md`，与本轮改动无关（详见 §7.7） |

---

## 6. 阴性核查

全仓 `findOne({ where: { idempotencyKey, ... } })` + `create` 的幂等写入点仅两处：

- `server/modules/shop/services/refundService.ts`：已有 `UniqueConstraintError` → 回读首笔退款返回（既有防护，阴性）。
- `server/modules/storefront/services/checkoutService.ts`：本轮补齐。

其余幂等点（`couponService` 的 `(tenantId, orderNo)` 唯一 + 事务内 `FOR UPDATE`、`referralService` 唯一键回读、`subscriptionService` / `orderMailService` / `analyticsService` 的 CAS）不使用该模式。

---

## 7. 残留登记（如实记录，本轮不代改）

1. **订单与明细/佣金非同一 DB 事务**：`ShopOrderItem.create` 循环或推荐佣金写入失败时，订单已落库 → 留下无明细订单。属既有架构项，彻底修需把落库整体事务化，超出本轮最小改动范围。
2. **唯一索引为单列**：`server/migrations/20261104_000040_add-shop-orders-storefront-columns.ts` 建的是 `uq_orders_idempotency_key(idempotencyKey)`，非 `(tenantId, idempotencyKey)`。跨租户撞同一键时，回读按 `tenantId` 找不到 winner → 仍抛错。需新建迁移改复合索引。
3. **券限额=1 且并发同幂等键**：失败方在 `redeemCoupon` 阶段就因 `usageLimit` 抛 `COUPON_EXHAUSTED`，早于唯一键捕获，第二个请求返回 400 而非首单。不产生资损、不残留占位，但幂等语义不完整；彻底修需把幂等占位前移到报价之前。
4. **补偿式回滚非事务式**：`releaseReservation` / `releaseCoupon` 自身失败被 `.catch(() => undefined)` 吞掉，极端情况下仍可能残留占位。沿用既有补偿模式，建议后续接重试 / 告警。
5. **`genOrderNo()` 理论碰撞**：时间戳 + 4 位随机；不同幂等键撞同一 `orderNo` 会抛错（既有）。本轮修复在同幂等键碰撞时语义正确。
6. **测试数据**：修复前 3 次实证运行在专属租户 987693 留下若干 active 预占与测试订单，均为测试自建数据、不进生产；如需清理由 DBA 按 `ref` / `tenantId` 处理，本轮不自动删库。
7. **并行方 WIP 会让 CI 文档校验变红**：并行方 10:36 新增的未跟踪同步包 `docs/patches/v3-sync-20261109.README.md` 按 v3 平行库的相对根书写中间件与 mock API 路径，主仓实际应为 `shops/server/middleware/01-locale.ts` 与 `shops/server/api/[...mock].ts`。按约定本轮不修改并行方 WIP；该文档入库前需并行方补全 `shops/` 前缀，否则 CI 的 `Check doc links` 与 `gate-preflight --strict` 均会 FAIL。这是并行方待办，不是本轮引入的回归。

---

*本报告只登记修复与残留，不代勾门禁、不代替签字、不回填执行计划任务行。*
