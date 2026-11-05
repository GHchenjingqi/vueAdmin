# DATA_DICTIONARY.md · 核心数据字典（X-T05）

> 日期：2026-11-04 · 范围：独立站交易域（C 端）核心表 · 金额一律**最小货币单位（分）整数**，时间一律 **UTC（ISO-8601 / DATE）**，枚举见 §3

## 1. 金额字段（单位：分；C2/C3）

| 表.字段 | 类型 | 含义 |
| --- | --- | --- |
| product_prices.amount | DECIMAL(12,2) | **存量**：单价（元）。C 端读取时 `Math.round(×100)` 转分，写侧仍为元 |
| carts.currency / cart_items.currency | VARCHAR(3) | 币种快照（创建时启用币种） |
| cart_items.unit_amount_cents | BIGINT | 加购时单价快照（分，仅展示） |
| orders.currency | VARCHAR(3) | 订单币种快照（C6：历史订单不随后台切换） |
| orders.amount | DECIMAL(12,2) | **存量**：订单总额（元）= amountCents/100，仅供后台展示 |
| orders.subtotal_cents / discount_cents / shipping_cents / tax_cents / amount_cents | BIGINT | 权威金额（分）：小计/优惠/运费/税费/应付 |
| order_items.unit_amount_cents / line_total_cents | BIGINT | 行单价/行小计快照（分） |
| order_payments.amount_cents | BIGINT | 支付金额（分）= 订单快照，禁止用当前配置重算 |
| coupons.value / min_spend | DECIMAL(12,2) | **存量**：percent=百分比 / fixed=元（fixed 读取时转分） |
| coupon_redemptions.discount_cents | BIGINT | 核销优惠（分） |
| settings(shop.shipping.rates).amountCents | JSON 内整数 | 运费（分） |

## 2. 时间字段（UTC）

| 表.字段 | 类型 | 含义 |
| --- | --- | --- |
| carts.expires_at / orders.paid_at / orders.closed_at | DATETIME | 过期/支付/关闭时刻（UTC） |
| inventory_reservations.expires_at | DATETIME | 预占 TTL 到期（默认 15min） |
| coupons.valid_from / valid_to | DATEONLY | 优惠券窗口（按自然日，时区取站点市场） |
| quotes.expiresAt（API 层） | ISO-8601 | 报价过期（15min） |
| webhook 事件 | — | 无独立时间列，以 createdAt 入库时刻为准 |

## 3. 枚举

| 字段 | 取值 |
| --- | --- |
| spus.status | draft / pending / listed / published / unlisted / archived（C 端仅露 listed+published） |
| skus.status | 同上（C 端仅露 listed+published） |
| orders.status | created / paid / fulfilled / shipped / done / cancelled |
| orders.payment_status | none / initiated / captured / failed（+ refused 预留） |
| order_payments.status | initiated / captured / failed（refund* 预留） |
| inventory_reservations.status | active / committed / released |
| config_changes.status | applied / scheduled / rolled_back |
| coupons.kind | percent / fixed |
| settings 键 | shop.currency / shop.currency.pending / shop.shipping.countries / shop.shipping.rates / shop.tax.rates |
| Cookie | cart_token（游客购物车，HttpOnly 30d） |

## 4. 关键键与约束

| 约束 | 说明 |
| --- | --- |
| carts.token | 唯一（128bit 随机 hex，不可枚举） |
| orders.idempotency_key | 唯一（同键重放返回原单） |
| orders.access_token | 索引（订单访问凭证，越权 404） |
| order_payments.(provider, provider_ref) | 唯一（服务商幂等） |
| webhook_events.(provider, event_id) | 唯一（事件去重） |
| product_prices.(tenantId, skuId, currency) | 唯一（每币种一行价格；无行=该币种不可售，禁止换算 C5） |
| coupons.usage_limit / used_count | 用尽判定（COUPON_EXHAUSTED） |
