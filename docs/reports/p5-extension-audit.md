# P5 扩展模块正确性审计（P5-T04 / T05 / T07）

- 日期：2026-11-06 13:20
- 范围：并行方新交付的 Bundle / Referral / Warehouse-Routing 三个扩展模块（`server/modules/storefront/services/bundleService.ts`、`referralService.ts`、`server/modules/shop/services/warehouseRoutingService.ts`）及其接线 `quoteService.ts` / `checkoutService.ts`
- 方法：只读源码审查 + 一次性写库复现（真实 dev 库，脚本跑完即删、自建数据全部清理）
- 性质：**审计记录，未修改任何业务源码**；不代勾任何门禁

## 1. 结论摘要

| 编号 | 等级 | 模块 | 缺陷 | 状态 |
| --- | --- | --- | --- | --- |
| A | **P0 资金** | P5-T05 | Bundle 折扣被扣两次，订单金额少收一倍优惠额 | 已写库复现 |
| B | P1 资金 | P5-T07 | 迁移未建 `(tenantId, orderId)` 唯一索引，重复计佣可达 | 已查库 + 插入复现 |
| C | P1 风控 | P5-T07 | 归因窗口起点由客户端提供且无时间方向校验，30 天窗口可绕过 | 已 schema 复现 + 静态确证 |
| D | P2 履约 | P5-T04 | 配送承诺仓取 `rows[0]`，主仓缺货时与实际发货仓不一致 | 已写库复现 |

四项均位于并行方**未提交 WIP**，本会话不代改，原因见 §6。

## 2. 缺陷 A（P0）：Bundle 折扣双重扣减

### 复现输出

```
[A] base: {"subtotalCents":16000,"discountCents":0,"shippingCents":0,"taxCents":0,"amountCents":16000}
[A] hit : {"subtotalCents":15500,"bundleDiscountCents":500,"discountCents":500,
           "shippingCents":0,"taxCents":0,"amountCents":15000,"lineTotalSum":15500}
[A] expected amount = base - 500 = 15500 | actual delta = 1000
    | lineSum - amount + shipping + tax mismatch = 500
```

构造：SKU A 100 元 + SKU B 60 元（小计 16000 分），命中 `fixed 5`（500 分）Bundle，无地址故运费/税为 0。

**正确结果 15500 分，实际 15000 分** —— 每单多让利一倍 bundle 优惠。

### 根因（`quoteService.ts` 工作树行号）

| 行 | 代码 | 作用 |
| --- | --- | --- |
| 165-166 | `line.unitAmountCents = Math.max(0, ... - Math.round(share / line.qty))` / 重算 `lineTotalCents` | 折扣**已折入行单价** |
| 171 | `subtotalCents = quoteLines.reduce((s,l) => s + l.lineTotalCents, 0)` | 小计重算为**折后价** 15500 |
| 192 | `const discountCents = bundleDiscountCents + couponDiscountCents` | 仍保留 500 分折扣 |
| 193 | `amountCents = subtotalCents + shipping + tax - discountCents` | **再减一次** 500 → 15000 |

### 影响面

- `checkoutService.ts:172/182` 把 `quote.amountCents` 写入订单 `amount` / `amountCents`；`ShopOrderItem` 用折后单价建明细 → **订单明细合计 15500 与订单总额 15000 相差 500 分**，支付金额、退款上限、财务对账口径全部不一致
- `checkoutService.ts:237` 以 `quote.amountCents` 作为佣金基数，Referral 结算同步偏低
- `taxCents` / `evaluateCoupon` 以折后小计为基数，进一步放大口径分歧
- 另：L165 的 `Math.round(share / line.qty) * line.qty !== share`（share 为奇数且 qty>1 时），实际让利与 `bundleDiscountCents` 也会漂移

### 为什么现有测试没抓到

`storefront-bundle.test.ts` 唯一金额断言是
`expect(q.amountCents).toBe(q.subtotalCents + q.shippingCents + q.taxCents - q.discountCents)`——
用 quote **自身字段**做自洽校验；双重扣减同时改变了 `subtotalCents` 与 `amountCents`，等式恒成立。
缺少「无 Bundle 基线 vs 命中后」的外部锚点断言。

### 修复方案（需业务确认折扣基数口径，二选一）

1. **推荐**：行级分摊仅作展示口径，删除 L171 的重算，保持 `subtotalCents` 为折前小计，让 L193 的 `- discountCents` 成为唯一扣减点；同时确认 `resolveTax` / `evaluateCoupon` 应以折前还是折后小计为基数。
2. 保留折后小计，把 L192 改为 `discountCents = couponDiscountCents`（bundle 不再二次扣减），`bundleDiscountCents` 仅作展示字段。

两者都需额外处理 L165 的舍入：把 `share` 直接落到 `line.lineTotalCents`，避免 `round(share/qty)*qty` 放大/缩小让利。

### 待补用例（4 例）

1. 无 Bundle 基线 vs 命中 fixed 500：断言 `hit.amountCents === base.amountCents - 500`
2. 断言 `Σ line.lineTotalCents + shipping + tax - couponDiscount === amountCents`
3. `qty > 1` 且分摊 share 为奇数：断言实际让利严格等于 `bundleDiscountCents`
4. 建单后断言 `Σ ShopOrderItem.lineTotalCents` 与 `order.amountCents` 的差额符合明确的运费/税口径

## 3. 缺陷 B（P1）：佣金台账唯一索引只写在模型、未落到迁移

- `ShopReferralCommission.ts` 的 `indexes` 声明 `{ unique: true, fields: ['tenantId','orderId'], name: 'uq_referral_tenant_order' }`
- 迁移 `20261106_000069_add-referral-system.ts` 的 `up()` 只建了 `(tenantId, referrerCustomerId)` 与 `(tenantId, status)` 两个普通索引，**未建唯一索引**
- 项目走 Umzug 迁移而非 `sequelize.sync()`，模型里的 `indexes` 声明不会自动生效

### 复现输出

```
[B] DB indexes: PRIMARY, referral_commissions_tenant_id_referrer_customer_id, referral_commissions_tenant_id_status
[B] model declares uq_referral_tenant_order in DB? false
[B] duplicate commission inserts both succeeded? true
```

同一 `(tenantId, orderId)` 连续插入两条佣金**均成功**。

### 影响

`referralService.recordCommission()` 自身无幂等（直接 `ShopReferralCommission.create`）。建单重入、回调重放、消息重复消费都会产生多笔 `pending` 佣金；`commissionSummary()` 按状态累加，结算时会重复付款。

### 修复方案

- 新增独立迁移（推荐 `000070`，避免改动已执行的 `000069`）补
  `addIndex('referral_commissions', ['tenantId','orderId'], { unique: true, name: 'uq_referral_tenant_order' })`，`down()` 对应 `removeIndex`
- **补索引前须先清理历史重复数据**，否则迁移会失败
- service 层同时做幂等：`findOrCreate` / `upsert`，或捕获 `ER_DUP_ENTRY` 返回既有台账，避免重复请求直接 500

### 待补用例（2 例）

1. 同 `orderId` 连续两次 `recordCommission` → 台账只有 1 行，第二次返回既有记录
2. 并发两次调用 → 1 行成功、另一次不抛未处理异常

## 4. 缺陷 C（P1）：归因窗口起点完全由客户端控制

| 位置 | 行为 |
| --- | --- |
| `shared/schemas/storefront.ts:122` | `referralTouchAt: z.string().datetime({ offset: true }).optional()` —— 只校验 ISO 格式 |
| `checkoutService.ts:209` | 原样写入 `orders.referralTouchAt`，无服务端首次触点记录 |
| `checkoutService.ts:238` | 原样传给 `recordCommission` |
| `referralService.ts:92-94` | `touchAt + REFERRAL_WINDOW_DAYS` 算 `windowExpiredAt`，`Date.now() > expired` 判失效 |

### 复现输出

```
[C] schema accepts touchAt 1 year in future? true | value: 2027-11-06T05:19:19.916Z
[C] checkoutService stores it verbatim as orders.referralTouchAt (no server-side first-touch record)
```

全仓无「首次触点」服务端存储，也无 `touchAt <= now` 校验。

### 影响

客户端每次下单把 `referralTouchAt` 传成当前时间，30 天归因窗口永不失效；传未来时间还能任意延长窗口 → 佣金可被无限期套取。`storefront-referral.test.ts` 用 `isoOffset(-31)` 验证超窗 `void`，但该值同样由调用方提供，无法防绕过。
另：`new Date(invalid)` 得到 Invalid Date 时 `windowExpiredAt.getTime()` 为 `NaN`，`Date.now() > NaN === false` → 视为未过期并计佣（HTTP 入口有 schema 兜底，service 导出函数无防护）。

### 修复方案

- 服务端记录首次触点（按 `referralCode + customerId/visitorId` 落触点表或 cookie 签名值），建单时以服务端记录为准，**忽略客户端 `referralTouchAt`**
- 最低限度：`touchAt > now` 返回 400；Invalid Date 一律 fail-closed（视作 `void` 不计佣）

### 待补用例（3 例）

1. 服务端首次触点在 31 天前、客户端传 `now` → 仍 `void`
2. 客户端传未来时间 → 400 或 `void`
3. `referralTouchAt` 为非法值（直接调 service）→ 不产生 `pending` 佣金

## 5. 缺陷 D（P2）：配送承诺仓 ≠ 实际发货仓

- `warehouseRoutingService.ts:74` `pickWarehouse` 用 `rows.find(r => r.available > 0)`
- `warehouseRoutingService.ts:85` `getDeliveryCommitment` 用 `rows[0]`，**不过滤无货仓**
- `routeWarehouses` 排序为 `servesCountry desc → priority asc → available desc`，无货的高优先级/区域命中仓仍排第一

### 复现输出

```
[D] route: [{"wh":1002,"priority":1,"available":0,"serves":true,"days":1},
            {"wh":1003,"priority":100,"available":5,"serves":true,"days":10}]
[D] pickWarehouse -> 1003 (expected slow/with-stock = 1003)
[D] commitment   -> 1002 | days: 1 | available: 0
[D] commitment == picked? false
```

### 影响

`quoteService.ts:136` 把该承诺写入报价行，L200 取各 SKU 承诺天数最大值作为订单级承诺。客户看到「1 天送达」，实际从「10 天」仓发货；只要主仓缺货，承诺必然失真。现有 `storefront-warehouse-routing.test.ts` 的夹具各仓都有货，未覆盖该场景。

### 修复方案

`getDeliveryCommitment` 改为与 `pickWarehouse` 同源：抽 `primaryWarehouse(skuId, country)` 返回 `rows.find(r => r.available > 0)`，两处共用；无有货仓返回 `null`（`quoteService` 已按 `filter(Boolean)` 处理）。

### 待补用例（3 例）

1. 主仓 0 库存 → `commitment.warehouseId === pickWarehouse(...)`
2. 全部仓 0 库存 → `getDeliveryCommitment` 返回 `null`
3. 订单级承诺取「有货仓」中最大天数

## 6. 为什么本会话不代改

1. 四项涉及 `quoteService.ts`、`checkoutService.ts`、`shared/schemas/storefront.ts`、`warehouseRoutingService.ts`、`referralService.ts`、迁移 `000069`，`git status` 中全部是并行方 `M` / `??` WIP；其中 `referralService.ts`、`bundleService.ts`、`warehouseRoutingService.ts`、迁移 `000069` 是**未跟踪新文件，HEAD 里不存在**。
2. 此前修 G3 时用的是「只把本会话 hunk 送进 index」的补丁隔离（`b6b9bed`），适用于 HEAD 已有文件；本轮多数对象为未跟踪新文件，修复要么整文件提交（夹带对方 WIP），要么无法落盘。
3. 缺陷 A 的两种修法涉及「税费/券折以折前还是折后小计为基数」这一**业务规则判断**，按 §0.2 约定不代决；补唯一索引前的数据清理也需并行方确认其 dev 数据。

因此本轮只交付证据、精确修复方案与待补用例清单，等并行方提交 P5-T04/T05/T07 后由其或责任方修复。

## 7. 基线与清理

- 后端全量：首轮 2 文件失败（`inventoryService.ts:74` 的 `withDeadlockRetry` 并发死锁），**原样复跑 655/655（71 文件）全绿**，判定为并发 flake，非本轮引入；本轮未改任何源码
- `node scripts/check-doc-links.mjs`：31/31 引用有效
- 一次性复现脚本（临时 vitest 用例文件，跑完即删）已删除；自建 bundle、佣金探针行、仓库与库存记录已在 `afterAll` 清理，未改动并行方 dev 数据

## 8. 行动项优先级

| 优先级 | 缺陷 | 建议 |
| --- | --- | --- |
| **P0（上线阻断）** | A | 立即修：直接影响实收金额与订单明细一致性，且每单必现 |
| P1 | B / C | 结算资金正确性与佣金风控，需在放量前修 |
| P2 | D | 履约承诺口径，可与 P5-T04 收口一并处理 |
