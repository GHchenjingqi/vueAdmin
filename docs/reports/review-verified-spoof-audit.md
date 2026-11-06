# 商品评价「已购」标记跨商品伪造审计与修复

> 2026-11-06 16:56 · 性质：只读源码审查 → 写库实证复现 → 修复 HEAD 干净服务 → 回归
> 不代勾任何门禁任务行；未修改、未暂存并行方 WIP 文件。

## 1. 结论

开局复核：远端 0/0 无新提交，P5 核心五个文件仍全部 UNTRACKED（WIP 85 项），
3014 `/checkout` 仍 500、4015 仍 502 —— B 线与 E2E 两个触发条件均未解锁，
故继续做 HEAD 干净模块的实证审计。本轮在顾客端评价链路坐实并修复
**1 个已购验证越权缺陷**：买过任意商品的登录顾客，可以给**从未购买**的商品刷出
`verified=true` 的「已购评价」，进而影响前台信任标识与评分可信度。

## 2. 复现（独立租户 909107，写库实测）

构造：顾客只买了商品 B（订单 `paid`，明细为 B 的 SKU），对商品 A 提交评价。

| 路径 | 入参 | 修复前 `verified` |
| --- | --- | --- |
| A 跨商品、省略 `skuId` | `{ spuId: A, orderId: X }` | **true（伪造成功）** |
| B 跨商品、带 `skuId(A)` | `{ spuId: A, skuId: A1, orderId: X }` | false |
| C 合法、省略 `skuId` | `{ spuId: B, orderId: X }` | true |

修复前实测输出：

```
RESULT={"crossSpuNoSku_verified":true,"crossSpuWithSku_verified":false,
        "ownSpuNoSku_verified":true,"spoofedOrderIdOnA":4484}
```

`reviewSubmitSchema` 中 `skuId`、`orderId` **均为可选**，
`POST /api/storefront/v1/reviews` 直接透传 `req.body` 到 service，
攻击面无需特殊构造即可触达；`customerAuth` 只提供身份，不校验商品与订单的关联。

## 3. 根因

`storefront/services/reviewService.ts` 的 `verifyPurchase` 原实现：

```ts
const whereItem: Record<string, unknown> = { orderId, tenantId }
if (skuId != null) whereItem.skuId = skuId
const item = await ShopOrderItem.findOne({ where: whereItem as never })
return !!item
```

`skuId` 省略时（评价针对 SPU 整体，属合法用法），查询退化为
「该订单存在任意一条明细」，完全没有把 `spuId` 带进校验条件。
订单归属（`email` / `tenantId` / 已支付状态）都校验了，唯独缺了
**被评价商品与订单明细的归属关系**；`shop_reviews` 也无
`(tenantId, customerId, spuId)` 之类约束可在库层兜底。

既有 `storefront-review.test.ts` 的已购验证 3 例全部传了 `skuId`，
恰好绕开了这条分支，因此未暴露缺陷。

## 4. 修复（仅改 `reviewService.ts` 的已购验证，不动模型/迁移/控制器）

- `verifyPurchase` 新增 `spuId` 参数；`skuId` 非空时保持原精确匹配。
- `skuId` 省略时，先取该 SPU 下全部 SKU（`ShopSku.findAll`，带 `tenantId`），
  再以 `skuId IN (...)` 匹配订单明细；该 SPU 无 SKU 直接返回 false。
- 其余契约不变：`resolveSku` 的 SPU/SKU 归属校验、评分范围、pending 审核态、
  `customerId` / `orderId` 落库、返回结构均保持原样。

**复验输出**：

```
RESULT={"crossSpuNoSku_verified":false,"crossSpuWithSku_verified":false,
        "ownSpuNoSku_verified":true,"spoofedOrderIdOnA":4485}
```

跨商品伪造被挡住，合法路径（省略 `skuId` 评价已购 SPU）仍为 true，未误伤。

## 5. 回归验证

| 项 | 结果 |
| --- | --- |
| 新增 `server/__tests__/review-verified-spoof.test.ts` | **10/10**（跨商品 2 例、合法路径 4 例、email/状态/租户/游客 4 例） |
| 既有 `storefront-review.test.ts` + `storefront-review-image.test.ts` + 新增 | **31/31** |
| 后端全量（两轮） | **699/699（77 文件）× 2** |
| `tsc -p server/tsconfig.json --noEmit` | 0 错误 |
| `node scripts/check-doc-links.mjs` | 71/71 |

测试数据使用随机前缀 + 独立随机单号，与并行方 dev 数据零共享；
复现脚本使用独立租户 909107 并在脚本内清理。
全量由 689（76 文件）增至 699（77 文件），正好对应本轮新增 10 例 / 1 文件。

## 6. 附带核查（阴性）

- `trackingController` 在缺 `accessToken` 时传空串，`where: { accessToken: '' }`；
  查 `checkoutService` 建单均调用 `genAccessToken()` 生成随机凭证，
  未实测到 `access_token = ''` 的历史样本，故**未坐实为空凭证绕过**，仅登记观察。
  （NULL 不会被 `= ''` 命中。）
- `addressService` 已用顾客行 `FOR UPDATE` + `tenantId`/`customerId` 双条件读写，
  归属校验完备，本轮未发现越权。

## 7. 未纳入 / 残留（不代改）

| 项 | 状态 | 原因 |
| --- | --- | --- |
| `verified=false` 时仍把传入 `orderId` 写入 `shop_reviews.orderId` | **待业务确认** | 可让评价挂上任意订单号（复现输出 `spoofedOrderIdOnA`），审核台可能误判；是否仅验证通过才记关联属产品口径，且可能用于投诉追溯，不擅自改契约 |
| `markHelpful` 无身份/去重约束 | **既有契约** | `storefront-review.test.ts` 明确断言连续两次计数 1→2；加去重需身份键或新表，属产品决策 |
| 「同一顾客 × 同一 SPU 只能评价一次」无约束 | **人工审核兜底** | 需唯一索引 + 新建迁移，与并行方未跟踪的 `000066`~`000069` 编号冲突，待其提交后统一处理 |
| `listReviews` 汇总把全部 approved 行读入内存 | **性能项** | 数据量大时 O(N)；改 SQL 聚合属独立优化，不在本轮最小修复范围 |
| 评价审核侧的自动去重 | **未见实现** | shop 控制器/服务中未检索到 `ShopReview` 审核逻辑，当前依赖 pending 人工审核，待业务确认是否补约束 |

## 8. 零残留声明

临时复现脚本已从 `.box-agent-scratch/` 删除，自建数据（租户 909107）已清理；
本轮未触碰并行方 WIP 文件，提交只包含 `reviewService.ts`、新增测试文件与本报告，
未夹带计划文档混合版。

---

*修复与门禁状态变更须由各责任方在提交后回填；本报告不代勾任何任务行。*
