# 优惠券后台治理链路审计 — 2026-11-10

> 发现式实证审计 R-券治理轮。方法：先写库实证跑红坐实，再最小修复转绿；全程不碰并行方 WIP。

## 1. 选题与范围

上一轮报告给出的候选之一是「优惠券 / 改价链路的并发与幂等复核（历轮只覆盖到报价快照与券占用）」。
本轮把范围收敛到**优惠券后台治理侧（创建 / 改码 / 删除 / 用量上限）**：

- 历轮 T-07（#55）只实现了 `evaluateCoupon` / `redeemCoupon` / `releaseCoupon` 的校验与原子占用，
  `marketingService` 的券 CRUD 与 `createCouponSchema` 从未被审计；
- 该链路直接决定「券能不能被无限使用」，属资金面；
- 涉及的 5 个文件均**不在并行方 WIP 列表**（并行方占用的是 `checkoutService` / `quoteService` /
  `checkoutController` / `routes/index.ts` / `storefront.ts` 等），可安全改动。

### 先证伪的两个怀疑（避免误报）

| 怀疑 | 结论 |
|---|---|
| `quoteService` 会员折扣 `tierDiscountCents = subtotal × (100 - discountPct)/100` 把「95 折」算成「减 95%」 | **证伪**。`discountPct` 语义是「95 = 95 折」，故 `100-95=5%` 才是折扣额，公式正确；执行计划 v1.40 亦有铂金 92 折 = `12990×8%` 实测记录。且该段属并行方未提交 WIP，按既定纪律不代改 |
| 券折 + 会员折 + 积分抵扣叠加可能产生负金额 | **证伪**。`amountCents = Math.max(0, ...)` 且积分抵扣前用同一 payable 钳制，无负金额 |

## 2. 实证：6 个缺陷全部跑红

新增 `__tests__/coupon-governance.test.ts`，按真实 HTTP 链路建模：
`validate` 中间件执行 `schema.parse(req.body)` **并回填 `req.body`**（zod 默认 strip 未知字段）
→ `marketingController` → `marketingService`。修复前 **6/6 全部失败**：

| 编号 | 缺陷 | 跑红证据 |
|---|---|---|
| **D1 高危** | `deleteCoupon` 直接 `row.destroy()`，不检查核销流水 | `deleteCoupon` 返回 `undefined`（删除成功）。后果：`ShopCouponRedemption.couponId` 悬空；运营「删除 + 同码重建」即可把 `usedCount` 归零，**用量上限被无限绕过**，历史订单券对账分裂 |
| **D2 高危** | `createCouponSchema` / `updateCouponSchema` 根本没有 `usageLimit` 字段 | `schema.parse({... usageLimit: 1}).usageLimit === undefined`。**端到端断裂链**：后台 `CouponList.vue` 提交的是 `totalCount`（发放总量，i18n「留空表示不限量」）→ 被 zod strip → 落库 `usageLimit = 0`（不限量）→ 券可无限核销；列表显示「已使用」却无上限；编辑回填读 `row.totalCount`（后端不返回）恒为 0。运营以为设了上限，实际从未生效 |
| D3 中危 | 券码落库无规范化 | 券码 `' mixgov… '` 原样入库；而 `evaluateCoupon` 查询时 `trim().toUpperCase()` → 该券在前台**永远核销不到** |
| D4 中危 | `createCoupon` 的 `count` 唯一性检查非原子 | 并发创建同码券，一个成功、另一个抛 `SequelizeUniqueConstraintError`（非 `AppError`）。注：`errorHandler` 会映射为 **409 而非 500**，问题准确定性是「未归一化的冲突响应 + Sequelize 原始英文 message」，不是 500 |
| D5 中危 | `updateCoupon` 无 `usageLimit` 下界校验 | 已核销 3 次的券可把上限改成 2，落库 `usedCount=3 > usageLimit=2`，数据不一致且券永久失效 |
| D6 中危 | `updateCoupon` 允许任意改券码 | 已有核销流水的券改码成功，历史流水 `couponCode` 与券定义分裂 |

> D2 是整轮最实质的问题：T-07 声称实现「用量上限」，但**后台入口从头到尾无法设置它**，
> 前端还有一个看起来能设、实际无效的「发放总量」输入框，属于静默失效。

## 3. 修复（最小改动，未触碰路由 / 控制器 / 网关）

**`shared/schemas/shop.ts`**
- `createCouponSchema` 增加 `usageLimit: z.number().int().min(0).default(0)`；
  `updateCouponSchema = createCouponSchema.partial()` 自动继承（测试额外断言 `.partial()` 叠加
  `.default()` 后字段不会被吞）。

**`modules/shop/services/marketingService.ts`**
- `normalizeCode` = `trim().toUpperCase()`，`createCoupon` / `updateCoupon` 统一口径，与 `evaluateCoupon` 对齐；
- `rejectDuplicateCode`：捕获 `UniqueConstraintError` 归一为 `AppError(400, 券码 XX 已存在)`，
  消除并发建/改码的 TOCTOU 兜底噪声（保留原有 `count` 快速失败）；
- `countRedemptions`：有核销流水时 `deleteCoupon` 抛 409 `COUPON_HAS_REDEMPTIONS`（提示可改有效期停用），
  `updateCoupon` 改码同样拒绝；
- `updateCoupon` 增加 `usageLimit > 0 && usageLimit < usedCount` 校验（400 `COUPON_USAGE_LIMIT_TOO_LOW`）。

**前端字段闭环**（否则修复只到 API 层，界面仍是坏的）
- `src/api/shop.ts`：`Coupon.totalCount` → `usageLimit`，`createCoupon` payload 同步；
- `src/views/shop/marketing/CouponList.vue`：表单 model / 提交 payload / 编辑回填 / 重置共 5 处
  `totalCount` → `usageLimit`，`0` 明确表示不限量。i18n 文案（「发放总量 / 留空表示不限量」）语义正确，未改。

**既有测试适配**
- `__tests__/shopPhases.test.ts > 创建活动与优惠券（券码唯一）` 原断言「券码原样返回」，
  与新规范化行为冲突，改为断言 `code.trim().toUpperCase()`，并给两处调用补 `usageLimit: 0`。

## 4. 验证

- `coupon-governance.test.ts` **6/6 通过**（修复前 6/6 跑红 → 转绿即为坐实证据）；
  `storefront-coupon.test.ts` **10/10 通过**（既有 T-07 原子占用 / 并发不超发 / 取消回退未回归）。
- 全量后端 **898 passed / 899 total**，唯一失败为历轮已知 `shopPhases.test.ts > 销售报表能聚合订单`
  超时（用时 8.9s > 默认 5s）；`--testTimeout=30000` 复跑 **18/18 通过**，与本轮无关。
- `server tsc --noEmit` **0 错误**；`vue-tsc --noEmit` 过滤 `CouponList.vue` / `api/shop.ts` **0 错误**。
- 测试库为真实 MySQL，`redeemCoupon` 的 `FOR UPDATE` 与用量上限判定是真实写库验证。

## 5. 残留与后续项（未代改）

1. **删除与并发核销的窄窗口**：`countRedemptions` 与 `row.destroy()` 非原子。若恰在 `redeemCoupon`
   事务插入流水、提交前执行删除，仍可能删掉券（该核销事务随后会因券不存在而回滚，不会造成资金损失，
   但会产生一条失败建单）。严格闭环需给 `coupon_redemptions.couponId` 加外键，或把删除放进
   事务并对 `coupons` 行加 `FOR UPDATE`，与 `redeemCoupon` 的行锁串行化。
2. **有流水的券仍可改 `value` / `type` / `currency` / 有效期**：核销流水存了
   `discountCents` / `couponCode` 快照，**金额对账不受影响**；但券定义与历史快照会分裂。
   如业务要求「已发券不可改权益」，需另立规则。
3. **后台列表未显示 `usageLimit` 列**：目前只在编辑弹窗可见；建议后续补列并对 0 显示「不限量」。
4. **`percent` 券 `value` 无 0–100 上界**：可配出 `value=9999`，但 `evaluateCoupon` 已封顶到小计
   （最多免单，无负金额），属配置面而非资金漏洞。补校验时要注意
   `updateCouponSchema = createCouponSchema.partial()` 依赖 `ZodObject`，不能直接挂 `.superRefine()`。
5. **营销 CRUD 未接入 `recordAdminAction`**：上轮审计矩阵的「未补」项，本轮按最小改动未扩散。
6. 既有残留不变：多租户 Webhook 的 ambient tenant 兜底 1、失败路径未留审计、
   生产 `PAYMENT_CREDENTIAL_SECRET` 建议与 `JWT_SECRET` 解耦、真实扣款联调仍需商户凭据。

## 6. 并行方边界

本轮 6 个提交文件（`shop.ts` / `marketingService.ts` / `shopPhases.test.ts` / `coupon-governance.test.ts` /
`api/shop.ts` / `CouponList.vue`）与 1 份报告，diff 关键词扫描确认**零并行方 WIP 混入**；
会话期间并行方新增的会员 / 营销邮件 / 顾客管理 / checkout / quote 文件全程未改、未暂存、未代提交。

## 7. 下一轮候选方向

- 把「未补」高敏操作（改价、评价审核、目录 CRUD）接入 `recordAdminAction`，并给审计查询页加 action/actor 过滤。
- 三个扫描器（工作流超时 / 支付对账 / 订单邮件）的间隔、失败告警、多租户口径统一治理。
- 优惠券剩余边界：按 §5.1 给删除加事务行锁或外键，按 §5.4 收紧 percent 券配置。
- 订单取消 / 退款释放券占用与 `usedCount` 的一致性全链路复核（`cancelOrder` 之外的后台取消路径）。
