# 外部通知并发幂等审计与修复

> 2026-11-06 16:36 · 性质：只读审计 → 写库实证复现 → 修复 HEAD 干净服务 → 回归
> 不代勾任何门禁任务行；未修改、未暂存并行方 WIP 文件。

## 1. 结论

本轮开局复核：远端无新提交（0/0），P5 核心五个文件仍全部 UNTRACKED，
3014 `/checkout` 仍 500、4015 仍 502 —— B 线与 E2E 两个触发条件均未解锁。
故转做 HEAD 干净模块的实证审计，坐实并修复 **2 个「外部通知重复发送」缺陷**：

| # | 位置 | 缺陷 | 修复前实测 |
| --- | --- | --- | --- |
| 1 | `storefront/services/subscriptionService.ts` · `notifyRestock` | 到货通知并发重复 | 并发两次返回同一收件人 **2 次**（`unique=1`） |
| 2 | `shop/services/orderMailService.ts` · `drainOutbox` | 订单邮件并发重复发送 | `providerCalls=2`、两次均报 `sent=1`，库里仅一行 `attempts=1` |

两者同属「先查后改无 CAS + 外部副作用不可回滚」：数据库状态被后写者覆盖，
但外部邮件/通知已实际发出，账务与实物不一致。与 15:25 修复的
`refundService` 死锁重复调用退款通道是同一类缺陷的不同实例。

## 2. 缺陷 1：到货通知重复

**根因**：`notifyRestock` 先 `findAll({ status: 'waiting' })`，再按 `id IN (...)` **无条件**
批量改为 `notified`，最后无条件返回全部 `subs`。两个 worker 同时查到同一批 waiting 行时，
双方 `update` 都成功、都返回同一批收件人；顺序重放正常（状态已是 notified），
因此只在并发窗口暴露。

**复现**（独立租户 987660，1 条 waiting 订阅）：

```
CONCURRENT_NOTIFY={"first":1,"second":1,"total":2,"unique":1}
SEQUENTIAL_REPLAY={"returned":0}
```

**修复**：改为逐行条件更新认领，只把 `waiting → notified` 实际生效（`affected === 1`）的行
加入返回列表；where 同时带 `tenantId` / `skuId` / `status: 'waiting'`。

**复验**：`{"first":1,"second":0,"total":1,"unique":1}`，顺序重放 `0`，行状态 `notified`。

**权衡**：由 1 次批量 UPDATE 变为 N 次单行 UPDATE（N = 等待订阅数），换取并发正确性；
到货订阅量级通常很小，且省去行锁/事务与库存补货钩子嵌套的风险。

## 3. 缺陷 2：订单邮件重复发送

**根因**：`drainOutbox` 扫描 pending/failed 行后直接 `await provider(...)`，
发送成功才 `row.update(status='sent', attempts+1)`。两个 worker 同时扫到同一行时，
外部邮件已各发一次，而 `row.update` 相互覆盖，最终只留 `attempts=1`。

**复现**（独立租户 987661，1 条 pending outbox，注入计数 provider）：

```
DRAIN={"providerCalls":2,"r1":{"scanned":1,"sent":1},"r2":{"scanned":1,"sent":1}}
ROWS=sent/attempts=1
```

**修复**：发送前用 `attempts` 做 CAS 抢占 ——
`UPDATE ... SET attempts=N+1, nextAttemptAt=... WHERE id=? AND tenantId=? AND attempts=N AND status IN ('pending','failed')`，
只有 `affected === 1` 的 worker 进入 provider；成功/失败分支改为按 id 条件更新，
不再写回陈旧实例。发送口径不变（仍只读出库固化的 subject / bodyText 快照，
不重渲染、不读站点币种配置）。抢占时同步落 `attempts` 与退避时间，
进程在发送中崩溃也会按退避重投。

**复验**：`{"providerCalls":1,"r1":{"sent":1},"r2":{"sent":0}}` / `ROWS=sent/attempts=1`。

## 4. 回归验证

| 项 | 结果 |
| --- | --- |
| 新增 `server/__tests__/notification-idempotency.test.ts` | **8/8**（并发去重 3 例、发送口径 / 失败 / 上限 / 运营重发 5 例） |
| 既有 `storefront-order-mail.test.ts` + `storefront-subscription.test.ts` | **18/18** |
| 后端全量（两轮） | **681/681（75 文件）× 2** |
| `tsc -p server/tsconfig.json --noEmit` | 0 错误 |
| `node scripts/check-doc-links.mjs` | 67/67 |

全部数据使用独立租户 987662 + 随机单号/令牌，与并行方 dev 数据零共享。

## 5. 附带核查：模型唯一约束落库（阴性结论）

用 `information_schema.STATISTICS` 实查 dev 库得 **128 个唯一索引**，
逐一比对模型层 **8 处** `unique: true` 声明：

- **7 处已落库**：`shop_articles.uniq_articles_tenant_site_slug`、`carts.uq_carts_token`、
  `cart_items.uq_cart_items_cart_sku`、`customers.uq_customers_tenant_email`、
  `customers.uq_customers_tenant_referral_code`、`order_payments.uq_pay_provider_ref`、
  `order_payments.uq_pay_session`。
- **唯一缺失**：`referral_commissions.uq_referral_tenant_order`，即已登记的 P5-T07 缺陷，
  修复预案在 `docs/patches/p5-fix-readiness.patch` 的 hunk C，本轮不重复处理。
- `inventory` 无 `(tenantId,skuId,warehouseId)` 唯一索引（780b4ae 已登记：
  间隙锁意外起到串行化作用，不能贸然去掉）。

结论：**未发现新的「模型声明未落库」同类缺陷**，该系统性风险面收敛。

## 6. 未纳入 / 残留风险（不代改）

| 项 | 状态 | 原因 |
| --- | --- | --- |
| outbox 的 ABA：运营 `retryMail` 在 drain 期间把 `attempts` 清零，旧值重现可让另一个 worker 再次认领同一行 | **残留** | 彻底修需独立 claim token / 版本号列（新增迁移），且 `status` ENUM 无 `sending` 态；属架构/迁移决策，本轮按最小改动只做 attempts CAS |
| 「发送成功但状态更新失败」仍会重投（at-least-once） | **设计取舍** | 外部 SMTP 不可回滚；exactly-once 需 ESP 侧幂等键，属外部系统契约 |
| `notifyRestock` 逐行 UPDATE 的 N 次开销 | **可接受** | 等待订阅量级小；未来可改独立 claim 列优化 |
| CI `on.push.branches` 不含 `master_shop` | **待 CI 负责人** | 门禁接线改动，本会话不擅自扩大范围 |
| `uq_referral_tenant_order` / `inventory` 组合唯一索引 | **已有预案** | 前者随 P5 批次提交后应用就绪补丁，后者需环境确认 |

## 7. 零残留声明

三个临时复现/核查脚本已从 `.box-agent-scratch/` 删除，自建数据
（租户 987660 / 987661 / 987662）已清理；本轮未触碰并行方 WIP 文件，
提交只包含 2 个服务文件、1 个新增测试文件与本报告，未夹带计划文档混合版。

---

*修复与门禁状态变更须由各责任方在提交后回填；本报告不代勾任何任务行。*
