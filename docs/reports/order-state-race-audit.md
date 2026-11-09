# 订单状态流转并发竞态审计与修复

> 2026-11-09 09:27 · 性质：开局复核 → 静态扫描 → 写库实证复现 → 修复 HEAD 干净服务 → 回归
> 不代勾任何门禁任务行；未修改、未暂存并行方 WIP 文件。

## 1. 结论

开局复核：远端 **0/0 同步**（`7e1f82c` / `614699a` / `ae52829` 均已入库），
P5 后端批次与就绪补丁已全部落地；数据库 3306 已恢复（TCP_OK）。
E2E 仍不满足触发条件：3014 整体 **502**（此前仅 `/checkout` 500）、4015 502、5173 未启动。

本轮转做「admin 侧按主键操作缺 tenantId 过滤」的系统性扫描，该角度为**阴性结论**
（见 §7），但顺带在 `shop/services/orderService.ts` 坐实并修复了
**1 个状态流转并发竞态缺陷**，含 5 条独立触发路径。

| 路径 | 复现输入 | 修复前结果 |
| --- | --- | --- |
| A 并发两次发货 | 同一 `paid` 订单并发 `ship` ×2 | 两次都成功；在库量 `10→8`（**双扣 2 件**）、**2 条运单**、2 个不同 `trackingNo` |
| B 顺序重放（对照） | 连续两次 `ship` | 第二次被状态检查拒绝，`10→9`、1 运单 → 缺陷只存在于并发窗口 |
| C 发货 × 取消交叉 | 并发 `ship` + `cancel` | **两者都成功返回**，订单最终 `shipped`，占用却被释放两次 → 状态与库存账不一致 |
| D 并发两次取消 | 并发 `cancel` ×2 | 两次都成功返回，状态由后写覆盖决定 |
| E 取消 × 标记已支付交叉 | `created` 订单并发 `cancel` + `markPaid` | 两者都成功返回，最终状态由写入顺序决定 |

A 是最严重的一条：`inventoryService.deduct` 只按 `quantity` 扣减、不校验该订单是否已扣过，
`order_shipments` 表也无唯一索引，因此并发发货会**真实多扣在库量**并产生两份运单；
`createShipment` 每次生成随机 `trackingNo`，`tryEnqueue` 的 `dedupeKey=trackingNo`
随客户端并发一并失效，还会发出两封发货通知。

## 2. 根因

`orderService` 的三个状态流转函数都是「事务外先查状态 → 事务内改状态」：

```ts
const order = await ShopOrder.findOne({ where: { id, tenantId: tid() } })
if (!['created', 'paid', 'fulfilled'].includes(order.status)) throw ...
// ... createShipment 也在事务外 ...
await sequelize.transaction(async (t) => {
  for (const item of items) { await release(...); await deduct(...) }
  await ShopOrderShipment.create({...}, { transaction: t })
  await order.update({ status: 'shipped' }, { transaction: t })
})
```

状态检查与状态变更之间无 `FOR UPDATE` 行锁、无 CAS，也没有数据库唯一约束兜底：
两个并发请求读到同一个「可流转」旧状态即可全部通过；`ship` 的库存扣减与运单生成
是不可逆副作用，`cancel` 的占用释放同样不可逆。同类问题已在 RMA 提交、
外部通知 outbox、CAPI 派发等链路分别坐实过，本次是订单状态机上的同一模式。

既有测试 `shopPhases.test.ts` / `storefront-order-mail.test.ts` 只覆盖顺序调用，
无并发用例；`order_shipments` 无唯一索引，库层无法兜底。

## 3. 修复（仅改 `orderService.ts` 三个函数，不动模型/迁移/控制器/路由）

沿用项目既有模式（与 `rmaService.submitRma` 一致）：

- **事务内锁订单行**：`markPaid` / `ship` / `cancel` 全部改为
  `sequelize.transaction` 包裹整个流转，用
  `ShopOrder.findOne({ ..., transaction: t, lock: t.LOCK.UPDATE })` 串行化同一订单，
  状态校验移入锁内二次执行。并发第二个请求拿到锁后读到新状态 → 400 拒绝并整体回滚。
- **运单移入锁内**：`createShipment` 从事务外移入锁内，被拒绝的并发请求不再产生
  外部运单号与通知去重键；`tryEnqueue` 仍在事务提交后调用。
- **查询跟随事务**：`ShopOrderItem.findAll` / `ShopSku.findByPk` 补 `transaction: t`，
  保证锁内读到一致快照。
- 契约全部保持：可发货/可取消/可支付状态集合、404/400 错误消息、
  报关号生成规则、`carrier` / `trackingNo` 取值、`tenantId` 过滤、返回 `ShopOrder` 结构未变。

## 4. 复验（独立租户 987691）

```
CONCURRENT_SHIP={"ok":1,"rejected":1,"errors":["当前状态 shipped 不可发货"],
                 "quantity":9,"locked":0,"shipments":1,"finalStatus":"shipped"}
SEQUENTIAL_SHIP={"firstStatus":"shipped","secondRejected":true,
                 "quantity":9,"shipments":1,"finalStatus":"shipped"}
SHIP_VS_CANCEL={"shipOk":true,"cancelOk":false,"quantity":9,"shipments":1,"finalStatus":"shipped"}
CONCURRENT_CANCEL={"ok":1,"rejected":1,"quantity":10,"finalStatus":"cancelled"}
CANCEL_VS_MARKPAID={"cancelOk":true,"markPaidOk":false,"quantity":10,"finalStatus":"cancelled"}
```

五条路径均只剩一个成功者：库存只扣一次（`10→9`）、单运单、状态与库存账一致。

## 5. 回归验证

| 项 | 结果 |
| --- | --- |
| 新增 `server/__tests__/order-state-race.test.ts` | **12/12**（并发 6 例 + 既有状态机/边界 6 例） |
| 既有 `shopPhases.test.ts` + `storefront-order-mail.test.ts` | **29/29** |
| 并行全量（两轮） | **738/739（80 文件）× 2**，唯一失败均为既有 `shopPhases` 报表超时 flake |
| 串行全量 `--no-file-parallelism` | **739/739（80 文件）全绿** |
| `tsc -p server/tsconfig.json --noEmit` | 0 错误 |
| `node scripts/check-doc-links.mjs` | 76/76 |

全量由 727（79 文件）增至 739（80 文件），正好对应本轮新增 12 例 / 1 文件。
测试与复现数据使用独立租户 987691 / 987692 + 随机单号，与并行方 dev 数据零共享。

`shopPhases > 销售报表能聚合订单` 在单跑时为 4045ms（5000ms 阈值），
并行全量下两轮均超时；串行全量全绿。该 flake 在多轮审计中反复出现，
按最小改动约定未改既有测试超时，以串行全绿作干净基线。

## 6. 未纳入 / 残留（不代改）

| 项 | 状态 | 原因 |
| --- | --- | --- |
| 库存操作未跟随外层事务 | **既有架构项** | `inventoryService.release` / `deduct` 内部各自开独立事务、不接收外层 `transaction`，故外层回滚时库存扣减不会回滚。原代码即如此，本轮未改；彻底修需改造库存服务签名并统一事务边界 |
| `order_shipments` 缺 `(tenantId, orderId)` 唯一索引 | **待迁移** | 当前靠订单行锁保证单运单；加唯一索引可再兜底一层，但需新建迁移并确认历史重复运单台账，属独立批次 |
| 锁顺序与其它事务 | **待观察** | 本轮新增订单行 `FOR UPDATE`；若后续有链路先锁 `inventory` 行再锁订单行，会形成循环等待。`withDeadlockRetry` 已覆盖库存侧死锁重试 |
| `tryEnqueue` 在事务提交后 | **既有约定** | 发货成功但入队失败时仅告警、不影响发货事实；若进程在提交后崩溃，通知可能丢失（at-most-once） |
| E2E 服务 3014 / 4015 / 5173 | **环境未恢复** | 3014 现整体 502、4015 502、5173 未启动，无法复跑 Playwright；待服务重建 |
| §9.6 业务决策项 | **待业务签字** | Webhook 无历史支付记录放行口径、Provider 独立密钥、归因首次触点持久化、账面承诺仓 ≠ 物理发货仓、inventory 组合唯一索引、qty>1 分摊舍入 |

## 7. 附带阴性核查（无新缺陷）

- **admin 侧按主键操作缺 `tenantId`**：扫描 `shop/services` + `knowledge/services` 的
  `findByPk` 与 `where: { id: ... }`。`shop` 侧除 `orderService.ship` 的 `ShopSku.findByPk`
  外均带 `tenantId`；该处上游已用 `tenantId` 校验订单与明细，SKU 必属同租户。
- **`knowledge` 模块**：四张表（`knowledge_categories` / `knowledge_contents` /
  `knowledge_content_tags` / `knowledge_tags`）模型均无 `tenantId` 字段，
  是设计上的全局模块；路由仅挂 `authMiddleware`（无 `requireAdmin`），
  权限口径偏松但属业务约定，本轮不代改。
- 未发现其它「声明唯一约束但未落库」的同类缺陷（该角度上一轮已实证核查）。

## 8. 零残留声明

临时复现脚本已从 `.box-agent-scratch/` 删除，自建数据（租户 987691 / 987692）已清理；
本轮未触碰并行方 WIP 文件，提交只包含 `orderService.ts`、新增测试文件与本报告，
未夹带计划文档混合版。

---

*修复与门禁状态变更须由各责任方在提交后回填；本报告不代勾任何任务行。*
