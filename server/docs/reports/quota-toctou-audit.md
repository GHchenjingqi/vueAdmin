# 配额并发竞态审计（TOCTOU）— 2026-11-10

## 问题
`modules/billing/middleware/quotaGuard.ts` 原实现使用 **check-then-act 非原子** 闸门：

1. `quotaGuard(metric)` 调用 `checkQuota(tenantId, metric)` → 只读 `used` 后判断 `used < limit`。
2. 放行后进入业务 handler，成功后再由 `userController` / `uploadController` 调用 `incrUsage(...)` 递增计数。

两步之间存在并发窗口：两个请求可**同时**通过 `checkQuota`（都读到 `used < limit`），再各自触发 `incrUsage` 递增，从而**突破配额上限**（席位/文件超额创建）。这是经典的 TOCTOU（Time-of-check-time-of-use）配额竞态。

- `incrUsage` 本身的 Redis `INCRBY` 是原子自增，问题不在它，而在「检查」与「递增」被拆成了两次独立调用。
- `experimentService` 经核查为纯确定性只读分桶、无状态写入，无此风险。

## 修复
将「检查 + 占用」合并为**单步原子操作** `consumeQuota(tenantId, metric, delta)`，作为唯一闸门与计数来源：

- **Redis 路径**：`INCRBY` 后校验；若 `cur > limit` 立即 `DECRBY` 回退并返回 `ok:false`。
  `INCRBY` 本身原子，超额者各自回退自身 `delta`，终态计数 = 实际放行数，不会超上限（无需 Lua 脚本，客户端无关）。
- **内存回退路径**（无 Redis，测试/单机）：用 per-key 异步互斥锁（`acquireLock`）把「读-改-写」串行化，杜绝并发 lost update。
- 新增 `releaseQuota` 用于请求失败回滚（按需调用）。

接线调整（消除双计）：
- `quotaGuard` 改用 `consumeQuota` 在**动作之前**原子占用，拒绝即 `402` 且**不计数**。
- `userController.create`：移除原 `incrUsage('users')`（席位占用已由 guard 完成）。
- `uploadController.uploadFile`：移除原 `incrUsage('files', ...)`；因文件配额按实际上传数量计费（批量 = `files.length`，单文件 = 1）且 `delta` 仅在解析后可知，改为在 controller 内用真实 `delta` 调用 `consumeQuota` 做原子闸门；路由上移除 `quotaGuard('files')`（避免按请求计 1 导致批量欠闸）。

## 测试
- `__tests__/quota-consume.test.ts`（新增，5 用例，内存回退路径）：
  - 限额内递增、超额拒绝且不计数、release 回滚、并发 50 占用（limit=5）最终恰好放行 5 绝不超额、批量 delta 超额回退。
- `__tests__/quotaGuard.test.ts`：mock 改为 `consumeQuota`，覆盖无租户 403 / 超额 402 / 放行。
- `__tests__/usageService.test.ts`：既有 5 用例保持通过。

## 已知取舍（非阻塞）
- `consumeQuota` 在动作**之前**占用，若下游业务失败（如 DB 错误）配额槽位会被乐观占用（轻微泄漏），属常见权衡；如需严格一致可后续在 guard 内对 `next` 错误做回滚（本提交未做，避免引入脆弱的 Express 异步错误拦截）。
- 内存回退路径的并发正确性依赖 per-key 锁；Redis 路径由 `INCRBY` 原子性保证（单测因 redis 被 mock 为 null 仅覆盖内存路径）。

## 影响面
- 涉及钱/席位计费的配额强制已无 TOCTOU 并发越权缺口。
- typecheck：本提交涉及文件 0 错误（仓库其余 8 处 TS 错误均在未跟踪的会员系统 WIP 文件中，非本提交范围）。
