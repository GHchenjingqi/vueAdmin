# 发现式实证审计 · 后台高敏操作审计覆盖度 / 邮件投递 / 凭据接口加固

> 用户「1+2+3」：把上一轮给出的三个候选方向一次性全部执行。
> 方法：代码核查定位 → 写库实证测试跑红坐实 → 最小修复转绿 → 全量回归。

## 方向 1 · 后台高敏操作审计覆盖度普查

### 覆盖度矩阵（截至本轮）

| 后台高敏写操作 | 审计载体 | 状态 |
|---|---|---|
| 币种配置更新 / 回滚 | `config_changes`（谁/何时/从→到/回滚链） | 既有 |
| 功能开关 `featureflags` | `ShopConfigChange` | 既有 |
| 库存预留 / 释放 | `AuditLog` `inventory.reserved/released` | 既有 |
| 退款创建 | `AuditLog` `refund` | 既有 |
| 支付会话 / webhook / 查单 / capture | `AuditLog` `payment` | 既有 |
| 文章发布 / 上下架 | `AuditLog` `cmsService` | 既有 |
| **支付凭据更新** | `AuditLog` `payment.credentials_updated` | 上一轮 `f598d47` |
| **支付通道开关**（决定哪些收款入口可用） | `payment.channels_updated` | **本轮补齐** |
| **人工标记已支付**（可绕过真实收款） | `order.manually_marked_paid` | **本轮补齐** |
| **人工发货 / 取消订单** | `order.manually_shipped` / `order.manually_cancelled` | **本轮补齐** |
| **RMA 审核通过 / 驳回**（退款准入） | `rma.approved` / `rma.rejected` | **本轮补齐** |
| 评价 / 问答审核 | 无 | 未补（非资金链路） |
| 改价 / 汇率快照 | 无 | 未补（建议后续） |
| 优惠券 / 促销 / 组合增删改 | 无 | 未补（建议后续） |
| SPU/SKU 上下架、仓库/渠道/店铺 CRUD | 无 | 未补（建议后续） |
| 顾客状态 / 积分、会员等级、营销邮件 | 无 | **并行方 WIP，未触碰** |

### 补齐手法

- 在 `auditLogService.ts` 新增统一入口 `recordAdminAction(req, action, entityType, entityId, afterState)`：
  actor 取 `req.user`、tenant 取租户上下文；`afterState` 只由调用方传**字段名 / ID / 状态字面量**，绝不落请求体原文。
- 6 个高敏动作接入该入口；`paymentChannelsController.updateChannels` 记 `enabled` 与 `accountProviders`（只记 provider key，不记商户标识值）。
- 审计写入失败仅告警、不阻断主流程（沿用 `record` 既有语义）。失败路径（业务抛错时）不留痕，见残留 §5。

**范围说明**：本轮只补「资金入口 / 订单状态」级缺失，其余项在矩阵中显式列明而非顺手扩散；并行方正在开发的会员/营销邮件/顾客管理文件全程未改。

## 方向 2 · 通知 / 邮件链路幂等与重试

`orderMailService` 的 outbox 实现本身很完整（唯一去重 `(tenantId,type,orderId,dedupeKey)`、发送前 `attempts` CAS 抢占、有界指数退避、dead 终态、正文按订单快照固化）。实证仍坐实两处缺陷：

### E1 · 高危：outbox 没有任何自动驱动

`drainOutbox` **只**被 `orderMailController.drain`（后台手动 POST）调用；`app.ts` 注册了工作流超时扫描器与支付对账扫描器，却没有订单邮件扫描器（controller 注释写着「可挂定时任务」，但从未挂）。
后果：确认 / 发货 / 退款邮件入队后**永远不会自动发出**，5 次指数退避重试完全空转，除非运营手工调 API。
另：扫描器若按既有 `tid()` 口径跑在进程全局，会只处理 tenant 1。

**修复**：
- `orderMailService.startOrderMailScanner(intervalMs = 60s, tenantIds?)`：按 `nextAttemptAt` 周期投递；通过 `SELECT DISTINCT tenantId` 从 outbox 自身枚举**有到期待投邮件的租户**，逐个在 `runInTenant` 内 drain（`drainOutbox` 另有 tenantId WHERE 双保险），因此进程全局无租户上下文也不会漏掉非 1 租户。
- `tenantIds?` 供单租户部署/测试固定范围，避免扫到无关数据；`timer.unref()` 不挂住优雅关闭。
- 多实例并发由既有 `attempts` CAS 抢占保证同一封只发一次。
- `app.ts` 注册（默认每 60 秒），与既有扫描器同风格（`void` 动态 import + 启动失败仅记日志）。

### E2 · retryMail 可重投已发送邮件

`retryMail` 无条件把任意状态改回 `pending` 并清零 `attempts`。对 `sent` 邮件调用会让同一事件再次发信（外部邮件不可回滚），运营误点/重复点击即重复打扰客户。
**修复**：仅 `failed` / `dead` 可重投，其余返回 `null`；controller 404 文案改为「不存在或当前状态不可重投」。

## 方向 3 · 凭据 API 限流 + 生产密钥启动期校验

- `middleware/rateLimiter.ts` 新增通用 `checkKeyedRateLimit(key, windowMs, maxAttempts)`：先 `check`、放行则 `record`，与登录限流共用同一 Redis/内存 store（多实例共享计数）。
- `paymentChannelsController` 在**凭据 handler 内部**执行限流（避开并行方正在改的 `routes/index.ts`）：读 `60 次/分钟`、写 `20 次/15 分钟`，key 为 `rate:cred:{kind}:{tenantId}:{req.ip}`，超限抛 `AppError(429, RATE_LIMITED...)`，不泄露任何凭据信息。
- `bootstrap.ts` 启动期 `validatePaymentCredentialSecret()`：生产环境显式设置但长度 `< 32` 直接 `process.exit(1)`（弱密钥加密商户凭据等同明文）；完全未设置则**告警但不阻断**（兼容纯 env 部署），并提示「加密将复用 JWT_SECRET，轮换 JWT 密钥会让已存密文全部失效」。

## 验证

- 新增 3 个实证测试文件共 **13/13 通过**：`order-mail-scanner.test.ts`(5)、`admin-action-audit.test.ts`(4)、`credential-rate-limit.test.ts`(4)。
- 修复前 `order-mail-scanner.test.ts` **4/5 跑红**（扫描器不存在、自动投递失败、跨租户失败、sent 重投重复发信），转绿即为坐实证据。
- 全量后端套件 **888 passed / 889 total**，唯一失败为历轮已知 `shopPhases.test.ts` 报表聚合超时（7.9s > 默认 5s）；`--testTimeout=30000` 复跑 **18/18 通过**，与本轮无关。
- `tsc --noEmit` 全库 **0 错误**（工作树含并行方 WIP 时亦为 0）。
- 本轮未改前端，无需 `vue-tsc`。

## 残留与运维项（需用户侧输入/决策，未代改）

1. **历史遗留 pending 邮件会被补发**：扫描器默认动态枚举所有待投租户，生产首次启用时会把库里积压的 `pending/failed` 邮件按退避节奏补发（每租户每轮上限 50）。上线前建议清理/确认历史 outbox。
2. **限流按 `req.ip`**：反代后若未正确配置 `trust proxy` / `X-Forwarded-For`，所有请求可能归为同一 IP。需部署侧确认。
3. **失败路径未留审计**：业务抛错时 `recordAdminAction` 不执行（只记成功操作）；如需记录「尝试但失败」需扩展为响应钩子。
4. 矩阵中「未补」的高敏操作（改价/优惠券/评价审核/目录 CRUD 等）建议后续按业务优先级分批接入统一入口。
5. 多租户 Webhook 场景 `resolveGatewayConfig` 的 ambient tenant 兜底 1（既有口径，与 `paymentService.tid()` 一致）。
6. 生产密钥建议显式单独设置 `PAYMENT_CREDENTIAL_SECRET`（≥32 字符）并与 `JWT_SECRET` 解耦；密文损坏后的恢复路径见 `payment-credential-security-audit.md` §5。
7. 真实扣款联调仍是唯一业务阻塞：需申请到四套商户凭据后在后台填入。

## 下一轮候选方向

- 把「未补」的高敏操作按业务优先级接入审计，并给审计查询页加按 action/actor 的过滤。
- 优惠券 / 改价链路的并发与幂等复核（历轮只覆盖到报价快照与券占用）。
- 扫描器统一治理：把工作流、支付对账、订单邮件三个扫描器的间隔/失败告警/多租户口径收敛为同一套配置。
