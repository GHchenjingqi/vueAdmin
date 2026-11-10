# 订单终态 ↔ 支付单据终态联动审计（P0）

- 日期：2026-11-10
- 来源：`payment-terminal-reconcile-audit.md` §5.1 标记的高危残留
- 方法：实证跑红 → 最小修复转绿 → 全量回归 → 手术式 WIP 拆分提交

## 1. 缺陷（修复前 4/6 跑红，另 2 例为防误伤护栏）

| 用例 | 结果 | 说明 |
| --- | --- | --- |
| G1 | 红 `expected 'created' to be 'cancelled'` | 对账关单释放了券/库存，订单仍停在 `created / initiated` |
| G2 | 红 `promise resolved ... instead of rejecting` | 对 `cancelled / failed` 订单仍能 `createSession` 成功，前置断言已先证明正常订单可建会话，排除通道配置误判 |
| G3 | 红 `expected true to be false` | 对终态订单投递 `payment.succeeded` 仍能改单成功 |
| G6 | 红 `expected 'created' to be 'cancelled'` | 同订单两张单据并发关单后订单仍未终态 |
| G4 / G5 | 绿（护栏） | 已支付订单 / 重试在途订单不得被误伤，修复全程保持 |

**利用链**：G1 + G2 + G3 串起来即 `payment-terminal-reconcile-audit.md` §5.1 的
限量券绕过——券占用被释放后订单仍可支付，成交时带折扣快照却无
`coupon_redemptions` 流水、`usedCount` 不增长，同一张限量券可无限复用。

## 2. 修复

**`paymentReconcileService.ts`** — `closePayment` 重写为**订单行锁事务**：

```
事务内（orders 行 FOR UPDATE）
  ├─ CAS 认领本支付单据 status='expired'（并发扫描器只有一个赢家）
  ├─ 已结算订单 / status='paid'      → 只关单据，不释放、不落订单终态
  ├─ 同单仍有 initiated/authorized/captured 单据 → 只关单据（用户在重试）
  └─ 否则：把订单置 status='cancelled', paymentStatus='failed'
事务提交后
  ├─ releaseReservation + releaseCoupon（各自开事务，不能嵌套）
  └─ 任一失败 → 回滚单据终态，留待下轮重试（订单保持 cancelled，安全侧）
```

行锁同时闭环上一轮 §5.2 的**并发窄窗口**：无互斥时两个实例会互相看到对方
仍 `initiated` 而都跳过资源释放；串行化后第二个实例必然看到第一个的 `expired`。

**`paymentService.ts`**（17 行，3 个 hunk）：
- 新增 `TERMINAL_ORDER_STATUSES` / `assertOrderPayable`；
- `createSession` 查到订单后立即校验终态，409 `订单已关闭，无法发起支付`；
- `applyGatewayEvent` 查到订单后拒绝终态订单，`{ok:false,status:409}`，
  覆盖迟到回调与无历史支付记录（`prev=null`）的伪造 providerRef 场景。

> 刻意只在「确实释放了订单级资源」时落终态。已支付订单的残留单据、以及
> 用户正在重试的同单旧单据都只关单据、不动订单，避免把可成交订单误取消
> （G4 / G5 即为该约束的回归护栏）。

## 3. WIP 边界（手术式拆分）

`paymentService.ts` 是并行方 WIP（14 行会员积分）。流程：
`cp` 全量备份 → `git checkout HEAD --` 回基线 → 对**基线**与**备份**应用
完全相同的 3 处字节级替换（脚本保持各自 CRLF 行尾）→ 只提交基线版 →
把打过同样补丁的备份写回工作区。提交后 `git diff` 复核仅剩并行方 14 行 WIP，
零代提交、零丢失。

## 4. 验证

- 新增 `order-terminal-gate.test.ts` **6/6**（修复前 4 红 2 绿 → 全绿）；
  `payment-terminal-reconcile.test.ts` **6/6** 同步保持。
- 全量后端 **919 passed / 920**，唯一失败为历轮已知 `shopPhases` 报表聚合 5s
  超时 flake（见 P1 批次处理）；`server tsc --noEmit` **0 错误**。
- 测试库为真实 MySQL，订单行锁与事务串行化为实证而非 mock 推断。

## 5. 残留

1. 订单不存在时 `FOR UPDATE` 无行可锁，并发互斥退化为无锁；该场景属数据异常
   （孤儿预占/券流水），生产应由 DBA 侧巡检，见 `order-close-release-audit.md` §5.2 SQL。
2. 关单落 `cancelled` 后，若业务希望「超时订单可重新下单」需显式新建订单，
   不能复用原单（这正是本修复的意图）。
3. 释放失败时订单已 `cancelled` 而券尚未回退，窗口持续到下轮扫描成功；
   需监控侧对 `[reconcile] 订单资源释放失败` 日志配告警。
4. 凭据 Webhook 的 ambient tenant 兜底 1、其它扫描器治理见 P1 批次报告。
