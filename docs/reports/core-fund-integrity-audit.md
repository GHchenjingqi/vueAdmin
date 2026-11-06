# 核心资金链路完整性审计与修复

- 日期：2026-11-06 15:25
- 范围：HEAD 中干净（无并行方 WIP）的三个文件
  - `server/modules/storefront/services/couponService.ts`
  - `server/modules/storefront/services/taxService.ts`
  - `server/modules/shop/services/refundService.ts`
- 方法：独立租户 `987655` 写库实证复现 → 定位根因 → 最小修复 → 回归用例 → 两轮全量
- 结论：**3 项已修复并回归，2 项登记未改（含 1 项排除误报）**

本轮与前几轮「只出报告」不同：涉事文件在 HEAD 中已入库且工作树干净，因此修复直接落到主干，不需要等并行方提交。

---

## 1. 已修复缺陷

### A. 退款死锁重试导致外部通道重复退款（P0，资金双退）

**位置**：`refundService.ts` HEAD L166 / L170（`createRefund` 事务内）。

`createRefund` 把整个事务包在 `withDeadlockRetry` 里，而外部支付通道 `refundProvider(...)` 的调用在事务**内部**。若 provider 已实际退款、随后事务因死锁回滚，重试会重放整个事务并**再次调用 provider**，同时 `refundNo` 每轮重新生成，provider 侧也无法按退款单号自行去重。

**写库实证**（一次性复现脚本，已删除）：桩 provider 计数 + 在退款流水落库处注入一次 MySQL 死锁错误 →

```
REFUND_PROVIDER_RETRY {"providerCalls":2,"refundRows":1,"result":"succeeded"}
```

即外部通道退了两笔钱，账务只记一笔；退款额度校验也因此失准。

**修复**：
- `refundNo` 提到 `withDeadlockRetry` 之外生成（L130），重试全程复用同一外部幂等键；
- 新增跨重试共享的 `invokeProviderOnce`（L139）：用 promise 记住首次 provider 调用结果，事务回滚后重试直接复用，副作用最多发生一次；provider 首次失败时 promise 记住 rejected，重试不会也不应再退；
- 事务内改为 `await invokeProviderOnce({...})`（L186），不改退款状态机、不改 `pending/succeeded` 语义、不改任何对外契约。

**回归**：`core-fund-integrity.test.ts` 2 例（重试只调用一次 + provider 失败整笔回滚不重试）。

### B. 券核销「同订单换券」静默幂等成功（P1，对账口径分裂）

**位置**：`couponService.ts` HEAD L109、L141。

`redeemCoupon` 只按 `(tenantId, orderNo)` 查核销流水，查到就 `return` 视为幂等成功；`catch (UniqueConstraintError)` 同样无条件 `return`。两处都**没有核对券是否一致**。同一订单改用另一张券重放（或并发两请求用了不同券）时，订单按新券折扣展示/入账，但 `coupon_redemptions` 流水与 `coupons.usedCount` 仍记在旧券上。

**写库实证**：

```
CROSS_COUPON {"threw":"","redemptionCount":1,"redeemedCouponId":707,
              "expectedFirstCouponId":707,"secondCouponId":708,
              "firstUsedCount":1,"secondUsedCount":0}
```

第二次用券 708（折扣 2000 分）请求**零异常成功**，实际核销的仍是券 707（1000 分）。

**修复**：新增 `assertSameCoupon(tx?)`（L111），查到已有流水时比对 `couponId`，不一致抛 `409 COUPON_REDEMPTION_CONFLICT`；事务内查（L126）与唯一冲突兜底（L159）两条路径都走该校验，冲突兜底查不到流水时也拒绝静默成功。

**回归**：3 例（换券重放被拒、并发不同券只成功一个且用量归属正确、同券幂等与 8 路并发仍守恒）。

### C. 税率越界无 fail-closed 校验（P1，误收税）

**位置**：`taxService.ts` HEAD L78。

`TaxLine.rate` 契约注释明确为 `0..1`，但 `lookupRate` 返回值直接参与 `Math.round(subtotalCents * rate)`，无范围校验。`shop_tax_rates.rate` 是 `DECIMAL(5,4)`，运维把「19%」误填成 `19` 会被存成 `9.9999`，算出约 10 倍税费。

**写库实证**：

```
OUT_OF_RANGE_RATE {"rate":5,"taxCents":50000,"currency":"USD","reason":"rule_table"}
```

10000 分小计被算出 50000 分税费。

**修复**：L79-86 增加 `Number.isFinite` + `0..1` 校验，越界抛 `422 TAX_RATE_INVALID` 阻断报价——与该文件既有的 `TAX_UNAVAILABLE` fail-closed 哲学一致（配置异常不静默放行、不把误收税转嫁给买家）。

**回归**：2 例（越界阻断、合法边界 0 / 1 仍正常计算）。

---

## 2. 排除的误报（不登记为缺陷）

- **唯一索引未落库**：实查 `SHOW INDEX` 确认 `uq_redemption_order(tenantId,orderNo)`、`uk_order_refund_idem(tenantId,idempotencyKey)`、`uk_order_refund_no` 均为 `Non_unique=0`。与并行方 WIP 的佣金表同型问题**不存在于 HEAD 核心链路**。
- **并发核销超发**：8 路并发同券同订单 → `fulfilled:8, usedCount:1, redemptionRows:1`，守恒。
- **反向征收弱税号校验**：`taxId.trim().length >= 4` 即可 0 税率（实测 `'AAAA'` → `taxCents:0`），但 `quoteService.ts` L180-184 调用 `resolveTax` 时**未传 `customerType` / `taxId`**，真实下单链路不可达。因此当前不是生效漏洞，见 §3 登记而非本轮修复。

---

## 3. 登记未改（需业务/责任方决策）

| 项 | 实证 | 不代改原因 |
| --- | --- | --- |
| 反向征收税号校验过宽 | `customerType:'business', taxId:'AAAA'` → `rate:0, taxCents:0, reason:'reverse_charge'` | 「有效税号」需业务定义格式/国别规则，通常还要接 VIES 等外部校验；属税务合规决策。当前报价链路未接线，一旦接线必须先定规则 |
| `isDeadlock` 窄判定 | `couponService`、`refundService` 仍只认 `name === 'SequelizeDatabaseError'`，无原生 `ER_LOCK_DEADLOCK`/errno 1213 判定、重试无退避 | 与 `inventoryService` 已修版本不一致的技术债。本轮 A 的修复已保证重试安全，健壮化会让重试更频繁，故按「最小改动」原则留作独立一致性任务 |
| 报价税基口径 | 税费以 `subtotalCents` 为基数，bundle 优惠已折入该小计 | 折前/折后计税与券折顺序属业务口径，已在 `p5-fix-readiness.md` 登记，不在本轮重复决策 |

---

## 4. 验证证据

| 项 | 结果 |
| --- | --- |
| 新增 `core-fund-integrity.test.ts` | 7/7 |
| 既有 `storefront-coupon` / `storefront-tax` / `storefront-refund` 合并跑 | 34/34（4 文件）全绿 |
| 后端全量（连续两轮） | **665/665（73 文件）** 均全绿 |
| `tsc -p server/tsconfig.json --noEmit` | 0 错误 |
| `node scripts/check-doc-links.mjs` | 见提交记录（历史 MISSING 均来自并行方 WIP 文档，HEAD 版无此引用） |

一次性复现脚本已删除，独立租户 `987655` 的券、税率、订单、退款流水已在 `afterAll` 清理，未改动并行方 dev 数据。

---

## 5. 改动文件

| 文件 | 说明 |
| --- | --- |
| `server/modules/shop/services/refundService.ts` | A 修复：退款单号提到重试外 + provider 调用跨重试去重 |
| `server/modules/storefront/services/couponService.ts` | B 修复：幂等重放核对券一致 |
| `server/modules/storefront/services/taxService.ts` | C 修复：税率范围 fail-closed |
| `server/__tests__/core-fund-integrity.test.ts` | 新增 7 例回归 |
| `docs/reports/core-fund-integrity-audit.md` | 本报告 |
| `shops/mds/storefront-execution-plan_v1.0.md` | §11 风险登记 + 变更记录 |
