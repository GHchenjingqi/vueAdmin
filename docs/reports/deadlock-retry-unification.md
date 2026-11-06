# 死锁重试实现统一收口

- 日期：2026-11-06 15:52
- 承接：`docs/reports/core-fund-integrity-audit.md` §3 与计划文档 §11 登记的「`isDeadlock` 一致性技术债」
- 范围：HEAD 中干净的 4 个写服务，零并行方 WIP 冲突

---

## 1. 问题

全仓曾有 **4 份私有死锁重试实现**，行为不一致：

| 服务 | 原判定 | 重试次数 | 退避 |
| --- | --- | --- | --- |
| `inventoryService.ts` | 原生 `ER_LOCK_DEADLOCK`/errno 1213 + 放宽 3 类 Sequelize 包装 | 5 | 指数退避 + 抖动 |
| `refundService.ts` | 仅 `name === 'SequelizeDatabaseError'` + 消息含 deadlock | 3 | 无 |
| `couponService.ts` | 同上 | 3 | 无 |
| `priceService.ts` | 同上 | 3 | 无 |

`inventoryService` 在上一轮已按实测加固；另外三个仍是窄判定。Sequelize 对 MySQL 1213 可能包装成 `SequelizeTransactionError` / `SequelizeTimeoutError`，或只透出 `parent.code`，窄判定会**漏判**导致重试根本不触发——在优惠券占用、退款、价格 upsert 三条并发写路径上表现为偶发 500。且重试无退避，高并发下容易反复相撞。

这些私有函数此前无法直接单元测试（不导出、只能通过真实事务间接触发）。

## 2. 修复

新增 `server/modules/shop/services/deadlockRetry.ts`，把 `inventoryService` 已验证的实现提为唯一来源并导出：

- `isDeadlock(err)`：优先读 `parent` / `original` 的 `code === 'ER_LOCK_DEADLOCK'` 或 `errno === 1213`；兜底按消息 + `SequelizeDatabaseError` / `SequelizeTransactionError` / `SequelizeTimeoutError` 三类包装判定；普通错误、无关 errno（如 1062 唯一键冲突）不误判。
- `withDeadlockRetry(fn, tries = 5)`：事务已回滚故重放安全；失败按 `10 * 2^i + jitter` 指数退避，避免高并发反复相撞。
- 模块注释写明前置约束：**事务内不得有不可重放的外部副作用**。`refundService` 上一轮已用 `invokeProviderOnce` 保证外部退款通道最多调用一次，因此提高重试次数不会重新引入双退。

4 个服务删除私有实现、改为 import；行为统一到 5 次 + 退避 + 原生错误码判定。`server/modules/storefront/services/cartService.ts` 有并行方未提交 WIP，且它用的是另一套基于消息正则的判定（含 1213），**本轮不碰**，见 §4。

## 3. 验证

| 项 | 结果 |
| --- | --- |
| 新增 `server/__tests__/deadlock-retry.test.ts` | 8/8 纯函数用例，无 DB 依赖 |
| 单元 + 相关回归（6 文件） | 52/52 |
| 后端全量（3 轮） | **673/673（74 文件）**，第 2、3 轮全绿 |
| `tsc -p server/tsconfig.json --noEmit` | 0 错误 |

纯函数用例覆盖：原生 `parent.code` / `original.errno`、三种放宽后的包装类型、普通错误/无关 errno/非对象不误判、死锁后重试成功、非死锁立即抛出、重试上限、自定义 `tries`、首次成功不多调用。

**首轮全量 1 例失败的定位**：`storefront-refund.test.ts` 的 `paidOrder()` 造单夹具抛 `SequelizeUniqueConstraintError`，栈在 `checkoutService.ts:166 ShopOrder.create`。实查迁移 `000023` / `000040`：`orders.orderNo` 与 `orders.idempotencyKey` 均为**全局唯一**索引，而单号由 `Date.now() + 随机` 生成，并发 worker 下会偶发碰撞。该文件单跑 3 次均 10/10，第二、三轮全量均全绿；`checkoutService.ts` 属并行方 WIP，不代改，见 §4。

## 4. 残留登记

| 项 | 说明 |
| --- | --- |
| `cartService.ts` 仍用私有重试 | 该文件为并行方 WIP（14 增 6 删），其判定基于消息正则且已含 1213，功能上不缺关键能力；待其提交后按同一模块收口，不夹带 |
| 造单号段全局唯一导致并发碰撞 | `genOrderNo()` 熵不足 + `orders.orderNo` / `idempotencyKey` 全局唯一（非租户内唯一），是既有测试 flake 源；修法涉及 `checkoutService.ts`（WIP）与可能的迁移，按约定不代改、不代决 |

## 5. 改动文件

| 文件 | 说明 |
| --- | --- |
| `server/modules/shop/services/deadlockRetry.ts` | 新增共享实现 |
| `server/modules/shop/services/inventoryService.ts` | 删除私有实现，改 import |
| `server/modules/shop/services/priceService.ts` | 同上 |
| `server/modules/shop/services/refundService.ts` | 同上 |
| `server/modules/storefront/services/couponService.ts` | 同上 |
| `server/__tests__/deadlock-retry.test.ts` | 新增 8 例 |
| `docs/reports/deadlock-retry-unification.md` | 本报告 |
| `shops/mds/storefront-execution-plan_v1.0.md` | §11 风险更新 + 变更记录 |
