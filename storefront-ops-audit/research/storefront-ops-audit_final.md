# 独立站运营视角的改造方案 · vue-admin 跨境电商项目

> 基于 `D:/codes/web` 源码逐层核对（前端 → BFF → 后端服务 → 数据模型），route C（仅文件证据）。
> 全部结论可复现，证据台账见 `storefront-ops-audit_evidence.json`。

## 一、核心判断

这个项目**功能造得比它接得上的多**。

后端已经具备的能力——关键词检索与同义词展开、分区运费、税率 fail-closed、促销模型、到货订阅、UTM 归因落库、评价评分汇总、多站点上下文——在 C 端链路上有相当一部分**没有被接线**。运营感受到的"缺功能"，多数其实是"功能没接上"。

这个判断直接改变优先级：如果按"缺什么做什么"的思路推进，会重复建设已有能力；按"接线 + 锁契约"的思路推进，投入最小、见效最快。

一个佐证：`docs/SEO_SPEC.md` 规定集合页 URL 为 `/c/lace-wigs`，而代码实际输出 `/c/c-11`；`[...mock].ts` 的注释写"真实契约仅需 cartToken"，而 `quoteSchema` 明明接收 `shippingAddress`/`couponCode`/`pointsToRedeem`。**文档描述的是设计意图，代码停在了"后端做完、前端未接"的中间态。**

## 二、独立站与平台电商的差异，决定该补什么

平台电商（Amazon/Shopify 托管）自带流量、信任与复购基础设施。做独立站，这三件事必须自己解决：

| 独立站必须自己搞定 | 对应本项目的缺口 |
| --- | --- |
| **流量**：SEO 是免费流量的唯一来源 | 类目 URL 无语义、类目 TDK 全落空、sitemap 上限 60 条、商品无评分富摘要 |
| **转化**：结账链路任何摩擦都会直接掉单 | BFF 丢参导致券/税/运费全失效、PDP 单图、无 Apple Pay |
| **信任**：政策、评价、支付安全 | 政策页写死在前端 mock、顾客 token 存 localStorage、无账号注销 |
| **复购**：邮件与会员是唯一自有渠道 | 营销邮件无 CTA 无退订、到货通知后端有前台无入口、促销不参与报价 |

按这个框架，下面的问题就自然分出了轻重。

## 三、必须先修的两件事（直接决定账对不对）

### 1. BFF 丢参：一处漏字段，三个收入机制同时失效

**这是全项目影响面最广的单点缺陷，而且有很强的隐蔽性**——页面不报错、订单能下、金额看起来"合理"，只是少了税和运费。

证据链：

- 结算页确实在传参：`body: { shippingRateId, couponCode }`（`shops/pages/checkout/index.vue`）
- BFF 先 `readBody` 消费掉请求体，再只发 `cartToken`（`shops/server/api/[...mock].ts`）
- 下单一侧只转发 `email`/`shippingAddress`/`note`/`cartToken`/`attribution`，**没有 `couponCode`，也没有 `pointsToRedeem`**
- 后端 `quoteSchema` 明确接收这两个字段，`quoteService` 依赖它们才能算出运费与税

由此产生三个连锁结果：

| 机制 | 代码事实 | 后果 |
| --- | --- | --- |
| 运费 | `resolveShipping` 无地址时返回 `config.checkout.shippingCents`；该值来自 `STORE_SHIPPING_CENTS ?? 0`，而 `.env.example` 与 `server/.env.example` 均无此变量 | 运费为 0，跨境物流成本由商家全额承担 |
| 税费 | `quoteService` 仅在 `input.shippingAddress && input.shippingAddress.country` 时才调 `resolveTax` | 税费恒为 0。`taxService` 的 fail-closed 保护（无税率配置即抛 `TAX_UNAVAILABLE`）**从未被触发**，因为上游根本没传国家 |
| 配送方式 | `commerce.ts` 的 `adaptQuote` 把 `shippingRates` 写死为 `[]` | 结算页 `v-for="rate in quote?.shippingRates ?? []"` 渲染不出任何选项，用户只能沿用代码里写死的 `'std'` |
| 优惠券 | `quoteService` 会调 `evaluateCoupon`，但 BFF 未透传 `couponCode` | 券永远拿到 `undefined`，促销手段失效 |

**改法**：

1. BFF 报价转发 `cartToken` + `shippingAddress` + `couponCode` + `pointsToRedeem`；下单同样补齐，并保留 `shippingRateId`。
2. 结算页进入即要求国家/邮编，先出「运费 + 税」再允许选支付方式——避免用户看到不含税总价后被跳价劝退。
3. `shippingRates` 改由后端下发（把 `shop.shipping.zones` 展开为标准/特快两档），前端不要写死 `std`。

### 2. `commerceSource=auto` 会在生产环境静默回退 mock

`nuxt.config.ts` 默认 `commerceSource: process.env.NUXT_COMMERCE_SOURCE || 'auto'`；`auto` 的语义是"real 优先，网络级失败回退 mock"；目录 BFF 在 catch 后直接 `const mock = mockCatalog(path, query)`。

**后果**：后端短暂不可达（重启、超时、证书过期）时，C 端会**正常返回 200 并展示演示商品**，顾客可以一路下单，订单落到 mock store 而非真实数据库。监控层面看到的是"页面正常"，不会触发告警。这是最危险的一类故障——它不报错。

更需要注意：`shops/.env.example` 里写的就是 `NUXT_COMMERCE_SOURCE=mock`，按模板部署会直接进入 mock 模式。

**改法**：

1. 生产强制 real：`NODE_ENV=production` 时忽略 `auto`/`mock`，或在启动时校验并拒绝以 mock 启动生产实例。
2. 降级必须可见：回退时打 `X-Data-Source: mock` 响应头 + 上报监控；C 端检测到 mock 数据源时展示维护横幅，而不是静默售卖。

## 四、流量与转化（发现层）

### 3. 搜索退化为"最新 24 条的前端过滤"

`useCatalog.listProducts` 的参数类型里没有 `keyword`，搜索页只传分页，然后在客户端过滤：

```js
() => catalog.listProducts({ page: page.value, pageSize: 24 }),
// ...
return list.filter((p) => p.title.toLowerCase().includes(term) || p.slug.toLowerCase().includes(term))
```

于是搜索 `lace` 时，系统只会在**最新 24 条**商品里找，第 25 条以后即使完全匹配也搜不到。

而后端本来支持：`catalogService.listProducts` 接受 `params.keyword`，并用 `expandTerm` 做同义词 OR 展开（内置假发品类同义词表：wig/hairpiece、body wave/bodywave 等），`storefrontProductQuerySchema` 也声明了 `keyword`。

**能力已存在，只是 composable 没接。**

**改法**：`useCatalog.listProducts` 增加 `keyword` 并透传；搜索页改为服务端检索 + 服务端分页；同时让后端支持 `sort`（当前固定 `order: [['id','DESC']]`，类目页三个排序按钮全部无效）。

### 4. 类目 URL 是 `c-<id>`，类目 TDK 全部落空

`ShopCategory` 模型只有 `name`/`level`/`sort`，**没有 slug 列**；BFF 用 id 拼 slug：`` slug: `c-${r.id}` ``。

而类目页的 TDK 表以语义化 slug 为键：

```js
const CATEGORY_SEO: Record<string, {...}> = {
  'lace-wigs': { ... },
```

实际 URL 是 `/c/c-11`，永远命中不到 `lace-wigs`，标题回退为 `humanize(category)`，描述回退为通用模板。

类目页是独立站自然流量的主入口（`lace wigs`、`hd lace wigs` 这类词），这块不修，其他 SEO 工作收益都受限。

**改法**：`ShopCategory` 增加 `slug` 列并回填（name 生成 + 唯一性校验 + 冲突加后缀），BFF 输出真实 slug，同时保留 `c-<id>` 的 301 重定向兼容旧链接。

### 5. PDP 不渲染多图

`ShopSpu` 有 `images` 数组列，后端 DTO 返回 `images`，BFF 也透传 `images: p.images ?? []`——但 PDP 模板只用 `product.cover` 渲染一张图，全文件没出现 `images`。

假发品类靠发际线、发缝、密度做决策，单图撑不起客单价。

**改法**：主图 + 缩略图切换，纯前端改造，数据已就绪。

### 6. 商品缺评分，拿不到富摘要

`JsonLd.vue` 只输出 name/description/offers，没有 `aggregateRating`；`ProductCard.vue` 也没有星级。而 `reviewService.listReviews` 已经返回 `summary: { total, average, distribution }`。

同排名下，有无星级对搜索结果点击率影响明显。

**改法**：PDP 的 JSON-LD 补 `aggregateRating`；列表接口补 `ratingAvg`/`reviewCount` 聚合，商品卡显示星级。

### 7. sitemap 静默截断在 60 条

`sitemap.xml.ts` 请求 `/api/catalog/products?pageSize=60`，而 schema 层 `pageSize` 上限就是 60。商品数超过 60 后，剩余商品不进 sitemap。每个 `<url>` 也只有 `<loc>`，没有 `<lastmod>`——而 `SEO_SPEC.md` 明确要求 `<lastmod>` 取商品更新时间。

**改法**：按 `total` 循环拉全部分页；补 `<lastmod>`；超 5 万条时拆 sitemap index。

## 五、投放能不能优化（归因层）

### 8. UTM 已落库，报表却不认

`ShopOrder` 有 `utmSource`/`utmMedium`/`utmCampaign`/`utmTerm`/`utmContent`/`sourceSiteId` 六列；`attribution.ts` 在结算时采集五参 + landingPage + referrer 并做首次触达缓存；`checkoutService` 把 attribution 写入订单快照。

但 `analyticsService.salesReport` 的维度只有 day/month/channel/category/country，全文件不含 `utm`；`analyticsController` 的白名单同样只有 4 项。

**广告花费与订单收入之间没有可 join 的报表维度，ROI 只能人工拼 Excel。**

**改法**：`salesReport` 增加 `dimension=utm`（按 `utmSource + utmCampaign` 分组），后台看板加"渠道 ROI"表（收入、订单数、客单价）；花费先支持 CSV 导入。

### 9. 利润报表用申报价值当成本

```js
skus.forEach((s) => skuCost.set(s.id, Number(s.declaredValue ?? 0)))
```

`declaredValue` 是报关申报价值（清关用），不等于采购成本。用它算毛利会同时污染两个口径：既不是真实毛利，又让报关数据承担了财务职责。

**改法**：`ShopSku` 增加 `costAmount`（采购成本，与 `declaredValue` 分离），利润报表改读该字段。

### 10. 促销活动能建，但不作用于订单

`ShopPromotion` 模型存在，`marketingService` 有完整 CRUD 和 `activePromotions()`，但**全仓检索 `activePromotions(` 除定义文件外无任何调用方**；`quoteService` 的优惠只认搭配购、券、会员等级、积分四类。

后台建"限时折扣/满减"，不会体现在任何订单金额里。运营会逐渐弃用该模块。

**改法**：`createQuote` 中按 `scope`（全站/类目/单品）匹配 `activePromotions`，与券、会员折扣按固定优先级叠加，命中信息写进 `policySnapshot`。

## 六、每单人力成本（履约层）

### 11. 无批量发货

`orderService.ship(id, input)` 一次只处理一个订单；后台发货弹窗只有承运商和运单号两个输入框，没有多选、没有批量导入运单号。

跨境日出百单时，逐单复制粘贴运单号是纯重复劳动。

**改法**：新增 `POST /shop/orders/batch-ship`，接受 `[{orderId, carrier, trackingNo}]`，逐单复用现有事务逻辑，单条失败不阻断其余并返回明细。

### 12. 商品无重量字段

在 `server/modules/shop/models/` 全目录检索 `weight`/`length`/`width`/`height`，**零命中**。

跨境物流主流计费是实重/体积重取大。缺重量意味着运费只能按"国家分区固定价"，无法支撑多 SKU 混合订单，也无法与货代账单对账。

**改法**：`ShopSku` 增 `weightGram` + 三边尺寸，运价规则表支持"首重 + 续重"。

### 13. RMA 批准不触发退款

`approveRma` 只做一次 CAS 更新（`pending → approved`），与 `refundService` 之间没有调用关系；状态机没有 `exchange` 分支，不支持部分退与换货。

售后要在另一个界面再操作一次，且换货需求无处安放。

**改法**：批准 RMA 时可填退款金额（支持部分退），调用 `refundService`；增加 `exchange` 类型走换货重发。

### 14. 缺作业单据

在 `server/modules` 与 `shops/server` 检索 packing slip / shipping label / waybill / invoice，除计费模块的 `Invoice`（订阅计费）与支付网关的 `invoice_id` 注释外无命中。

`ship` 里的 `customsNo` 由首个 SKU 拼接：
```js
`${firstSku.hsCode || 'NA'}-${firstSku.originCountry || 'NA'}-${firstSku.declaredValue ?? 'NA'}`
```
这是"凭证编号"，不是可打印的报关单据。

**改法**：新增拣货单（按订单聚合 SKU 汇总）与打包面单（收件人 + 条码）PDF 导出，复用现有报表导出能力。

## 七、复购与合规（治理层）

### 15. 到货通知后端有、前台没入口

`subscriptionService` 实现了 `subscribeRestock` 与 `notifyRestock`（到货后取 `waiting` 订阅者发送），路由 `POST /restock/subscribe` 已挂载——但在 `shops/pages` 与 `shops/components` 全目录检索 `restock`，**无任何命中**。

缺货商品页因此没有"留下邮箱等补货"入口，缺货即流失。

**改法**：PDP 在 `!inStock` 时显示邮箱输入，接 `POST /restock/subscribe`。

### 16. 营销邮件无转化链路、无退订

弃购召回邮件正文只有商品名、数量、行小计与一句提醒，**没有商品链接、没有回到购物车的 CTA**；降价提醒同理。两封邮件都不含退订链接——`isUnsubscribed` 只在入队前做过滤，正文没有一键退订入口。

而 `subscriptionService` 已实现基于 token 的 `GET /newsletter/unsubscribe`，能力现成。

**改法**：所有营销邮件统一注入 `{{unsubscribeUrl}}` 与商品深链；模板抽到 DB 或文件，改文案不必发版。

### 17. 政策页写死在前端

`policies/[slug].vue` 直接 `import { MOCK_POLICY_PAGES } from '@shared/mock/fixtures'`。后台没有政策页编辑入口，隐私政策/退货政策更新必须改代码发版。

**改法**：复用 `ShopArticle` 或新增 `shop_policies` 表，前台读接口。

### 18. 顾客 token 存 localStorage，无账号注销

`shared/customer/auth.ts` 明确 `localStorage.setItem(TOKEN_KEY, token)`；检索 `deleteAccount`/`注销`/`dataExport` 无命中。

后台管理端用的是 httpOnly Cookie + `RefreshToken` 模型，C 端没有对齐。localStorage 存 token 在 XSS 场景下可被直接读取；无注销入口不满足 GDPR 的被遗忘权。

**改法**：token 改 httpOnly Cookie（`SameSite=Lax`、`Secure`），或至少内存 + refresh 双 token；补 `DELETE /auth/me` 与 `GET /auth/me/export`。

### 19. 品牌名写死，多站点能力未启用

`useSeo.ts` 内 `const siteName = 'Aurora Hair Studio'`，`nuxt.config.ts` 的 `titleTemplate` 同样写死。而 `siteContext.ts` 已支持按 `X-Site-Id` 解析不同站点、取该站点的 `defaultCurrency`/`defaultLocale`。

更关键：在 `shops/` 内检索 `X-Site-Id` **无命中**——C 端从未发送该头，多站点能力实际恒落默认租户。

**改法**：`siteName` 改为从 `/api/store-config` 下发，`titleTemplate` 用 `useHead` 动态设置；C 端请求统一注入 `X-Site-Id`（来自域名映射）。

## 八、支付本地化

`providerRegistry` 的通道清单为 paypal / wechat / alipay / unionpay / mock / bnpl，**无 Stripe、无 Apple Pay、无 Google Pay**。

对欧美假发品类（移动端占比高），Apple Pay 对结账完成率的提升通常比较明显。好消息是支付链路本身设计得扎实：三重准入校验（后台勾选 + flag + 币种）、建会话与 webhook 两侧都校验、缺配置直接 503 拒绝降级、凭据 `iv:tag:cipher` 加密、每 5 分钟对账补单、退款按原通道原路退。**这部分是全项目最稳的模块，可以直接在 `GatewaySession` 的 `sdk` 动作类型上扩展 Stripe。**

## 九、一个反直觉的建议：先做契约测试，而不是继续加功能

Dim01 的丢参不是孤例。搜索 keyword 未透传、utm 未进报表、restock 无入口——它们属于**同一类故障模式**：

> 后端能力已实现，但 BFF / composable / 页面三层中有一层没接上，且没有任何测试会发现它。

单修 Dim01 只是修一个症状。真正的解法是在 BFF 转发层加一条契约断言：**前端请求体字段集合 ⊆ BFF 转发字段集合，缺一个就测试失败**。这条测试写一次，能防住后续所有同类问题。

同理，`quoteSchema` 已声明三个字段，但没有任何测试验证"从结算页发起报价时，这三个字段真的到达了 service"。补一条端到端契约测试，比再写三个功能更有价值。

## 十、落地顺序（按投入产出比）

| 批次 | 内容 | 为什么排这里 |
| --- | --- | --- |
| **第 1 批** | BFF 报价/下单补全字段 + 生产强制 real + 降级可见化 + 契约测试 | 最小改动，直接修收入与数据真实性；契约测试防复发 |
| **第 2 批** | 搜索透传 keyword + 后端 sort + 类目 slug 落库与回填 + PDP 多图 + 评分进 JSON-LD | 数据已有，只改透传与渲染，直接提升转化与自然流量 |
| **第 3 批** | 促销接入报价 + utm 报表 + 成本字段独立 + 重量字段 | 让投放与促销动作可衡量，为按重计费铺路 |
| **第 4 批** | 批量发货 + 作业单据 + RMA 退款打通 + 到货订阅入口 | 降人力成本，支撑规模化 |
| **第 5 批** | 政策页 CMS 化 + 邮件模板升级（CTA/退订） + 账号注销与数据导出 + 品牌配置化 | 合规与长期信任 |
| **第 6 批** | 接入 Stripe（card + Apple Pay + Google Pay） | 依赖外部开户，可并行推进 |

## 十一、需要业务侧先确认的四件事

这些不是代码能决定的，定不下来就不该动手：

1. **运费策略**：按国家分区固定价，还是按重量阶梯？——决定 `ShopSku` 要不要加重量、运价表怎么设计。
2. **税务责任**：美国销售税是商家代收代缴，还是 DDU 由买家承担？`MARKET_STRATEGY.md` 写的是 DDU + 商家代收销售税，两者并存需在结算页明确告知，否则客诉。
3. **成本口径**：采购成本由谁维护、多久更新？——决定利润报表的可信度。
4. **促销优先级**：促销、券、会员折扣、积分同时命中时的叠加顺序？必须先定规则再写代码，否则会出现"折上折到 0 元"。

## 十二、方法边界

- 全部结论基于源码静态核对，**未启动服务做运行时复现**；"渲染为空"类判断以模板与适配函数为准。
- "某功能不存在"的判断来自全目录关键词检索 + 路由清单比对，不排除以非预期命名实现。
- 支付网关的真实沙箱行为、数据库现存数据量对分页性能的影响，均未验证。
- 转化率影响（Apple Pay、评分富摘要、多图）属行业经验判断，非本项目实测数据。
- 未核查历史分支是否存在已修复版本，以当前工作区为准。

---

### 附：证据文件索引

| 文件 | 内容 |
| --- | --- |
| `research/storefront-ops-audit_file_analysis.md` | 文件清单与逐层提取，含前后端映射表 |
| `research/storefront-ops-audit_dim01.md` | 结账链路（运费/税/券） |
| `research/storefront-ops-audit_dim02.md` | 搜索/类目/商品详情 |
| `research/storefront-ops-audit_dim03.md` | 营销与归因 |
| `research/storefront-ops-audit_dim04.md` | 履约/售后/客户运营 |
| `research/storefront-ops-audit_dim05.md` | SEO/结构化数据/索引 |
| `research/storefront-ops-audit_dim06.md` | 支付、稳定性与生产就绪 |
| `research/storefront-ops-audit_cross_verification.md` | 置信度分级与文档/代码冲突清单 |
| `research/storefront-ops-audit_insight.md` | 五层判断与反直觉建议 |
| `research/storefront-ops-audit_evidence.json` | 机器可读证据台账 |
| `research/qa/storefront-ops-audit_research_check.json` | 校验报告 |
