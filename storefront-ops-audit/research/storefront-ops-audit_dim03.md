# storefront-ops-audit Dimension 03 · 营销与归因（投入产出可见性）

Route: C
证据范围：`server/modules/shop/services/marketingService.ts`、`server/modules/shop/models/ShopPromotion.ts`、`server/modules/storefront/services/quoteService.ts`、`server/modules/shop/services/analyticsService.ts`、`server/modules/shop/models/ShopOrder.ts`、`shops/shared/analytics/attribution.ts`

## 结论

系统已经采集了广告归因数据（UTM 六字段），但报表层没有 utm 维度；促销活动能建但不能作用于订单；利润报表用"申报价值"当成本。三者叠加，运营无法回答"这条广告赚不赚钱、这个活动有没有效果"。

## 证据链

### 1. 促销活动与交易链路断开

`ShopPromotion` 模型存在（name / type / scope / rule / startAt / endAt）。[^dim03-promo]

`marketingService` 提供完整 CRUD，并有 `activePromotions()` 查询进行中的活动。[^dim03-svc] 但全仓检索 `activePromotions(` 除定义文件外无任何调用方。

`quoteService` 的优惠计算只包含四类：搭配购（`evaluateBundle`）、券（`evaluateCoupon`）、会员等级、积分抵扣。[^dim03-quote] 没有 `ShopPromotion`。

结论：后台建的"限时折扣/满减"活动，不会体现在任何订单金额里。

### 2. 归因已落库，报表不认

`ShopOrder` 有 `utmSource` / `utmMedium` / `utmCampaign` / `utmTerm` / `utmContent` / `sourceSiteId` 六列。[^dim03-order]

前端 `attribution.ts` 在结算时采集 UTM 五参 + landingPage + referrer，并做首次触达缓存。[^dim03-attr]

`checkoutService` 把 attribution 写入订单快照。[^dim03-checkout]

但 `analyticsService.salesReport` 的 `dimension` 只支持 day / month / channel / category / country，[^dim03-report] 全文件不含 `utm`。[^dim03-grep]

`analyticsController` 的维度白名单同样只有 4 项。[^dim03-ctrl]

结论：广告花费与订单收入之间没有可join的报表维度，ROI 只能靠人工导出 Excel 拼。

### 3. 利润报表用申报价值当成本

```js
skus.forEach((s) => skuCost.set(s.id, Number(s.declaredValue ?? 0)))
```

[^dim03-cost]

`declaredValue` 是报关申报价值（用于清关），不等于采购成本。用它算毛利会同时污染两个口径：既不是真实毛利，又让报关数据承担了财务职责。

### 4. 商品无重量，运费无法按重计费

在 `server/modules/shop/models/` 全目录检索 `weight` / `length` / `width` / `height`，无任何命中。[^dim03-weight]

跨境物流的主流计费方式是实重/体积重取大，缺重量字段意味着运费只能按"国家分区固定价"，无法支撑多 SKU 混合订单、也无法和货代账单对账。

## 影响判断

- 促销不生效是最伤运营积极性的问题：后台建了活动、前台没变化，运营会逐渐不再使用该模块。
- 无 utm 报表时，投放决策只能依赖 GA4 或平台后台，独立站自身的订单数据无法闭环验证。
- 成本口径错会导致"看起来赚钱实际亏钱"，尤其在汇率波动时（利润报表同时算 fxGainLoss）。

## 修复方向

1. **促销接入报价**：在 `createQuote` 中按 `scope`（全站/类目/单品）匹配 `activePromotions`，与券、会员折扣按固定优先级叠加，并把命中信息写进 `policySnapshot`。
2. **utm 维度报表**：`salesReport` 增加 `dimension=utm`（按 `utmSource + utmCampaign` 分组），后台看板加"渠道 ROI"表：收入、订单数、客单价。花费可先用 CSV 导入。
3. **成本字段独立**：`ShopSku` 增 `costAmount`（采购成本，与 `declaredValue` 分离），利润报表改读该字段；`declaredValue` 只服务报关。
4. **重量字段**：`ShopSku` 增 `weightGram` 与三边尺寸，运价规则表支持"首重 + 续重"，为后续对接货代 API 留接口。

[^dim03-promo]: File: server/modules/shop/models/ShopPromotion.ts, 字段 name/type/scope/rule/startAt/endAt.
[^dim03-svc]: File: server/modules/shop/services/marketingService.ts, `export async function activePromotions()`.
[^dim03-quote]: File: server/modules/storefront/services/quoteService.ts, 优惠仅 bundle/coupon/tier/points 四类.
[^dim03-order]: File: server/modules/shop/models/ShopOrder.ts, utmSource/utmMedium/utmCampaign/utmTerm/utmContent/sourceSiteId.
[^dim03-attr]: File: shops/shared/analytics/attribution.ts, `parseAttribution` 与 `collectAttribution`.
[^dim03-checkout]: File: server/modules/storefront/services/checkoutService.ts, 建单写入 attribution 快照.
[^dim03-report]: File: server/modules/shop/services/analyticsService.ts, `switch (query.dimension)` 分支 day/channel/country/category.
[^dim03-grep]: File: server/modules/shop/services/analyticsService.ts, 全文件无 utm 字符串.
[^dim03-ctrl]: File: server/modules/shop/controllers/analyticsController.ts, `['day','month','channel','category']` 白名单.
[^dim03-cost]: File: server/modules/shop/services/analyticsService.ts, `skuCost.set(s.id, Number(s.declaredValue ?? 0))`.
[^dim03-weight]: File: server/modules/shop/models/, 全目录检索 weight/length/width/height 无命中.
