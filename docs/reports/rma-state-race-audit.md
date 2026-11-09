# RMA 状态流转并发竞态审计与修复

> 2026-11-09 15:10 · 性质：发现式审计（coupon/referral 排查后聚焦 RMA）→ 静态坐实 → CAS 修复 → 并发回归
> 不代勾任何门禁任务行；未修改、未暂存并行方 WIP 文件。

## 1. 结论

本轮按剩余未审服务依次排查：

| 服务 | 结论 |
| --- | --- |
| `couponService.ts` | **已加固**（FOR UPDATE 行锁 + (tenantId, orderNo) 唯一 + 同券核对 + UniqueConstraintError 回读），无新缺陷 |
| `referralService.ts` | **已加固**（orderId 唯一索引兜底 + 冲突回读 + fail-closed 窗口判定），无新缺陷 |
| `rmaService.ts` / `rmaAdminService.ts` | **坐实 4 处状态流转 TOCTOU 缺陷**，本轮修复 |

## 2. 缺陷：RMA 状态机读后写（TOCTOU）

顾客侧 `cancelRma`（pending→cancelled）、`submitReturnTracking`（approved→returned）
与后台侧 `approveRma`（pending→approved）、`rejectRma`（pending→rejected）
四处全部是「findOne → 状态检查 → row.update」非原子流转，相互之间无锁、无 CAS、
无唯一约束兜底。并发窗口内两个请求读到同一旧状态后各自写入：

| 交叉 | 修复前结果 | 风险 |
| --- | --- | --- |
| 顾客 cancel × 后台 approve | 两者都成功返回 | **已取消申请以 approved 收尾照常进入回寄/退款链路（资金风险）；或已批准申请被取消覆盖** |
| 后台 approve × reject | 两者都成功返回 | 终态由后写覆盖；rejectReason 与最终状态可能错配 |
| 顾客 cancel ×2 | 两次都成功返回 | 状态由后写覆盖 |
| 顾客回寄 ×2 | 两次都成功返回 | trackingNo 被后写覆盖，回寄凭证不可追溯 |

`rmaService.submitRma` 此前已用「锁订单行 + 事务内累计校验」加固（见
order-state-race-audit.md §3 引用），但同文件的取消/回寄与后台审批侧未同步，
属同一模式在状态机其余迁移上的残留。

## 3. 修复（仅改 2 个服务文件，不动模型/迁移/控制器/路由）

四处迁移统一改为 **CAS 条件更新**：

```ts
const [affected] = await ShopRmaRequest.update(
  { status: 'cancelled' } as never,
  { where: { id, tenantId: tId, customerId, status: 'pending' } }, // 期望旧值进 WHERE
)
if (affected === 0) {
  const row = await ShopRmaRequest.findOne({ ... }) // 回读区分 404 / 400
  if (!row) throw new AppError(404, '退货申请不存在')
  throw new AppError(400, '仅 pending 状态的申请可取消')
}
```

- 单条 UPDATE 天然原子，期望旧值入 WHERE 后并发互斥恰好一方胜出，无需引入事务/行锁；
- 0 行受影响时回读一次，保持 404（不存在/非本人）与 400（状态不符）的错误消息契约逐字不变；
- `submitReturnTracking` 并发两次回寄只有首次生效，trackingNo 不再被后写覆盖；
- `approveRma` / `rejectRma` 胜出后重读返回最新行（原实现返回 update 后实例，序列化契约一致）。

## 4. 回归验证

| 项 | 结果 |
| --- | --- |
| 新增 `server/__tests__/rma-state-race.test.ts` | **8/8**（并发 5 例 + 契约 3 例） |
| 既有 `rma-overrefund` / `shop-rma-admin` / `storefront-rma` | 合计 28/28（含新文件） |
| `tsc -p server/tsconfig.json --noEmit` | 0 错误 |
| 后端全量 | **774/775（88 文件）**，唯一失败为既有 `shopPhases > 销售报表能聚合订单` 并行负载 flake（5099ms > 5000ms 阈值）；单跑 4561ms 通过，串行基线口径与历轮一致 |

测试使用独立租户 987709 + 直建 `ShopRmaRequest` 夹具，与并行方数据零共享。

## 5. 未纳入 / 残留（不代改）

| 项 | 状态 | 原因 |
| --- | --- | --- |
| `refunded` 迁移无实现方 | **待业务决策** | 状态机注释称 refunded 由退款流程驱动，但 `refundService.ts` 只更新订单 paymentStatus，无任何代码将 RMA 置 refunded；退款与 RMA 审批目前是两条独立链路，是否需要联动属业务口径 |
| RMA 状态迁移无数据库层兜底 | **待迁移决策** | CAS 已在应用层互斥；如需库层兜底可用触发器或状态迁移日志表，属独立批次 |
| 顾客 cancel 与 submitRma 累计校验窗口 | **可接受** | submitRma 按订单行锁串行化并累计「非 cancelled/rejected」历史；cancel 仅发生在已存在行上，不放大可退额度 |
| MySQL 3306 开机掉线 | **环境项** | 本轮再次用 phpstudy MySQL8.0.12 自带 my.ini 后台拉起恢复，未动数据文件；掉线根因（无服务注册）待环境治理 |

## 6. 零残留声明

本轮提交只包含 `rmaService.ts`、`rmaAdminService.ts`、新增测试文件与本报告，
未触碰并行方 WIP / scratch / 计划文档。

---

*修复与门禁状态变更须由各责任方在提交后回填；本报告不代勾任何任务行。*
