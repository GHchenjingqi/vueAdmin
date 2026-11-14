# storefront-ops-audit Cross-Verification

Route: C（File-only）
Evidence Budget: 6 个维度文件 + 1 份文件清单；无外部检索；阅读源码文件约 50 个

## 方法论

全部结论来自对 `D:/codes/web` 工作区源码的静态路径核对：从"前端调用点 → BFF 转发 → 后端服务 → 数据模型"逐层跟进，确认每一环是否真正接上。对"某功能不存在"的判断，使用全目录检索（如 `weight`、`restock`、`utm`）而非单文件阅读。

## High Confidence

以下结论有多处独立证据交叉，且都能用单条命令复现：

| 结论 | 交叉证据 |
| --- | --- |
| 报价/下单 BFF 丢参，券/税/运费不生效 | 前端传参（checkout/index.vue）+ BFF 只转 cartToken（[...mock].ts）+ 后端入参含这些字段（quoteSchema/quoteService）+ 适配层 shippingRates 为空（commerce.ts） |
| 搜索退化为前 24 条过滤 | useCatalog 无 keyword + search.vue 客户端 filter + 后端 catalogService 支持 keyword + schema 声明 keyword |
| 类目 URL 为 c-<id>，类目 TDK 全失效 | ShopCategory 无 slug 列 + BFF 拼 c-<id> + CATEGORY_SEO 以语义 slug 为键 + SEO_SPEC 要求 /c/lace-wigs |
| 促销活动不参与报价 | ShopPromotion 模型存在 + marketingService 有 activePromotions + 全仓无调用方 + quoteService 只认 bundle/coupon/tier/points |
| UTM 落库但报表不支持 | ShopOrder 有六列 utm + attribution.ts 采集 + checkoutService 写入 + analyticsService 无 utm + controller 白名单仅 4 维 |
| 商品无重量字段 | shop/models 全目录检索 weight/length/width/height 零命中 |
| PDP 不渲染多图 | ShopSpu 有 images + DTO 返回 images + BFF 透传 + PDP 模板只用 cover |
| auto 模式静默回退 mock | nuxt.config 默认 auto + commerce.ts 定义回退语义 + catalog BFF `mockCatalog` 兜底 |
| sitemap 上限 60 条 | sitemap.xml.ts 传 pageSize=60 + schema 上限 60 + xml 无 lastmod |
| 商品 JSON-LD 无评分 | JsonLd.vue 无 aggregateRating + reviewService 已有 summary |

## Medium Confidence

| 结论 | 说明与限制 |
| --- | --- |
| 运费默认 0 导致商家承担全部物流成本 | 结论依赖 `STORE_SHIPPING_CENTS` 未配置。已在 `.env.example` 与 `server/.env.example` 检索无该变量，但未检查部署环境实际注入值。若生产已显式配置，则表现为"所有订单同一运费"而非"运费为 0"。 |
| 无拣货单/面单/发票 | 基于 `server/modules` 与 `shops/server` 的关键词检索。不排除以其他命名（如 `export`、`print`）实现，但 `shop/routes/index.ts` 的路由全量清单中没有对应端点，因此判断为不存在。 |
| RMA 批准不触发退款 | 读 `approveRma` 与 `refundService` 两侧实现，确认无调用关系；但未检查是否存在定时任务或事件总线间接串联。 |
| 顾客 token 存 localStorage 构成 XSS 风险 | 存储位置已确认；实际风险取决于是否存在可利用的 XSS 入口，本次未做渗透测试。 |
| 缺 Apple Pay / Google Pay 影响转化 | 支付通道清单已确认无这些通道；转化影响属行业经验判断，非本项目数据。 |

## Low Confidence

| 结论 | 说明 |
| --- | --- |
| 日均 100 单人工成本估算 | 40 秒/单为经验值，未在本项目实测。仅用于说明量级，不应作为预算依据。 |

## Conflict Zones

未发现源码内部相互矛盾的结论。但**文档与代码存在冲突**，需明确以代码为准：

| 冲突点 | 文档表述 | 代码实际 |
| --- | --- | --- |
| BFF 报价契约 | `[...mock].ts` 注释称"真实契约仅需 cartToken；地址/运费/优惠由后台规则表承接" | 后端 `quoteSchema` 接收 `shippingAddress`/`couponCode`/`pointsToRedeem`，且 `quoteService` 依赖这些字段才能算出运费与税 |
| 集合页 URL | `docs/SEO_SPEC.md` 规定 `/c/:slug`（如 `/c/lace-wigs`） | 实际输出 `/c/c-<id>` |
| sitemap | `SEO_SPEC.md` 要求含 `<lastmod>` | 实际 xml 只有 `<loc>` |
| 多站点 | `siteContext` 支持 `X-Site-Id` | C 端从未发送该头，恒落默认租户 |
| 促销 | 后台有促销管理页与 `activePromotions` | 报价链路未消费 |

这些冲突的共同特征是：**后端能力先建好，但 C 端接线（BFF / composable / 页面）没有跟上**。因此本项目的功能缺口主要不是"没做"，而是"做完没接上"。

## Validation Updates

- 已用 `grep -c` 复核关键"不存在"判断：`analyticsService` 的 utm 命中数 0、`catalogService` 的 price-asc 命中数 0、`ProductCard` 的 rating 命中数 0、`PDP` 的 images 命中数 0、`ProductReviews` 的 images 命中数 0、`shops/pages` 与 `shops/components` 的 restock 命中数 0。
- `activePromotions` 调用方检索：仅 `marketingService.ts` 自身定义，无其他引用。
- 支付通道检索 `stripe|adyen|braintree|klarna|afterpay|applepay|apple_pay|google_pay`：零命中。
- 订单单据检索 `packing.?slip|shipping.?label|waybill|invoice`：仅命中计费模块 `Invoice` 与支付网关 `invoice_id` 注释。
