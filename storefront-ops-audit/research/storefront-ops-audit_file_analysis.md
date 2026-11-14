# storefront-ops-audit File Analysis

Route: C (File-only)
Time Check: 2026-11-13
Constraints: 仅基于 `D:/codes/web` 工作区源码，不引入外部检索

## File Inventory

| File | Type | 作用 |
| --- | --- | --- |
| `shops/pages/checkout/index.vue` | Nuxt 页面 | 结算页：地址/运费/优惠券/报价展示 |
| `shops/server/api/[...mock].ts` | Nitro BFF | C 端商务接口转发层（cart/quote/order/pay） |
| `shops/server/utils/commerce.ts` | BFF 适配层 | 真实后端契约 → 前端契约字段适配 |
| `server/modules/storefront/services/quoteService.ts` | 后端服务 | 服务端报价重算（价格/运价/税/券/会员/积分） |
| `server/modules/storefront/services/shippingService.ts` | 后端服务 | 配送白名单 + 分区运费 |
| `server/modules/storefront/services/taxService.ts` | 后端服务 | 税率规则表 Provider（fail-closed） |
| `server/modules/storefront/services/catalogService.ts` | 后端服务 | 目录只读查询（SPU/SKU/价格/库存） |
| `shops/composables/useCatalog.ts` | Nuxt composable | 目录数据获取封装 |
| `shops/pages/search.vue` | Nuxt 页面 | 搜索结果页 |
| `shops/pages/c/[slug].vue` | Nuxt 页面 | 类目集合页 + 类目 TDK |
| `shops/pages/products/[slug].vue` | Nuxt 页面 | 商品详情页（PDP） |
| `shops/components/commerce/ProductCard.vue` | 组件 | 商品卡（列表/集合复用） |
| `shops/components/commerce/JsonLd.vue` | 组件 | Product / Breadcrumb 结构化数据 |
| `shops/composables/useSeo.ts` | Nuxt composable | TDK / OG / canonical 输出 |
| `shops/server/routes/sitemap.xml.ts` | Nitro 路由 | sitemap 生成 |
| `shops/pages/policies/[slug].vue` | Nuxt 页面 | 政策页（隐私/条款/配送/退货） |
| `shops/shared/customer/auth.ts` | 共享模块 | 顾客登录态存储 |
| `server/modules/shop/models/ShopSpu.ts` | 模型 | 商品主表（含 slug/images/videos） |
| `server/modules/shop/models/ShopCategory.ts` | 模型 | 类目（多语言 name，无 slug 列） |
| `server/modules/shop/models/ShopSku.ts` | 模型 | SKU（含 hsCode/declaredValue，无重量） |
| `server/modules/shop/models/ShopPromotion.ts` | 模型 | 促销活动 |
| `server/modules/shop/services/marketingService.ts` | 后端服务 | 促销/券/搭配购 CRUD |
| `server/modules/shop/services/analyticsService.ts` | 后端服务 | 销售/利润/周转/CTR/搜索报表 |
| `server/modules/shop/services/orderService.ts` | 后端服务 | 订单列表/详情/发货/取消 |
| `server/modules/shop/services/orderMailService.ts` | 后端服务 | 订单邮件 outbox + 渲染 |
| `server/modules/storefront/services/abandonedCartService.ts` | 后端服务 | 弃购召回邮件 |
| `server/modules/storefront/services/wishlistService.ts` | 后端服务 | 收藏降价提醒 |
| `server/modules/storefront/services/subscriptionService.ts` | 后端服务 | newsletter / 到货通知 |
| `shops/shared/i18n/messages.ts` | 共享模块 | 中英双语文案表 |
| `shops/nuxt.config.ts` | 配置 | 站点标题模板 / routeRules / commerceSource |
| `server/modules/storefront/payments/providerRegistry.ts` | 支付注册表 | 可用支付通道与币种能力 |

## Per-File Extraction

### 结算链路（BFF 丢参）

`shops/server/api/[...mock].ts` 的报价分支只转发 `cartToken`，并显式注释"真实契约仅需 cartToken"：

```js
await readBody(event) // 消费 body（真实契约仅需 cartToken；地址/运费/优惠由后台规则表承接）
const cartToken = cartTokenFrom(cookie)
const res = await commerceRealFetch('checkout/quote', { method: 'POST', body: { cartToken }, cookie, authorization, requestId })
```

而前端 `shops/pages/checkout/index.vue` 明确在发 `shippingRateId` 与 `couponCode`：

```js
body: { shippingRateId: shippingRateId.value, couponCode: couponCode.value || undefined },
```

下单一侧同样只转发 5 个字段，未含 `couponCode` / `pointsToRedeem`：

```js
email: body.email,
shippingAddress: body.address,
note: body.note,
cartToken,
// 步骤 6：订单来源归因（site / utm），后端 createOrderSchema 精确剥离并固化进快照
attribution: body.attribution,
```

### 报价服务的前置条件

`quoteService.ts` 只有拿到地址才计税，否则静默为 0：

```js
let taxCents = 0
let taxRate = 0
if (input.shippingAddress && input.shippingAddress.country) {
```

运费在没有地址时回退到环境变量默认值：

```js
if (!address || typeof address !== 'object' || Object.keys(address).length === 0) {
    return { country: null, shippingCents: Math.round(Number(config.checkout?.shippingCents ?? 0)) }
```

`config.checkout.shippingCents` 来源为 `STORE_SHIPPING_CENTS ?? 0`，`.env.example` 与 `server/.env.example` 均未出现该变量。

### 报价出参的运价数组

`commerce.ts` 的适配函数把运价数组写死为空：

```js
shippingRates: [],
```

而结算页按该数组渲染配送方式选择：

```html
<div v-for="rate in quote?.shippingRates ?? []" :key="rate.id" class="mb-2 flex items-center gap-3">
```

### 目录检索

`useCatalog.listProducts` 的入参类型不含 keyword：

```js
params: { category?: string; sort?: string; page?: number; pageSize?: number; ids?: number[]; attr?: Record<string, string> } = {},
```

`search.vue` 因此只传分页，检索能力退化为客户端过滤：

```js
() => catalog.listProducts({ page: page.value, pageSize: 24 }),
```

```js
return list.filter((p) => p.title.toLowerCase().includes(term) || p.slug.toLowerCase().includes(term))
```

后端商品列表固定按 id 倒序，未消费 sort：

```js
const rows = await ShopSpu.findAll({ where, order: [['id', 'DESC']] })
```

### 类目 URL

`ShopCategory` 无 slug 列（仅 `name` / `level` / `sort`），BFF 以 id 拼 slug：

```js
rows.map((r) => ({ id: r.id, slug: `c-${r.id}`, name: r.name, level: r.level, kind: 'other', children: map(r.children ?? []) }))
```

类目页 TDK 表却以语义 slug 为键：

```js
const CATEGORY_SEO: Record<string, { name: string; desc: string; keywords: string }> = {
  'lace-wigs': {
```

### 商品详情呈现

PDP 仅渲染封面图，`product.images` 未被使用：

```html
<img v-if="product.cover" :src="product.cover" :alt="product.title" width="1200" height="1200" class="h-full w-full object-cover" />
```

### 商品 TDK 来源

`ShopSpu` 模型字段中没有 seo 列，`catalogService` 用 description 截断生成：

```js
seo: { title, description: description.slice(0, 160) },
```

### 结构化数据

`JsonLd.vue` 输出 Offer 但无 aggregateRating：

```js
offers: {
      '@type': 'Offer',
      price: (p.amount / 10 ** currency.value.decimalDigits).toFixed(currency.value.decimalDigits),
      priceCurrency: currency.value.code,
      availability: props.product.inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
    },
```

### 政策页数据源

`policies/[slug].vue` 直接引用 mock 常量，无后端读取：

```js
import { MOCK_POLICY_PAGES } from '@shared/mock/fixtures'
```

### 品牌名

`useSeo.ts` 内写死站点名：

```js
const siteName = 'Aurora Hair Studio'
```

`nuxt.config.ts` 标题模板同样写死：

```js
titleTemplate: '%s · Aurora Hair Studio',
```

而 `siteContext.ts` 已支持按 `X-Site-Id` 解析多站点。

### 促销模块接线

`marketingService` 暴露了 `activePromotions`，但全仓无调用方；`quoteService` 只读券、搭配购、会员等级，不读 `ShopPromotion`。

### 归因字段落库

`ShopOrder` 有 utm 六列，`checkoutService` 写入快照；但 `analyticsService` 的销售报表维度仅 day/month/channel/category，无 utm：

```js
case 'channel':
      key = `channel:${order.channelId}`
      break
    case 'country':
      key = `country:${(order.buyer as Record<string, unknown>)?.country ?? 'unknown'}`
      break
    case 'category':
      key = `category:${skuToCategory.get(it.skuId) ?? 0}`
      break
    default:
      key = `day:${(order.createdAt as Date).toISOString().slice(0, 10)}`
```

利润报表以申报价值充当成本：

```js
skus.forEach((s) => skuCost.set(s.id, Number(s.declaredValue ?? 0)))
```

### 后台订单检索

`orderService.listOrders` 仅接受 channelId/status：

```js
export async function listOrders(params: { channelId?: number; status?: string; page?: number; pageSize?: number } = {}) {
```

### 营销邮件正文

弃购召回邮件正文无商品链接、无退订入口：

```js
subject: `You left something in your cart`,
      bodyText: [
        `Hi,`,
        ``,
        `You added the following to your cart but haven't checked out yet:`,
```

降价提醒同样只含文案与价格：

```js
subject: `Price drop: ${opts.productName} -${discountPct}%`,
```

### 到货通知

后端已提供 `POST /restock/subscribe` 与 `ShopRestockSubscription`，但 `shops/pages` 与 `shops/components` 无任何 restock 调用。

### 支付通道

`providerRegistry.ts` 的通道清单无 Stripe / Apple Pay / Google Pay：

```js
{ id: 'paypal', label: 'PayPal', kind: 'card', supportedCurrencies: ['USD', 'EUR', 'GBP', 'CAD', 'AUD'], real: true },
```

### 顾客登录态

`shared/customer/auth.ts` 明文注释存 localStorage：

```js
 * P4-T01：顾客账户（注册/登录/登出/me）。token 存 localStorage，请求带 Bearer（customerAuth 校验）。
```

### 单语锁定

`shared/i18n/localePath.ts` 把多语言路由降级为恒返回原路径：

```js
export function localePath(path: string, _loc?: string): string {
  return path || '/'
}
```

## Cross-File Mapping

| 运营动作 | 前端入口 | BFF | 后端实现 | 结论 |
| --- | --- | --- | --- | --- |
| 选配送方式 | `checkout/index.vue` 渲染 `shippingRates` | `commerce.ts` 返回 `[]` | `shippingService.resolveShipping` 可算 | 断：列表恒空 |
| 计运费 | 传 `shippingRateId` | 丢弃 | 需地址 | 断：恒默认值 |
| 计税费 | 填地址 | 丢弃 | 需 `shippingAddress.country` | 断：恒 0 |
| 用优惠券 | 传 `couponCode` | 丢弃 | `evaluateCoupon` 可用 | 断：不生效 |
| 关键词搜索 | 传 q | 不传 keyword | `listProducts` 支持 keyword | 断：退化为前 24 条内过滤 |
| 类目排序 | 传 sort | 透传 | 固定 id DESC | 断：按钮无效 |
| 类目 SEO | 语义 slug 表 | 输出 `c-<id>` | 无 slug 列 | 断：TDK 全部回退 |
| 多图浏览 | `product.images` | 已透传 | 已有列 | 断：页面未渲染 |
| 商品评分 | 无 | — | `listReviews` 有 summary | 断：仅 PDP 评价区使用 |
| 促销活动 | 后台可建 | — | `activePromotions` 无调用方 | 断：不参与报价 |
| 到货通知 | 无 UI | 已直通 | 已实现 | 断：无入口 |
| 政策页维护 | 后台 CMS | — | 页面读 mock | 断：运营改不了 |
| 广告归因报表 | — | 已落库 utm | 报表无 utm 维度 | 断：无法算 ROI |
| 订单查单 | keyword 输入框 | 不透传 | 仅 status/channel | 断：搜索无效 |

## Gaps

- 未启动服务做运行时复现，全部结论基于源码静态路径核对；涉及"渲染为空"的判断以模板与适配函数为准。
- 未核验真实支付网关（PayPal/支付宝/银联）沙箱行为，仅核对注册表与准入逻辑。
- 未核查 `docs/` 之外的历史分支是否存在已修复版本；以当前工作区为准。
- 未评估数据库现存数据量对全量 `findAll` 分页的实际影响。

## Consolidated Themes

1. **BFF 是单点漏损源**：前端传参、BFF 白名单、后端契约三者没有契约测试锁定，导致运费/税/券/搜索/排序在同一层集体失效。
2. **后台"可配置"与 C 端"真消费"脱节**：促销、政策页、商品 TDK、类目 slug 均存在"后台能填、前台不生效"或"文档说可配、实际不可配"。
3. **独立站获客基础设施缺位**：类目 URL 无语义、商品无评分富摘要、无 Merchant feed、无广告归因报表。
4. **履约与客服工具偏薄**：无批量发货、无重量字段、无拣货单、订单检索弱。
5. **合规与信任细节不足**：政策页写死、营销邮件无退订、顾客 token 存 localStorage、无账号注销。
6. **生产就绪风险**：`commerceSource=auto` 网络抖动即回退 mock，可能向真实顾客展示假数据。
