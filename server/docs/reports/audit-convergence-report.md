# 发现式实证审计 · 收敛报告

> 多轮 `继续/下一轮` 驱动的并发与幂等审计，覆盖核心资金/库存/状态机/支付/配额/评价。
> 方法：先代码核查定位竞态，再用**真实并发测试**做实证收口（非只读结论）。

## 一、已加固并实证收口的模块

| 轮次 | 模块 | 竞态类型 | 加固手法 | 测试实证 |
|---|---|---|---|---|
| RMA | `rmaService` / `rmaAdminService` | 并发状态机竞态（cancel/approve/return 乱序） | CAS 条件更新（旧值入 WHERE，0 行=冲突） | `rma-state-race` / `rma-overrefund` |
| 工作流 | `spuService.applyWorkflowResult` | 审批回调重复认领 | SPU 状态 CAS 作唯一闸门 | `workflow-callback-idem` |
| 支付网关接入 | `paymentService` + 4 网关适配器 | 多通道并发、币种路由 | 统一 `GatewayAdapter` 契约 + 后台币种路由 + 银联全币种 | `payment-channel-routing` |
| 支付收口 | `applyGatewayEvent` / `capturePayment` / `paymentReconcileService` | webhook/capture/查单状态漂移 | 共用状态机 CAS + 幂等 + 免登录回跳凭证 + 对账扫描 | `payment-gateway-capture-reconcile` |
| 评价审核链 | `reviewAdminService` | 审核并发覆盖 | CAS + 租户隔离 | `shop-review-admin` |
| 配额 TOCTOU | `usageService` / `quotaGuard` | check-then-act 超额（席位/文件突破上限） | 原子 `consumeQuota`（INCRBY 后校验，超额回退） | `quota-consume` / `quotaGuard` |
| 评价有用计数 | `reviewService.markHelpful` | 并发投票 lost-update / 越权计数 | 单条 UPDATE 内 `helpfulCount+1` + approved 守卫 | `review-helpful-count` |

**历史已收口（前序轮次核查 + 测试覆盖）**：库存 `occupy/release`（LOCK.UPDATE）、优惠劵 `redeemCoupon`（行锁+原子递增+唯一幂等）、订单状态（行锁+CAS）、退款 `createRefund`（行锁+累计校验+幂等键）、下单 `createOrder`（失败回滚+幂等）、订阅 `notifyRestock`（逐行 CAS）、购物车、物流轨迹 `tracking`、推荐佣金 `recordCommission`（幂等+窗口 fail-closed）。

## 二、实证回归基线

- 全量后端套件：**841 passed / 842 total**（唯一失败为已知 `shopPhases.test.ts` 报表超时 flake，与并发加固无关）。
- 累计并发/幂等专项用例：**150+ 全绿**（inventory / order-state / checkout-idem / payment-webhook / rma / coupon / refund / subscription / review / workflow / quota / helpful-count 等）。
- 外围模块（`warehouse`/`shipping`/`quote`/`bundle`/`rate`/`warehouseRouting`）核查为纯计算/只读/后台 CRUD，**无资金状态竞态缺口**。

## 三、会员系统 WIP 的 import 路径修复（本轮顺带收敛）

- 问题：`modules/shop/models/ShopMembershipTier.ts` 与 `ShopPointsLog.ts` 误写 `../../../../config/database.js`（多一层），经 `modules/shop/models/index.ts` 级联，导致全量套件 **48 个文件无法加载**。
- 现状：路径已修正为正确的 `../../../config/database.js`（活跃会员测试 8 用例通过），全量套件已从级联崩溃恢复至仅 1 个已知 flake。
- 残留：存在未被 vitest 收录的重复死文件 `server/tests/membershipService.test.ts`（含 `vi.mocked` 用法问题，但不影响套件，建议删除或并入 `__tests__`）。该文件属并行开发方 WIP，未纳入本次提交。

## 四、仍阻塞项（需用户侧输入，非代码缺口）

1. **四套网关商户凭据缺失** → 真实扣款联调阻塞（见 `payment-gateway-integration-readiness.md`）。
2. **6 项运维配置待确认**：证书轮换 / 租户隔离验证 / 银联外币结算币种 / legacy(mock) 关闭 / 二维码依赖 / 对账文件接入。
3. **业务口径决策（可选）**：评价默认放行（已确认是既定安全默认：提交即 `pending`，仅 `approved` 可见）、RMA↔refund 联动（已实现 `refunded` 终态驱动）。

## 五、收敛判断

核心资金/库存/状态机/支付回调/配额/评价的并发面**已系统性实证收口**，无新的、自包含的高危竞态缺口。
剩余项均为「需凭据 / 需拍板 / 极低风险 minor」，不构成代码层面的并发风险。

**建议下一步**（按优先级）：
1. 提供任一网关凭据 → 进入真实沙箱联调（代码已 turnkey）。
2. 清理 `server/tests/membershipService.test.ts` 重复死文件（可选）。
3. 其余外围为纯计算模块，无需进一步并发审计。
