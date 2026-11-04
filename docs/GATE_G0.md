# GATE_G0.md · Phase 0 门禁评审记录（P0-T18）

> 评审时间：2026-11-04 · 形式：AI 执行方按 §9 交易测试逐条核对实现方案；业务复核项见 §6
> 输入：docs/（BACKEND_AUDIT / API_REUSE_MATRIX / MARKET_STRATEGY / PRODUCT_DATA_MODEL / PRODUCT_REQUIREMENTS / ORDER_PAYMENT_STATE_MACHINE / API_CONTRACT / SEO_SPEC / TEST_PLAN / DEPLOYMENT_RUNBOOK / PAYMENT_PROVIDER_CHECK）

## 1. §9 交易测试 → 实现方案对照（G0 核心核对）

| # | 测试项 | 实现方案（设计定稿） | 状态 |
| --- | --- | --- | --- |
| T-01 | 并发不超卖 | 库存预占：事务内条件 UPDATE `locked`（BACKEND_AUDIT §3 / 状态机 §3）；压测见 P3-T18 | 方案齐备 |
| T-02 | 重复提交不重复下单 | `Idempotency-Key` + `shop_orders.idempotencyKey` 唯一索引 | 方案齐备 |
| T-03 | Webhook 幂等 | `shop_webhook_events.event_id` 唯一 + 事件去重 | 方案齐备 |
| T-04 | 关浏览器支付成功 | Webhook 驱动状态机（结果页仅轮询，不盲信 URL） | 方案齐备 |
| T-05 | 失败/超时释放预占 | sweeper 定时任务（TTL 15min）+ failed 事件释放 | 方案齐备 |
| T-06 | 价格变化重新报价 | Quote 服务端重算 + version/CURRENCY_CHANGED | 方案齐备 |
| T-07 | 优惠券服务端拒绝 | 校验模块四态错误码 + 币种适用性 | 方案齐备 |
| T-08 | 不可配送不可下单 | 配送国家规则表 + `ADDRESS_NOT_SHIPPABLE` | 方案齐备 |
| T-09 | 退款状态与币种 | 退款独立状态流；币种取原订单快照 | 方案齐备 |
| T-10 | 顾客隔离 | 独立 Customer + accessToken；越权 404 | 方案齐备 |
| T-11 | CDN 不缓存私有数据 | cart/checkout/orders 响应 `private, no-store` | 方案齐备 |
| T-12 | 切币种四处口径一致 | 单一配置源 + 60s 缓存 + 快照固化 + JSON-LD/邮件/支付同源；未支付订单处置（P5-T02） | 方案齐备 |

## 2. 负责人与数据源确认

| 域 | 实现载体 | 负责人 |
| --- | --- | --- |
| 支付 | `storefront/payments/*`（Adapter + Mock/Stripe） | 本仓库维护者 |
| 库存 | `storefront/checkout/reservation.ts` + sweeper | 本仓库维护者 |
| 订单 | `storefront/orders/*` | 本仓库维护者 |
| 顾客 | `storefront/customers/*` | 本仓库维护者 |
| 币种配置链路 | settings(`shop.currency`) → `/store-config` → `useCurrency`（唯一数据源） | 本仓库维护者 |

## 3. 风险敞口（不阻塞 G0，登记 §11）

- 支付服务商真实开户未完成（PAYMENT_PROVIDER_CHECK §5）→ 沙箱以 Mock Provider 闭环，真实开户列为上线前遗留。
- 税率/运费规则数值待业务复核（MARKET_STRATEGY §6）。
- 币种切换的业务签核与运营界面（P5-T02）。

## 4. 结论

**G0 通过**（有条件）：无未决高风险设计；四大域实现方案齐备；唯一遗留为真实支付开户（外部依赖，沙箱链路不受阻）。Phase 1 可开工。
