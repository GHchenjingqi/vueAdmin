# ORDER_PAYMENT_STATE_MACHINE.md · 订单/支付/库存/退款状态机（P0-T14）

> 生成：2026-11-04 · 原则：订单状态与支付状态**分离**；每次变更写审计（`shop_order_events`）；非法跃迁拒绝（`ILLEGAL_TRANSITION`）；所有跨状态写入以幂等键去重。

## 1. 订单状态机（ShopOrder.paymentStatus 独立）

| 状态 | 进入条件 | 可执行动作 | 异常出口 |
| --- | --- | --- | --- |
| `pending_payment` | 订单创建（快照落库 + 库存预占成功） | 创建支付会话；取消 | 30min 未支付 → sweeper 关闭（TTL） |
| `processing` | 支付 captured（Webhook 或主动查询补偿） | 发货（ship） | — |
| `partially_refunded` | 部分退款成功 | 继续部分/全额退款 | — |
| `refunded` | 全额退款成功 | — | — |
| `completed` | 全部发货且无在途退款（sweeper） | — | — |
| `cancelled` | 用户取消 / 超时 / 币种切换处置（P5-T02） | — | 预占必须已释放 |
| `payment_failed` | 支付失败终态 | 重新发起（回到 pending_payment，同幂等键更新） | 超时关闭 |

- 非法跃迁示例：`cancelled → processing`、`refunded → processing` → 拒绝并审计。
- 幂等键：创建订单=`Idempotency-Key` 头；状态推进=事件 `event_id`（webhook）/`operation_id`（内部）。

## 2. 支付状态机（ShopPayment）

| 状态 | 进入条件 | 动作 | 出口 |
| --- | --- | --- | --- |
| `initiated` | 支付会话创建（providerRef） | — | — |
| `authorized` | 授权成功事件 | 捕获（自动或手动） | 授权超时 → failed |
| `captured` | 捕获成功事件 | 触发订单 processing + 库存实扣 + 邮件 | — |
| `failed` | 授权/捕获失败事件 | 释放预占、订单 payment_failed | 可重试 |
| `refunding` | 退款申请批准 | 调 provider.refund | 成功→refunded（全额）/部分回订单 partially_refunded |
| `refunded` | 退款成功事件 | 审计 + 邮件 | — |

- **回调乱序**：状态机只允许合法跃迁；迟到事件（如 authorized 晚于 captured）以当前状态 + 事件目标状态判定，乱序被接受为「已满足/忽略」，**绝不回退**。
- **重复事件**：`shop_webhook_events.event_id` 唯一，重复投递直接返回 200 幂等成功（T-03）。
- **币种不一致**：回调 currency ≠ 订单快照 currency → 审计 + 告警日志，不改单（P3-T12）。

## 3. 库存预占状态机（ShopInventoryReservation）

| 状态 | 进入 | 动作 | 出口 |
| --- | --- | --- | --- |
| `active` | 报价/下单预占成功（条件 UPDATE，事务） | TTL=15min | 到期 → sweeper 释放 |
| `committed` | 支付 captured | quantity-=q，locked-=q（同事务） | 终态 |
| `released` | 过期/取消/支付失败 | locked-=q（幂等：状态条件更新） | 终态 |

- 并发约束：`UPDATE shop_inventories SET locked=locked+:q WHERE skuId=:s AND warehouseId=:w AND quantity-locked>=:q` 影响行数=0 → `INSUFFICIENT_STOCK`；同订单重复预占以 reservationId 幂等。
- 跨 SKU 一致性：单事务逐行条件更新，任一行失败整体回滚（P3-T08）。

## 4. 退款状态流（P4-T05/T06 承接）

`requested → approved → received → refunded`（或 `rejected` 带 reason）；资格判断服务端执行（政策版本快照：窗口天数/状态要求/运费承担）；退款币种=原订单快照币种（T-09）。

## 5. 审计要求（X-T03 衔接）

每次跃迁写 `shop_order_events`（orderId、from、to、actor、reason、eventId/operationId、createdAt）；支付/退款/配置变更同理（`shop_config_changes`）。任一订单可回溯完整状态链。
