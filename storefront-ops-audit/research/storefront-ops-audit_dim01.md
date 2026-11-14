# storefront-ops-audit Dimension 01 · 结账链路（运费 / 税 / 券）

Route: C
证据范围：`shops/pages/checkout/index.vue`、`shops/server/api/[...mock].ts`、`shops/server/utils/commerce.ts`、`server/modules/storefront/services/{quoteService,shippingService,taxService}.ts`

## 结论

结算页展示的三个关键变量——配送方式、运费、税费——在当前链路上都无法生效，优惠券同样不生效。根因不在算法，而在 BFF 转发时把前端参数丢掉了。

## 证据链

### 1. 前端确实在传参

结算页报价请求带 `shippingRateId` 与 `couponCode`。[^dim01-fe-quote]

### 2. BFF 只转发 cartToken

报价分支先 `readBody` 消费掉请求体，再只把 `cartToken` 发给后端，注释写明"真实契约仅需 cartToken；地址/运费/优惠由后台规则表承接"。[^dim01-bff-quote]

这条注释与后端实现相反：`quoteService.createQuote` 的入参包含 `shippingAddress`、`couponCode`、`customerId`、`pointsToRedeem` 四项可选输入，后端控制器也从请求体读取。[^dim01-ctrl-quote]

### 3. 下单一侧同样丢参

建单分支转发的 body 只有 `idempotencyKey`、`email`、`shippingAddress`、`note`、`cartToken`、`attribution`，没有 `couponCode`，也没有 `pointsToRedeem`。[^dim01-bff-order]

后端 `createOrderSchema` 明确接受这两个字段。[^dim01-schema]

### 4. 结果：运费恒为默认值

`resolveShipping` 只有在拿到非空地址时才读配置；无地址直接返回 `config.checkout.shippingCents`。[^dim01-ship]

而该值来源是 `STORE_SHIPPING_CENTS ?? 0`。[^dim01-cfg]

在 `.env.example`、`server/.env.example` 中检索不到 `STORE_SHIPPING_CENTS`，即未配置时运费为 0。

### 5. 结果：税费恒为 0

`quoteService` 仅在 `input.shippingAddress && input.shippingAddress.country` 成立时才调 `resolveTax`，否则 `taxCents` 保持 0。[^dim01-tax]

这不是 `taxService` 的 fail-closed：`taxService` 在无税率配置时会抛 `TAX_UNAVAILABLE` 阻断报价。[^dim01-taxsvc] 由于上游根本没传国家，这段保护从未被触发。

### 6. 结果：配送方式列表恒为空

`commerce.ts` 的 `adaptQuote` 把 `shippingRates` 写死为空数组。[^dim01-adapt]

结算页用 `v-for="rate in quote?.shippingRates ?? []"` 渲染选项，[^dim01-rates] 空数组意味着用户看不到任何配送方式，只能沿用代码里写死的 `shippingRateId = 'std'`。

### 7. 优惠券不生效

`quoteService` 会调 `evaluateCoupon(input.couponCode, ...)` 并按券重算折扣。[^dim01-coupon] 但 BFF 未透传 `couponCode`，因此这段逻辑在 C 端永远拿到 `undefined`。

## 影响判断

- 运费为 0 时，跨境订单的物流成本由商家全额承担；若后续把 `STORE_SHIPPING_CENTS` 调大，则所有订单运费相同，分区定价（US/CA 8 美元、CN/JP/SG 12 美元、其余 15 美元）形同虚设。[^dim01-seed]
- 税费为 0 在美国销售税场景下构成合规敞口：系统本来设计了 fail-closed，但被上游绕过。
- 优惠券与积分抵扣不可用，直接削弱促销投放的转化手段。

## 修复方向（按性价比排序）

1. **BFF 白名单改为显式契约**：报价转发 `cartToken` + `shippingAddress` + `couponCode` + `pointsToRedeem`；下单转发同样补齐，并保留 `shippingRateId`。
2. **地址前置**：结算页进入即要求国家/邮编，先出「运费 + 税」再允许选支付方式，避免用户看到不含税总价后被跳价劝退。
3. **运价数组由后端下发**：把 `shop.shipping.zones` 展开为可选档位（标准/特快）返回，而不是让前端写死 `std`。
4. **契约测试**：为 BFF 转发层加一条断言「前端字段集合 ⊆ 转发字段集合」，防止后续再加参数时再次静默丢失。

[^dim01-fe-quote]: File: shops/pages/checkout/index.vue, 报价请求体 `body: { shippingRateId: shippingRateId.value, couponCode: couponCode.value || undefined }`.
[^dim01-bff-quote]: File: shops/server/api/[...mock].ts, 报价分支 `await readBody(event)` 与 `body: { cartToken }`.
[^dim01-ctrl-quote]: File: server/modules/storefront/controllers/checkoutController.ts, `quoteService.createQuote` 入参含 shippingAddress / couponCode / customerId / pointsToRedeem.
[^dim01-bff-order]: File: shops/server/api/[...mock].ts, 建单分支 body 字段清单不含 couponCode 与 pointsToRedeem.
[^dim01-schema]: File: server/shared/schemas/storefront.ts, `createOrderSchema` 含 `couponCode` 与 `pointsToRedeem`.
[^dim01-ship]: File: server/modules/storefront/services/shippingService.ts, `resolveShipping` 无地址时返回 `config.checkout?.shippingCents`.
[^dim01-cfg]: File: server/config/index.ts, `shippingCents: Number(process.env.STORE_SHIPPING_CENTS ?? 0)`.
[^dim01-tax]: File: server/modules/storefront/services/quoteService.ts, `if (input.shippingAddress && input.shippingAddress.country)` 才计税.
[^dim01-taxsvc]: File: server/modules/storefront/services/taxService.ts, 未配置税率抛 `TAX_UNAVAILABLE`.
[^dim01-adapt]: File: shops/server/utils/commerce.ts, `shippingRates: []`.
[^dim01-rates]: File: shops/pages/checkout/index.vue, `v-for="rate in quote?.shippingRates ?? []"`.
[^dim01-coupon]: File: server/modules/storefront/services/quoteService.ts, `evaluateCoupon(input.couponCode, ...)`.
[^dim01-seed]: File: server/migrations/20261105_000060_seed-shop-shipping-config.ts, zones 与 defaultShippingCents 配置.
