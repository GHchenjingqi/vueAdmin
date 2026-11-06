# CAPI 服务端事实事件重复外发审计与修复

> 2026-11-06 17:26 · 性质：只读源码审查 → 写库实证复现 → 修复 HEAD 干净服务 → 回归
> 不代勾任何门禁任务行；未修改、未暂存并行方 WIP 文件。

## 1. 结论

开局复核：P5 核心五个文件仍全部 UNTRACKED（WIP 92 项），3014 `/checkout` 仍 500、
4015 仍 502、5173 未启动；`git fetch` 因代理 `CONNECT tunnel failed 502` 失败，
本地仍按上次同步为 0/0。B 线与 E2E 两个触发条件均未解锁，故继续做 HEAD 干净模块的
实证审计。本轮在服务端 CAPI 埋点链路坐实并修复 **1 个外部副作用重复缺陷**：
换一个客户端 `eventId` 就能把**同一笔订单**的 purchase/refund 转化重复外发到
Meta / Google CAPI，造成转化虚高、广告归因与计费失真。

## 2. 复现（独立租户 909108，注入 mock CAPI provider）

顾客同意 analytics、订单已支付，对**同一订单**上报 purchase：

| 路径 | 修复前 `providerCalls` | 修复前各行状态 |
| --- | --- | --- |
| A 顺序 3 个不同 `eventId` | **3**（3 行落库） | `sent, sent, sent` |
| B 并发 3 个不同 `eventId` | **3** | `sent, sent, sent` |
| C 同一 `eventId` 重复 2 次 | 1（既有幂等有效） | 1 行 `sent` |

```
RESULT={"sequential":{"providerCalls":3,"rows":3,"statuses":["sent","sent","sent"]},
        "concurrent":{"providerCalls":3,"statuses":["sent","sent","sent"]},
        "sameEventId":{"providerCalls":1}}
```

`trackEventSchema` 只限制 `eventId` 长度（1~64），不校验其来源；
`recordEvent` 的幂等是 `(tenantId, eventId)` 唯一索引，完全由客户端控制。
CAPI 平台侧按 `event_id` 去重也随客户端换 id 一并失效，且外部投放平台
无法回滚已计入的转化。

## 3. 根因

`storefront/services/analyticsService.ts` 的 `recordEvent` 有三层防护
（白名单、同意门控、订单快照校准金额），但**派发去重只有一个客户端键**：

```ts
const existing = await ShopAnalyticsEvent.findOne({ where: { tenantId: tId, eventId } })
if (existing) return { eventId, accepted: true, dispatchStatus: existing.dispatchStatus }
...
if (isFactEvent && consent && capiProvider) {
  await capiProvider({ ... })   // 无任何「同一订单只转化一次」的判据
}
```

`(tenantId, eventId)` 唯一索引（迁移 `000058`）只挡同一 id 的重放；
不同 id 各自落库、各自派发，并发下也没有任何串行化。
迁移 `000058` 另有 `(tenantId, siteId, eventName, createdAt)` 普通索引，
没有 `(tenantId, orderId, eventName)` 唯一键可在库层兜底。

既有 `storefront-analytics.test.ts` 的幂等用例只覆盖「同一 `eventId` 重放」，
未覆盖「同一订单换 id」与并发路径。

## 4. 修复（仅改 `analyticsService.ts` 的派发段，不动模型/迁移/控制器）

在调用外部 provider **之前**做订单级派发权认领：

- 以 `ShopOrder.findOne({ lock: t.LOCK.UPDATE, transaction })` 锁订单行，
  串行化同一订单所有事实事件的派发决策；
- 事务内查该 `(tenantId, orderId, eventName)` 是否已有
  `dispatchStatus IN ('sent','sending')` 的占用行，有则本次不派发；
- 无占用时用条件更新做 CAS 抢占（`local_only → sending`），
  `affected === 1` 才获得派发权；`sending` 为内部占位态（列是 `STRING(24)`，
  **不新增列、不建迁移、不对外返回**）；
- 外部 provider 调用仍在事务外，避免长事务持锁；成功置 `sent`、失败置 `failed`。
  `failed` 不算占用，保留换 `eventId` 重试的能力；
- 被抑制的请求**仍照常落库留痕**，返回 `local_only`（`accepted: true`），
  不报错、不改变 `eventId` 落库契约与 CAPI payload 结构。

**复验输出**：

```
RESULT={"sequential":{"providerCalls":1,"rows":3,"statuses":["sent","local_only","local_only"]},
        "concurrent":{"providerCalls":1,"statuses":["sent","local_only","local_only"]},
        "sameEventId":{"providerCalls":1}}
```

## 5. 回归验证

| 项 | 结果 |
| --- | --- |
| 新增 `server/__tests__/capi-dispatch-idempotency.test.ts` | **11/11**（顺序/并发/同 id、purchase 与 refund 独立、多订单、未同意不占名额、失败可重试、无 provider 不占名额、浏览类、未支付 400、payload 金额） |
| 既有 `storefront-analytics.test.ts` + `shop-analytics-reconcile.test.ts` + 新增 | **28/28** |
| 后端全量 | **710/710（78 文件）**，连续两轮全绿 |
| `tsc -p server/tsconfig.json --noEmit` | 0 错误 |
| `node scripts/check-doc-links.mjs` | 72/72 |

全量首轮出现 1 例既有 flake（`shopPhases` 报表造数，
`709 passed / 1 failed`），与 CAPI 派发改动无关：随后两轮全量 710/710，
并单跑 `shopPhases.test.ts` 两轮均 **18/18** 稳定。
全量由 699（77 文件）增至 710（78 文件），正好对应本轮新增 11 例 / 1 文件。

## 6. 附带核查（阴性）

- `shippingService.resolveShipping` 的白名单 fail-closed、整数分、非负数校验完备；
- `catalogService` 所有查询均显式带 `tenantId`，`keyword` 经 `escapeLike` 转义后
  才拼入 `Sequelize.literal`，未发现注入面；
- `couponService.redeemCoupon` 已在事务内 `FOR UPDATE` 重查用量上限，
  `evaluateCoupon` 的读时检查不构成绕过。

本轮未在这些文件发现新的同类缺陷。

## 7. 未纳入 / 残留（不代改）

| 项 | 状态 | 原因 |
| --- | --- | --- |
| `sending` 占位态在进程崩溃后残留 | **运维项** | 会使该订单该事件不再派发（fail-closed，宁可漏发不可重复发）；彻底修需超时回收任务或独立 claim 列 + 迁移，与并行方未跟踪的 `000066`~`000069` 编号冲突 |
| CAPI payload 的 `eventId` 仍是客户端值 | **待业务确认** | 改为服务端派生键（如 `srv:{tenantId}:{orderId}:{eventName}`）可让投放平台侧也去重，但会改变对账口径与现有事件 ID 语义 |
| `refund` 事实金额取订单总额 `amountCents` | **既有口径** | 部分退款 / 多笔退款无法分别上报；修需退款单快照与事件模型扩展，属业务决策 |
| `assertOrderFact` 查询未带 `siteId` | **跨站点归因污染** | 同租户多店铺可用别店订单号上报转化；需确认站点与订单的归属口径再收紧 |
| 同一订单同一事件的重复行仍全部落库 | **设计取舍** | 保留完整上报留痕便于审计；若需库层硬去重，须新增 `(tenantId, orderId, eventName)` 唯一索引 |
| `catalogService.listProducts` 内存分页（先查全部 SPU 再 `slice`） | **性能项** | 商品量大时每次列表请求全表加载；改 SQL 分页属独立优化，不在本轮最小修复范围 |

## 8. 零残留声明

临时复现脚本已从 `.box-agent-scratch/` 删除，自建数据（租户 909108）已清理；
本轮未触碰并行方 WIP 文件，提交只包含 `analyticsService.ts`、新增测试文件与本报告，
未夹带计划文档混合版。

---

*修复与门禁状态变更须由各责任方在提交后回填；本报告不代勾任何任务行。*
