# ANALYTICS_EVENTS.md · GA4 事件字典（P4-T10）

> 日期：2026-11-05 · 实现：`shops/shared/analytics/{consent,events,ecommerce}.ts` · 门控：Cookie 同意（P4-T11）

## 1. 事件字典（九个 + 服务端侧）

| # | 事件 | 必填参数 | 触发点 | 门控 |
| --- | --- | --- | --- | --- |
| 1 | view_item_list | item_list_id, items[] | 集合页/首页曝光 | consent.analytics |
| 2 | select_item | items[] | 商品卡点击 | consent.analytics |
| 3 | view_item | currency, value, items[] | 详情页（价格来自 store config 渲染值） | consent.analytics |
| 4 | view_cart | currency, value, items[] | 购物车页 | consent.analytics |
| 5 | add_to_cart | currency, value, items[] | 详情页加购成功 | consent.analytics |
| 6 | begin_checkout | currency, value, items[] | 结算页报价就绪 | consent.analytics |
| 7 | add_shipping_info | currency, value, items[] | 运费选择变更 | consent.analytics |
| 8 | add_payment_info | currency, value, items[] | 发起支付 | consent.analytics |
| 9 | purchase | transaction_id, currency, value, items[] | **服务端事实**：结果页订单 paymentStatus=captured | consent.analytics |
| — | refund（服务端侧） | transaction_id, currency, value | 退款成功由后端 CAPI/服务端事件发送（前端不触发） | — |

- 金额参数：`value` = 元（分/100），`currency` 取**订单快照**（purchase）或 store config（浏览类）。
- `items[]`：`{item_id, item_name, quantity, price}`。

## 2. 同意与加载（P4-T11）

- 页面加载即 `consent default denied`（Consent Mode v2），横幅未决定前 GA4 脚本不加载。
- 「全部接受」→ `consent update granted` + 加载 gtag（measurementId 为空时仅 dataLayer，便于本地调试）。
- 「仅必要」/撤回 → 保持 denied，追踪停用；同意状态存 localStorage + `sb_consent` cookie（180 天）。

## 3. 服务端 CAPI（待后端）

purchase/refund 的服务端侧发送（Measurement Protocol / CAPI）由后台埋点步骤承接，需遵循同一同意状态（P4-T11 验收项）。
