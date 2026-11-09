# 工作流审批回调幂等与终态一致性审计

> 2026-11-09 15:35 · 性质：补推 `214b97d` → 剩余未审服务系统扫描 → 静态坐实 → 写库实证复现 → CAS 修复 → 回归
> 不代勾任何门禁任务行；未修改、未暂存并行方 WIP 文件。

## 1. 开局

上一轮 `214b97d`（RMA 状态机竞态）因 TLS `close_notify` 留存本地，本轮开局补推成功
（`d437d14..214b97d`），远端 0/0，暂存区干净。

## 2. 系统扫描结果（阴性项）

| 对象 | 结论 |
| --- | --- |
| `subscriptionService.subscribeNewsletter/Restock` | 已用 `findOrCreate` 幂等；`notifyRestock` 已逐行 CAS 认领（历轮修复），无新缺陷 |
| `addressService` | 写操作全部经 `withOwnerLock`（顾客行 `FOR UPDATE`）串行化，默认地址唯一性有锁保障，无新缺陷 |
| `shippingService` 进程内缓存 | `settings.optionKey` 全局唯一（`Setting` 模型**无 tenantId**），运费配置本就全局共享，缓存单例与设计一致；非跨租户串配置 |
| `reviewService.markHelpful` | 用 `row.increment` 原子累加，无读后写丢更新 |
| `reviewService` / `ShopProductQA` 后台审核 | **功能断点**：只有公开提交（pending）与公开列表（approved/answered），全仓无任何 approve/reject 迁移实现，pending 评价永不对外可见。属待实现功能，非本轮并发缺陷 |

## 3. 缺陷：审批回调无幂等、无状态校验

链路：`spuService.submitForPublish` → `changeSpuStatus('submit')` 置 SPU 为 `review` →
建 `WorkflowInstance`（bindingKey=`shop-publish`）→ 引擎 `finalize` 提交终态后
POST `/api/v1/shop/workflow-callback`（**路由注释明确「内部接口免鉴权」**）→
`applyWorkflowResult`。

旧实现只校验实例 `bindingKey`，随后：

```ts
if (finalStatus === 'rejected') { await spu.update({ status: 'rejected' }); return spu }
await spu.update({ status: 'published' })
await skuService.followSpuStatus(input.spuId, 'published')
if (input.listToChannel && ...) await channelProductService.publishToChannel(...)
```

四条独立触发路径：

| 路径 | 修复前结果 |
| --- | --- |
| A 同一实例 approved 回调重放（引擎重试 / HTTP 重放） | 再次执行 `followSpuStatus` + `publishToChannel`；渠道适配器每次生成新 `externalId` 并覆盖 `channel_products.externalId`，形成**重复外部推送** |
| B approved 后的 rejected 回调 | 已 published 商品被打回 rejected，且 rejected 分支**不联动 SKU**，SPU=rejected / SKU=published 永久分裂 |
| C rejected 后的 approved 回调 | 已驳回商品被直接发布（绕过合规与审批结论） |
| D 非 review 状态（draft/published/archived）回调 | 无条件改写状态，状态机形同虚设 |

与历轮 `orderService` / `rmaService` / `rmaAdminService` 的 TOCTOU 属同一模式：
读状态与写状态之间没有 CAS，且副作用在闸门之外。

## 4. 写库实证（修复前对照）

临时换回 HEAD 旧实现跑同一组新用例（专用租户 987710，直建工作流实例夹具，
不启动引擎异步回调）：

```
Test Files  1 failed (1)
     Tests  5 failed | 3 passed (8)
  × 顺序重放 approved：渠道 externalId 不被重新推送覆盖
  × 并发两次 approved：渠道只推一次、只一行
  × approved 后的 rejected 回调被拒：SPU/SKU 不出现状态分裂
  × rejected 后的 approved 回调被拒：终态不被改回 published
  × 非 review 状态（draft）回调一律 409，不改写状态
```

3 条通过的正是首次 approved / 首次 rejected / 无效实例等既有契约用例 →
缺陷只存在于重放与交叉窗口。实证后已立即恢复修复版文件。

## 5. 修复（仅改 `spuService.applyWorkflowResult`）

以 **SPU 状态 CAS** 作唯一认领闸门，不动引擎/路由/控制器/模型/迁移：

```ts
const target: SpuStatus = finalStatus === 'rejected' ? 'rejected' : 'published'
const [affected] = await ShopSpu.update(
  { status: target },
  { where: { id: input.spuId, tenantId: tid(), status: 'review' } } as never,
)
if (affected === 0) {
  const current = await getSpuById(input.spuId)
  if (current.status === target) return current            // 幂等重放，不重放副作用
  throw new AppError(409, `WORKFLOW_RESULT_CONFLICT: ...`)  // 终态冲突 / 非法状态
}
// 只有 CAS 胜出者执行 SKU 跟随与渠道推送
```

- 单条 UPDATE 原子互斥；顺序重放与并发重放均只有一次渠道推送、`externalId` 不再被覆盖；
- 409 拦截终态倒退（B/C）与非 review 改写（D）；
- 保持既有契约：`approved→published`、`rejected→rejected`、无效实例 400 `无效的工作流实例`、
  返回最新 `ShopSpu`、渠道发布仍为「失败不影响流程」的 `.catch(() => null)`；
- 未用实例 `status === finalStatus` 做闸门：既有测试 `shopPhases` 在实例仍为 `pending` 时
  直接调用回调，加该校验会破坏既有契约。

## 6. 回归验证

| 项 | 结果 |
| --- | --- |
| 新增 `server/__tests__/workflow-callback-idem.test.ts` | **8/8**（幂等/并发 6 例 + 契约 2 例） |
| 既有 `shopPhases.test.ts` 审批回调两例 | 通过；唯一失败为既有 `销售报表能聚合订单` 超时 flake（5033ms > 5000ms，历轮反复出现） |
| `tsc -p server/tsconfig.json --noEmit` | 0 错误 |
| 后端全量 | **782/783（89 文件）**，唯一失败为上述已知报表超时 flake（5139ms）；较上轮 775 增 8 例、1 文件，正好对应本轮新增 |
| `node scripts/check-doc-links.mjs` | **183/183 OK** |

测试用独立租户 987710 + 唯一名称，与并行方 dev 数据零共享。

## 7. 未纳入 / 残留（不代改、不代决）

| 项 | 状态 | 原因 |
| --- | --- | --- |
| `/shop/workflow-callback` 免鉴权 | **待业务/安全决策** | 路由注释声明内部接口免鉴权，引擎回调不带签名；任何可达内网者可凭 instanceId 伪造审批结果。加 HMAC/内网白名单会改引擎与部署契约，属独立批次。本轮 CAS 只阻断「已终态被覆盖」，不阻断首次伪造 |
| 回调无租户上下文 | **待架构决策** | `fireWorkflowCallback` payload 不带 tenantId；回调请求经 `getTenantContext()?.tenantId ?? 1` 落到默认租户，非默认租户的 `getSpuById` 会 404。改法需在 payload 与回调入口注入租户上下文，范围超出本轮 |
| `applyWorkflowResult` 的 `reason` 参数未落库 | **既有契约** | 驳回原因未写入任何字段，原实现即如此；是否记录到工作流实例/审计日志属产品口径 |
| 评价 / 问答后台审核链缺失 | **待实现** | 见 §2，pending 数据永不对外可见 |
| 工作流实例可重复 finalize | **未改** | 引擎 `finalize` 无幂等标记；本轮在业务侧 CAS 收口，引擎侧重试仍会发回调但被幂等吸收 |
| `shopPhases > 销售报表能聚合订单` 超时 flake | **既有 flake** | 单跑 4561ms 可过，并行/串行全量下反复超 5000ms 阈值；按最小改动约定未改既有测试超时 |

## 8. 零残留声明

实证用临时文件在系统临时目录，已恢复 `spuService.ts` 修复版并复跑 8/8；
本轮未触碰并行方 WIP / scratch / 计划文档，提交只含 `spuService.ts`、
新增测试文件与本报告。

---

*修复与门禁状态变更须由各责任方在提交后回填；本报告不代勾任何任务行。*
