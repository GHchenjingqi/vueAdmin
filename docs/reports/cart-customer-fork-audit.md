# 购物车顾客归属分叉 + 到货通知链路审计

- 审计时间：2026-11-09
- 审计基线：`e05677d`（购物车并发加购竞态修复之后）
- 审计对象：`server/modules/storefront/services/cartService.ts#getOrCreateCart`；`server/modules/storefront/services/subscriptionService.ts` 与 `server/modules/shop/services/inventoryService.ts` 的补货通知链路
- 方法：写库实证（专属租户 `987701` / `987703`，真实 MySQL + Sequelize），先跑出修复前实际值，再做最小修复并复跑；订阅链路另用一次性探针验证
- 实证用例：`server/__tests__/cart-customer-fork.test.ts`

> 本轮属 HEAD 干净模块的发现式实证审计，不是计划任务行回填。全程未代勾门禁、未代替签字、未改动并行方 WIP。

---

## 1. 结论摘要

| 编号 | 发现 | 影响 | 状态 |
|---|---|---|---|
| D1 | `getOrCreateCart` 在「无有效 token + 已登录」时无条件新建购物车 | 同一顾客多次加购分散到多辆车，旧车商品在购物车视图中消失；`mergeCartOnLogin` 只取最早一辆 | **已修复** |
| D2 | 补货 hook 丢弃 `notifyRestock` 返回的收件人列表，全仓无消费方 | 订阅被标记 `notified` 却永不发信，且重放拿不回收件人 | **实证坐实，登记未修**（需业务决策） |

D2 是本轮开局原定主线。探查后确认修复需新增邮件通道 / 模板 / 消费方（业务口径），按既定约束**不代决、不扩范围**；审计连带发现 D1 可确定性实证且能最小修复，故本轮实际交付 D1。

---

## 2. D1 成因

`carts` 表在 `server/migrations/20261104_000042_create-carts.ts` 只有 `(tenantId, customerId)` 的**非唯一**索引，`token` 唯一。原 `getOrCreateCart`：

```ts
let cart = null
if (token) cart = await findCart(token)
if (!cart) cart = await ShopCart.create({ ... customerId: customerId ?? null ... })
```

只在 token 有效时查已有车。只要请求没带 `X-Cart-Token` / cookie，即便 `customerId` 已由登录态注入，也会新建一辆绑定该顾客的车。而 `mergeCartOnLogin` 明确按 `(tenantId, customerId)` `order id ASC` **取最早一条**；`server/modules/storefront/controllers/authController.ts` 的注释也写明「前端在后续请求用返回的 cartToken 替换本地购物车 cookie」—— 一旦前端未替换 / cookie 丢失 / 服务端直接调用，分叉就发生，旧车仍在库里但购物车视图永远读不到。

---

## 3. D1 写库实证（修复前 / 修复后）

专属租户 987701，每次运行用全新顾客 ID（避免失败轮遗留车被复用）。

| 场景 | 指标 | 期望 | 修复前实测 | 修复后 |
|---|---|---|---|---|
| 同顾客两次无 token 加购 A、B | 车数 / 同一辆 | 1 / 是 | **2 / 否** | 1 / 是 |
| | 最新车行数 / SKU | 2 / A+B | **1 / 仅 B**（A 丢失） | 2 / A+B |
| `mergeCartOnLogin` 后再无 token 加购 | 车数 / 沿用合并车 | 1 / 是 | **2 / 否** | 1 / 是 |
| | 行数 / A / B | 2 / 2 / 2 | **1 / 1 / 0** | 2 / 2 / 2 |
| 游客无 token 两次加购（阴性） | 各自独立车 | 是 | 是 | 是 |
| 带有效 token 加购（阴性） | 复用原车、车数 1 | 是 | 是 | 是 |
| 不同顾客（阴性） | 互不串车 | 是 | 是 | 是 |

第二行是本缺陷最重的形态：**合并刚完成的整辆车（含游客迁入的 B×2 与顾客原 A）在一次普通加购后全部「消失」**，只剩新建车里的 A×1。三个阴性对照修复前后均通过，说明改动没有改变游客车、token 车与跨顾客隔离语义。

---

## 4. D1 修复（只改 `getOrCreateCart` 一个函数）

在 `token` 未命中且传入 `customerId` 时，先按 `(tenantId, customerId)` `order id ASC` 查既有车（**与 `mergeCartOnLogin` 完全同口径**），命中则复用；查不到才新建。函数注释补齐归属规则。

未改动：token 优先级、locale 刷新、新建字段、`addItem` 的原子累加（第 9 轮修复）、`mergeCartOnLogin` 的合并 / 封顶 / 销毁、模型、迁移、控制器、schema、其它服务。既有 `storefront-cart-merge.test.ts` 里「先 addItem 再手动 `cust.update({customerId})`」的夹具因新建顾客本就无既有车，行为不变。

> 注意：本轮修的是**顾客车分叉**，不是第 9 轮登记的 R2（`mergeCartOnLogin` 内 `create` 撞唯一键的并发竞态）。R2 仍未修，见 §8。

---

## 5. 验证

| 项目 | 结果 |
|---|---|
| 新增实证 `cart-customer-fork.test.ts` | **5/5 通过** |
| 相关既有回归（串行 13 文件） | **101/101**（含 `storefront-cart-merge`、`cart-add-race`、`storefront-subscription`、`notification-idempotency`、`storefront-commerce` 等） |
| 后端串行全量 | **85 文件 / 760 测试全绿**（上轮 84 / 755，正好 +1 文件 +5 例） |
| `npm --prefix server run typecheck` | 0 错 |
| ESLint `--no-ignore` | 0 error |
| `node scripts/check-doc-links.mjs` | **157/157 OK** |
| `node scripts/gate-preflight.mjs --strict --json` | 7 PASS / 2 WARN / **0 FAIL**；签字 1 已签 / 17 项 |

---

## 6. D2：补货通知收件人被丢弃（实证坐实，登记未修）

### 链路现状

`server/modules/shop/services/inventoryService.ts#adjust` 在入库事务提交后触发：

```ts
if (delta > 0 && restockHook) { await restockHook(skuId, tId) }
```

`subscriptionService.ts` 注册的 hook 是：

```ts
inventoryService.setRestockHook(async (skuId, tenantId) => {
  await notifyRestock(skuId, tenantId)   // 返回的 RestockNotifyTarget[] 被直接丢弃
})
```

`notifyRestock` 逐行 CAS 把 `waiting → notified` 并**返回待发送收件人列表**（第 3 轮修复的正是这里的并发认领）。全仓检索 `ShopRestockSubscription` / `notifyRestock` 的引用：除模型、服务与两份测试外**没有任何消费方**；`server/modules/shop/models/ShopOrderEmail.ts` 的订单邮件 outbox 要求 `orderId` / `orderNo` 且 `type` 仅有 `confirmed|shipped|refunded`，无法承载到货通知，也不该被污染。

### 一次性写库探针（专属租户 987703，脚本不提交、已删除）

真实走 `subscribeRestock` → `inventoryService.adjust(+5)` → 查库快照：

```json
{
  "subscribeStatus": "waiting",
  "inStockAtSubscribe": false,
  "availableAfterRestock": 5,
  "statusAfterRestock": "notified",
  "notifiedAtSet": true,
  "mailOutboxRowsForSubscriber": 0,
  "replayTargetsAfterMarkedNotified": 0
}
```

即：库存确实回来了、订阅确实被标记「已通知」、`notifiedAt` 也已写，但**该订阅者在 outbox 中 0 条记录**，且因状态已终态，重放 `notifyRestock` 返回 **0 个收件人** —— 收件人列表被丢弃后**不可找回**。订阅者收不到邮件，也不会因后续补货再次被通知（除非主动重新订阅）。

### 为何本轮不修

代码注释写明「实际邮件发送由后续营销/邮件任务消费（P4-T09）」，但全仓不存在该任务，也没有通用通知 outbox。补上闭环需要新增持久化载体 + 邮件模板 / 语言 / 发送通道 / 失败重试 / 幂等键，属于**业务与架构决策**，且会顺带改动订单邮件 outbox 或新增迁移。按既定约束「不代决业务口径、只做请求的最小改动、禁止范围蔓延」，本轮如实登记为高优先级残留，不擅自接入 SMTP、不硬塞订单邮件表。

---

## 7. 订阅链路阴性核查（未发现需修缺陷）

- 唯一索引齐全：`uq_newsletters_tenant_email` / `uq_newsletters_token` / `uq_restock_tenant_email_sku` / `uq_restock_token`（见 `server/migrations/20261104_000051_create-newsletters.ts`、`server/migrations/20261104_000052_create-restock-subscriptions.ts`），`findOrCreate` 并发有 DB 兜底，不会产生重复订阅行。
- `notifyRestock` 的逐行 CAS 认领（`affected === 1` 才返回收件人）已由 `server/__tests__/notification-idempotency.test.ts` 覆盖，并发多 worker 不会重复认领 —— 本轮问题不在「重复」，而在「认领后无人交付」。
- `unsubscribeNewsletter` 按 `(tenantId, token)` 隔离，凭令牌退订路径无越权。
- `server/__tests__/storefront-subscription.test.ts` 只断言「补货后状态变 `notified`」，从未断言是否有可消费的待发送记录，因此 D2 一直未被既有套件发现。

---

## 8. 登记但未改的残留

| # | 残留 | 说明 / 建议 |
|---|---|---|
| R1 | **补货通知收件人被丢弃（D2）** | 高优先级。需业务与架构确认：新增通用通知 outbox + 消费任务，或让 hook 把 targets 交给可注入派发器；须定模板 / 语言 / 重试 / 幂等键。本轮不代决 |
| R2 | 仅 `adjust(delta>0)` 触发补货 hook | `release()` 减少 `locked` 会让 `available` 由 0 变正（取消订单释放预占），但**不触发通知**，订阅者仍在等。静态代码核查确认，未做写库实证；是否把「释放占用」也算补货属业务口径 |
| R3 | 有货 SKU 仍可订阅到货提醒 | `subscribeRestock` 不拦截 `inStock=true` 的 SKU，且 hook 只由真实入库触发，这类订阅可能长期无通知。需业务口径 |
| R4 | 重复订阅把 `cancelled` 复活为 `waiting` | `if (!created && status !== 'waiting')` 不区分 `notified` 与 `cancelled`，取消订阅可被一次普通调用复活。与 newsletter 重订策略一致，未代改 |
| R5 | `getOrCreateCart` 并发首访仍可能建两辆车 | 本轮是「先查再建」，`carts` 表 `(tenantId, customerId)` 非唯一，两个并发无 token 请求仍可各建一辆。彻底消除需唯一索引 + 冲突回读（同第 9 轮 R2 的思路），本轮未扩 |
| R6 | 历史多辆顾客车未合并 / 清理 | 修复只保证**今后**复用最早一辆；库里既有的分叉车仍在，本轮不删库、不代迁移数据 |
| R7 | 第 9 轮 R2、R1 仍未闭合 | `mergeCartOnLogin` 内 `create` 撞唯一键的并发竞态；`CART_LINE_MAX=99` 与 schema / 下单 9999 口径冲突（需业务定） |
| R8 | 测试租户遗留数据 | `987701`（购物车分叉，含失败轮）、`987703`（探针）、以及前几轮 `987693/987695/987697/987699`，均为测试自建数据、不进生产；不自动清库 |
| R9 | 并行方 WIP 与业务签字 | 开局 46 已跟踪 + 51 未跟踪；`docs/reports/gate-signoff-pack.md` 已由业务方勾 1 项并关闭 G5、计划文档 v1.32 / `P5-T09 [x]`，均未提交。本轮未碰、未夹带、未代勾、未回填 |

---

## 9. 复验命令

```bash
cd server && npx vitest run --no-file-parallelism __tests__/cart-customer-fork.test.ts
cd server && npx vitest run --no-file-parallelism --reporter=dot
npm --prefix server run typecheck
node scripts/check-doc-links.mjs
node scripts/gate-preflight.mjs --strict --json
```

*本报告只登记发现、修复与残留，不构成任何门禁通过或签字结论。*
