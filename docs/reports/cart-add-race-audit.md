# 购物车并发加购竞态审计

- 审计时间：2026-11-09
- 审计基线：`a95d342`（报价与订单快照一致性修复之后）
- 审计对象：`server/modules/storefront/services/cartService.ts` 的 `addItem`
- 方法：写库实证（专属租户 `987699`，真实 MySQL + Sequelize），先跑出修复前实际值，再做最小修复并复跑
- 实证用例：`server/__tests__/cart-add-race.test.ts`

> 本轮属于 HEAD 干净模块的发现式实证审计，不是计划任务行回填。全程未代勾门禁、未代替签字、未改动并行方 WIP。

---

## 1. 结论摘要

| 编号 | 缺陷 | 影响 | 状态 |
|---|---|---|---|
| D1 | 空车并发同 SKU：`findOne` 全未命中 → 多个 `create` 撞 `uq_cart_items_cart_sku` | 7/8 请求 `SequelizeUniqueConstraintError`（500），失败方数量直接丢失 | 已修复 |
| D2 | 已有行并发累加：`existing.qty + input.qty` 读后写 | 8 个成功请求只累加 1 次（应 13，实测 2），静默少件 | 已修复 |

两条都在「加购」这一最前端环节，不直接产生资金损失，但会让购物车数量不可信：用户点了 8 次加购，要么看到 500，要么购物车仍是 1 件。由于报价由服务端重算，最终下单金额以报价为准，但用户体验与后续「报价超量必失败」（见 `docs/reports/quote-snapshot-consistency-audit.md` D2）会被放大。

顺序重放用例在修复**前**就通过 —— 缺陷只在并发窗口暴露，既有 `storefront-cart-merge.test.ts` / `storefront-commerce.test.ts` 等顺序调用套件都覆盖不到。

---

## 2. 成因

`cart_items` 在 `server/migrations/20261104_000042_create-carts.ts` 建了唯一索引 `(tenantId, cartId, skuId)`，模型 `server/modules/shop/models/ShopCartItem.ts` 也声明了 `uq_cart_items_cart_sku`。注释写「同一 SKU 行内唯一，重复加购累加数量」，但 `addItem` 的实现是：

```ts
const existing = await ShopCartItem.findOne({ where: { cartId, skuId, tenantId } })
if (existing) {
  await existing.update({ qty: existing.qty + input.qty })   // 读后写：丢更新
} else {
  await ShopCartItem.create({ ... qty: input.qty })          // 并发撞唯一键：500
}
```

- **D1**：唯一索引保证了「最多一行」，但没有让第二个 INSERT 变成累加。8 个请求同时 `findOne` 未命中，1 个 INSERT 成功，其余 7 个抛 `SequelizeUniqueConstraintError`；服务无捕获、无重试，直接冒泡成 500。
- **D2**：8 个请求同时读到 `qty = 1`，各自算 `1 + n` 后写回，最后一次写覆盖前面所有结果。`UPDATE` 本身不是原子累加，且响应全部 200，用户与监控都察觉不到。

`cartController` 与 `server/shared/schemas/storefront.ts` 只校验 `qty` 为 1..9999 的整数，不解决并发。

---

## 3. 写库实证（修复前 / 修复后）

专属租户 987699，每个用例独立购物车（先 `getOrCreateCart` 固定 token，排除并发建车干扰），`Promise.allSettled` 真实并发，一次性快照。

| 场景 | 指标 | 期望 | 修复前实测 | 修复后 |
|---|---|---|---|---|
| 空车并发 8×qty1 | 成功 / 失败 | 8 / 0 | **1 / 7**（`firstError = SequelizeUniqueConstraintError`） | 8 / 0 |
| | 明细行数 / qty | 1 / 8 | 1 / **1** | 1 / 8 |
| 已有行（初始 1）并发 8 次（合计 12） | 成功 / 失败 | 8 / 0 | 8 / 0 | 8 / 0 |
| | 明细行数 / qty | 1 / 13 | 1 / **2** | 1 / 13 |
| 并发不同 SKU 各 4 次 | 失败请求 | 0 | **6** | 0 |
| | 行数 / 各 SKU qty | 2 / 4·4 | 见上（唯一键 500） | 2 / 4·4 |
| 顺序重放 8 次（阴性对照） | 行数 / qty | 1 / 8 | 1 / 8（通过） | 1 / 8 |

「并发不同 SKU」的 6 个失败 = 每个 SKU 首次 INSERT 成功、其余 3 次撞唯一键，说明 D1 与 SKU 是否相同无关，只与「同一 (cart, sku) 是否已建行」有关。

---

## 4. 修复（只改 `addItem` 的行写入，共 1 个函数）

1. `import { UniqueConstraintError } from 'sequelize'`；
2. 未命中时 `create` 成功即 `return`；若抛 `UniqueConstraintError`，说明并发方已建行，**本次数量仍需计入**，不抛 500、不静默丢弃，落到下方累加；其它异常照抛；
3. 命中（或刚撞唯一键）时用 `ShopCartItem.increment({ qty }, { where: { tenantId, cartId, skuId } })`，生成 MySQL 行锁内的 `SET qty = qty + n` 原子累加，替代读后写；
4. 函数注释补齐并发语义。

未改动：`getOrCreateCart` / `updateItemQty` / `removeItem` / `toCartView` / `mergeCartOnLogin`、`CART_LINE_MAX`、快照字段与冲突优先级、购物车模型、迁移、schema、控制器、其它服务。新增行仍保留首次加购的价格 / 标题 / 规格快照（与原 `existing.update({qty})` 语义一致）。

> 未把 `increment` 放进 `withDeadlockRetry`：单条 UPDATE 由行锁串行即可，重试反而可能重复累加。详见 §7 R5。

---

## 5. 验证

| 项目 | 结果 |
|---|---|
| 新增实证 `cart-add-race.test.ts` | **4/4 通过** |
| 相关既有回归（串行 11 文件） | **91/91**（含 `storefront-cart-merge` 全套、`storefront-commerce`、`storefront-orders-list`、`storefront-trade-gate`、第 6~9 轮并发实证） |
| 后端串行全量 | **84 文件 / 755 测试全绿**（上轮 83 / 751，正好 +1 文件 +4 例） |
| `npm --prefix server run typecheck` | 0 错 |
| ESLint（`--no-ignore` 强制包含被根配置忽略的 `server/` 路径） | 0 error |
| `node scripts/check-doc-links.mjs` | **148/148 OK** |
| `node scripts/gate-preflight.mjs --strict --json` | 7 PASS / 2 WARN / **0 FAIL**（见 §6） |
| staged blob 行尾 | CRLF = 0 |

阴性核查：全仓 `ShopCartItem.create` 仅 2 处 —— `addItem`（本轮已修）与 `mergeCartOnLogin`（见 §7 R2）；订阅类 `findOrCreate` 由 Sequelize 内部处理唯一键，无同类缺口。

---

## 6. 本轮附带发现：业务方真实签字触发预检脚本误报

验证阶段 `gate-preflight --strict` 出现 **1 个 FAIL**（上轮为 0）。定位结果：

- `docs/reports/gate-signoff-pack.md`（未跟踪 WIP）于 **13:06** 被业务方经并行方会话逐项确认，勾选第 ① 项「扩展能力上线不破坏主市场交易链路」并新增「签字记录（2026-11-09）」章节；**G5 门禁由业务方签字关闭**，`shops/mds/storefront-execution-plan_v1.0.md` 的 `P5-T09` 由 `[ ]` 回填 `[x]`、版本升 v1.32。这些**均为并行方 / 业务方动作，本轮未碰、未代勾、未回填、未判定其有效性**。
- 我上轮写的 `scripts/gate-preflight.mjs` 把「任何勾选项」一律判为 `FAIL`（原意是防止自动化代勾），因此把合法签字误报成「疑似代勾」，且 `--strict` 会让 CI 的 `gate-preflight` job 变红；摘要还硬编码 `signoffSigned: 0 / signoffPending: 17`，与真实状态不符。

最小修正（仅限我上轮自建的两个文件）：

- `scripts/gate-preflight.mjs`：新增只读 `readSignoffBoxes()` 供自检与摘要共用；判定改为 **全部未勾 → PASS** / **有勾选且存在「签字记录」→ WARN**（如实汇总、须人工核对签署来源、**脚本不判定签字有效性**）/ **有勾选但无签字记录 → FAIL**（保留代勾检测）；`--strict` 只对 `FAIL` 返回非零。
- `docs/reports/gate-preflight.md`：同步强约束与自检策略两处描述。
- 修正后：`--strict` 退出码 0，7 PASS / 2 WARN / 0 FAIL，摘要 **17 项 / 已签 1 / 待签 16**。

> 「无签字记录却被勾选 → FAIL」这一分支由代码审查确认，未做运行时扰动验证 —— 签字包是并行方 WIP，本轮不改动其任何字节。

---

## 7. 登记但未改的残留

| # | 残留 | 说明 / 建议 |
|---|---|---|
| R1 | `CART_LINE_MAX = 99` 口径不一致 | 常量只在 `mergeCartOnLogin` 封顶；`addItem` / `updateItemQty` 无上限，schema 允许 9999，下单侧 `qty` 也到 9999。`storefront-cart-merge.test.ts:103` 甚至用 `addItem qty:1000` 造数来断言「合并封顶 99」。到底该 99 还是 9999 属业务口径，**本轮不代决、不改常量、不改既有测试** |
| R2 | `mergeCartOnLogin` 的同类竞态 | 事务内 `findOne` + `ShopCartItem.create`（`cartService.ts` 合并分支），若顾客车在事务外被并发加购插入同 SKU 行，create 撞唯一键 → 整段事务回滚；`withDeadlockRetry` 只认 `1213 / ER_LOCK_DEADLOCK`，不重试唯一键冲突 → 500。需同样的回读 / upsert 处理，但会触及合并语义，本轮未扩 |
| R3 | 加购不校验库存 / 上架状态 | `ShopSku.findOne` 只按 `(id, tenantId)`；下架 SKU 与超量可进车，`toCartView` 仅展示 `available`，最终由 `quoteService` 拦截（上轮已修单次报价内重复 SKU 累计）。属既有分层设计 |
| R4 | `getOrCreateCart` 并发首访 | 无 token 时并发请求会各建一个游客车（token 为 48 位随机 bearer 凭证），无 token 幂等；属设计，不属本轮缺陷 |
| R5 | `increment` 未纳入死锁重试 | 单条 `UPDATE` 由 MySQL 行锁串行，无重复累加风险；若将来把行写入扩成多语句事务，重试会重复累加，需重新评估 |
| R6 | `increment` 不触发模型 hooks | 相对原 `existing.update` 少了实例级 hooks / 校验；`cart_items` 当前无 hooks，无影响；后续若加 hooks 需改回实例更新 |
| R7 | 测试租户 987699 遗留数据 | 修复前多轮失败实证留下若干游客车与明细，均为测试自建数据、不进生产；不自动清库，如需清理由 DBA 按 `tenantId` 处理 |
| R8 | 并行方 WIP 与业务签字 | 开局 46 已跟踪 + 51 未跟踪；13:06 业务签字关闭 G5、计划文档 v1.32 / `P5-T09 [x]`、签字包勾 1 项、CI 的 shops E2E 步骤组，均**未提交、未夹带、未代决**。剩余 16 项签字与 3 个门禁回填仍由责任方 / 真实环境处理 |

---

## 8. 复验命令

```bash
cd server && npx vitest run --no-file-parallelism __tests__/cart-add-race.test.ts
cd server && npx vitest run --no-file-parallelism --reporter=dot
npm --prefix server run typecheck
node scripts/check-doc-links.mjs
node scripts/gate-preflight.mjs --strict --json
```

*本报告只登记发现、修复与残留，不构成任何门禁通过或签字结论。*
