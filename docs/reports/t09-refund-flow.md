# T-09 退款状态流 · 实测证据（2026-11-05）

> 前置：并行方 751df39（部分/全额退款状态流 + FOR UPDATE 行锁 + 死锁重试 + 幂等）+ a0721d3（trade-gate 断言）
> 实测方式：真实 HTTP（admin token）对订单 58（SO202611041819341551，USD 25980 分，paid/captured）

## 1. 部分退款

| 步骤 | 结果 |
| --- | --- |
| POST /orders/58/refunds `{amountCents:500, idempotencyKey, currency:USD}` | 201：`refundNo RF…93B, status=succeeded, amountCents=500, currency=USD` ✓ |
| 同 idempotencyKey 重放 | 返回**同一 id=29**（幂等）✓ |

## 2. 边界拒绝

| 用例 | 结果 |
| --- | --- |
| 超额（25481 分 > 剩余 25480） | **400 REFUND_EXCEEDS_PAID: 最多可退 25480 分**（服务端精确扣除已退 500）✓ |
| 币种不符（CNY ≠ 快照 USD） | **400 REFUND_CURRENCY_MISMATCH: 退款币种须与订单快照 USD 一致** ✓ |
| 终态后再退（paymentStatus=refunded） | **400 ORDER_NOT_REFUNDABLE: 当前支付状态 refunded 不可退款** ✓ |

## 3. 全额退款与终态

- 补退剩余 25480 分 → 201 `status=succeeded, amountCents=25480`
- 订单终态：`status=paid, paymentStatus=refunded` ✓（退款独立状态流，订单不回退）
- 退款币种全程 = 订单快照 USD（**T-09 验收：退款币种等于原订单币种** ✓）

## 4. 备注

- 过程中发现并触发并行方两个环境行为：①admin 单点登录会顶掉旧 accessToken（实测中 token 失效 401，重登即可）②captcha_enabled 在 settings 层被复位（已再次关闭，生产开启）
- 服务端状态机：captured → refunding/refunded 由 FOR UPDATE 行锁保护；幂等键唯一索引兜底并发
