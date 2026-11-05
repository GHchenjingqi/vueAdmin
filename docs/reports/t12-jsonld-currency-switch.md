# T-12 · JSON-LD / 前台符号切币种实测（2026-11-05）

> 目标：闭合 §9 T-12 记录的两处实测缺口 —— **JSON-LD `priceCurrency` 切币种后实测抓取** 与 **前台可见符号**。
> 与 `docs/reports/t12-currency-switch.md`（store-config / 购物车 / 报价 / 订单快照 / 回滚 / 审计）互补。
> 方法：admin PUT（双确认）CNY → USD → CNY，逐次抓 BFF SSR 产品页 HTML 解析 `application/ld+json`，最后恢复原配置。

## 1. 环境与样本

| 项 | 值 |
| --- | --- |
| 后台 | `https://127.0.0.1:5173`（`tsx app.ts`，HTTPS 自签名；实测禁用 TLS 校验仅用于本地） |
| BFF / SSR | `http://localhost:3014`，`NUXT_COMMERCE_SOURCE=auto` |
| 币种唯一数据源 | `settings.optionKey = 'shop.currency'` |
| 切换入口 | `PUT /api/v1/shop/settings/currency`（强制 `confirmImpact` + `ackNoConversion`，写入 `shop_config_changes` 并即时 `invalidateCurrencyCache()`） |
| 样本商品 | `/products/1258-bodywavewigsf1793862066456951565`（有价格行，SSR 输出 `Product` JSON-LD） |
| 基线 | `CNY / ¥ / zh-CN`；采集时间 2026-11-05T07:05:55Z |

## 2. 采集与断言

每一步同时抓 `/api/store-config` 与同一产品页 HTML，解析 `application/ld+json` 中 `@type=Product` 的 `offers`。

| 检查 | USD 态 | CNY 态 | 结论 |
| --- | --- | --- | --- |
| store-config 即时生效（无需等 60s TTL） | `USD` | `CNY` | ✅ PASS |
| JSON-LD `offers.priceCurrency` | `USD` | `CNY` | ✅ PASS（跟随配置） |
| JSON-LD `offers.price` | `129.90` | `129.90` | ✅ PASS（**数值不换算**，无 $1,299 → ¥1,299 风险） |
| 页面可见价格数值与 JSON-LD 同源 | 命中 | 命中 | ✅ PASS |
| 页面可见货币符号 | `$` | `¥` | ✅ PASS |

原始结果：5/5 PASS；切换后 `restored store-config = CNY`，与基线一致。

## 3. 配置数据修复（实测中发现）

基线读取时 `shop.currency.symbol` 的字节为 `EFBFBD EFBFBD`（两个 U+FFFD 替换字符），页面会显示 `??129.90`，
导致「前台展示符号」口径不成立。已通过 admin PUT 按 ISO 元数据修回 `¥`（`changeId=8`），
修复后 `GET /api/store-config` 返回 `{"code":"CNY","symbol":"¥",...}`。

审计链（`shop_config_changes`）：

| changeId | 动作 | 从 → 到 |
| --- | --- | --- |
| 8 | 修复损坏的 symbol | CNY(`??`) → CNY(`¥`) |
| 9 | 实测切换 | CNY → USD |
| 10 | 实测切换 | USD → CNY |
| 11 | finally 恢复基线 | CNY → CNY（原配置原样写回） |

## 4. T-12 四处口径汇总

| 口径 | 证据 | 状态 |
| --- | --- | --- |
| 前台展示符号 | 本报告 §2（USD `$` / CNY `¥`，SSR 页面可见） | ✅ |
| 结构化数据 JSON-LD | 本报告 §2（`priceCurrency` 跟随，price 恒等） | ✅ |
| 订单邮件 | `orderMailService` 入队即固化订单快照币种；`storefront-order-mail.test.ts` 11 例（含「入队后把订单币种改 CNY，实际发出正文仍是 USD 快照」）+ trade-gate T-12 真实断言（站点 USD 下历史 CNY 订单出 `¥/CNY`） | ✅ |
| 支付金额 | trade-gate T-12：`createSession` 的 `amountCents/currency` 恒取订单快照 | ✅ |
| 切换期间未支付订单 | `docs/reports/t12-currency-switch.md`：旧购物车 quote `409 CURRENCY_CHANGED` + 审计回滚 | ✅ |

## 5. 复现要点

1. 用后台 JWT 调 `PUT /api/v1/shop/settings/currency`，body：
   `{ "config": { "code":"USD", "symbol":"$", "decimalDigits":2, "symbolPosition":"before", "thousandsSeparator":",", "decimalSeparator":".", "locale":"en-US" }, "confirmImpact": true, "ackNoConversion": true }`
2. 抓 `GET http://localhost:3014/products/<slug>`，`application/ld+json` 中的 `Product.offers`。
3. 对比 `GET http://localhost:3014/api/store-config` 的 `currency.code`。
4. **务必在 finally 中把读到的原配置原样 PUT 回去**，避免改变共享环境状态。

## 6. 如实遗留

- 邮件**真实 SMTP 投递**未在本环境执行：测试用可插拔 provider 注入验证渲染 / 重试 / 快照；上线需配置 SMTP 并把 `POST /shop/order-mails/drain` 挂到定时任务（或由运营手动触发）。
- CDN 层是否按 `Cache-Control: public, max-age=30` 透传、以及 G4 菜单权限复核，属上线检查项，不在代码实测范围内。
- P0-T05b 的**业务正式签字**（切币种不换算）仍待业务方确认；实现层与实测层已闭环。
