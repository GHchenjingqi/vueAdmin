# RMA 超额退款漏洞审计与修复

> 2026-11-06 16:47 · 性质：只读源码审查 → 写库实证复现 → 修复 HEAD 干净服务 → 回归
> 不代勾任何门禁任务行；未修改、未暂存并行方 WIP 文件。

## 1. 结论

开局复核：远端 0/0 无新提交，P5 核心五个文件仍全部 UNTRACKED（WIP 73 项），
3014 `/checkout` 仍 500、4015 仍 502 —— B 线与 E2E 两个触发条件均未解锁，
故继续做 HEAD 干净模块的实证审计。本轮在售后资金链路坐实并修复
**1 个可放大退款金额的 P0 缺陷**，含两条独立触发路径：

| 路径 | 复现输入 | 修复前结果 |
| --- | --- | --- |
| A 单次请求重复明细 | `items` 中同一 `orderItemId` 重复 3 次（各 `qty=1`，实购 1 件 / 10000 分） | `refundAmountCents = 30000` |
| B 跨申请重复提交 | 同一订单连续提交 3 次（各 `qty=1`） | 3 行 pending，合计 `30000` 分 |

两条路径都让**应退金额达到订单实付的 3 倍**；`submitRma` 生成的
`refundAmountCents` 是后续退款流程的输入，一旦审批通过即造成真实资金损失。

## 2. 根因

`storefront/services/rmaService.ts` 的 `submitRma` 只做逐条校验：

```ts
if (it.qty > oi.qty) throw new AppError(400, `退货数量超过已购数量（${oi.qty}）`)
refundCents += Number(oi.unitAmountCents) * it.qty
```

缺失三层约束：

1. **本次请求内**不按 `orderItemId` 聚合——同一明细出现 N 次就累加 N 次单价；
2. **跨申请**不查该订单已有的有效 RMA——每次提交都从零开始校验；
3. **无并发串行化**——两个请求同时读到「尚无历史申请」都能通过校验。
   而 `shop_rma_requests` 只有主键索引（本次实查唯一索引清单确认），
   `items` 又是 JSON 列，数据库层无法用唯一约束兜底。

既有 `storefront-rma.test.ts` 只覆盖「单条 `qty > oi.qty` → 400」，
三条放大路径均无用例。

## 3. 修复（仅改 `submitRma`，不动模型/迁移/admin 服务）

- **事务内锁订单行**：`sequelize.transaction` 包裹整个提交，
  `ShopOrder.findOne({ ..., lock: t.LOCK.UPDATE, transaction: t })` 串行化同一订单的
  并发申请；订单归属、可退状态校验也移入事务，避免锁期间状态漂移。
- **历史累计**：事务内查该订单全部 RMA，按 `orderItemId` 累加 `items[].qty`；
  `cancelled` / `rejected` 视为已失效、不占用额度（便于顾客取消或驳回后重提）。
- **本次聚合**：用 `requested` Map 按明细累加本次 `qty`，
  校验 `已申请 + 本次累计 <= oi.qty`，拒绝时返回 400 并带出三个数量便于排查。
- 其余契约不变：skuId 归属校验、正整数校验、金额按订单快照单价（分）重算、
  `siteId` / `refundCurrency` 取值、返回结构均保持原样。

## 4. 复验（独立租户 987670）

```
SINGLE_REQUEST_DUP={"ok":false,"code":400}
REPEAT_SUBMIT={"attempts":[{"ok":true,"cents":10000},{"ok":false,"code":400},{"ok":false,"code":400}],
               "rmaRows":1,"totalCents":10000,"boughtCents":10000}
CONCURRENT_SUBMIT={"attempts":[{"ok":true,"cents":10000},{"ok":false,"code":400}],
                   "rmaRows":1,"totalCents":10000,"boughtCents":10000}
```

顺序、并发、单请求三条路径的累计应退金额均**恒等于实购 10000 分**。

## 5. 回归验证

| 项 | 结果 |
| --- | --- |
| 新增 `server/__tests__/rma-overrefund.test.ts` | **8/8**（单请求累计 4 例、跨申请/并发/失效重提 4 例） |
| 既有 `storefront-rma.test.ts` + `shop-rma-admin.test.ts` | **12/12** |
| 后端全量（两轮） | **689/689（76 文件）× 2** |
| `tsc -p server/tsconfig.json --noEmit` | 0 错误 |
| `node scripts/check-doc-links.mjs` | 70/70 |

全部数据使用独立租户 987671 + 随机单号，与并行方 dev 数据零共享。
全量由 681（75 文件）增至 689（76 文件），正好对应本轮新增 8 例 / 1 文件。

## 6. 未纳入 / 残留（不代改）

| 项 | 状态 | 原因 |
| --- | --- | --- |
| `rmaAdminService.approveRma` / `rejectRma` 仍是「先查后改无 CAS」 | **低优先级** | 并发重复审批的结果同为 approved/rejected，不产生额外退款副作用；本服务不含退款调用，不改状态机契约 |
| 实际退款执行链路的幂等 | **已由其它层保证** | `refundService` 的 `uk_order_refund_idem` 唯一索引与 `invokeProviderOnce`（15:25 已修）负责；本轮只保证「申请金额不超实购」 |
| `rejected` 后允许重提 | **本轮约定，待业务确认** | 按「驳回可修正后重提」处理；若业务要求驳回即冻结该明细额度，需收紧状态过滤 |
| `shop_rma_requests` 无 `(tenantId, orderId)` 普通索引 | **性能项** | 本轮新增历史申请查询会随数据增长变慢；加索引需新建迁移，与并行方未跟踪的 `000066`~`000069` 编号冲突，待其提交后统一处理 |
| 订单行 `FOR UPDATE` 与其它事务的锁顺序 | **待观察** | 当前支付回调等链路未在事务内锁订单行，无循环等待；若后续引入，需统一加锁顺序避免死锁 |

## 7. 零残留声明

临时复现脚本已从 `.box-agent-scratch/` 删除，自建数据（租户 987670 / 987671）已清理；
本轮未触碰并行方 WIP 文件，提交只包含 `rmaService.ts`、新增测试文件与本报告，
未夹带计划文档混合版。

---

*修复与门禁状态变更须由各责任方在提交后回填；本报告不代勾任何任务行。*
