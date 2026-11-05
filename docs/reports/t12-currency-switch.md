# T-12 币种切换全链路 · 实测证据（2026-11-05）

> 前置：P1-T06 Store Config 端点上线（settings.shop.currency 唯一数据源）+ siteContext 跟随 + admin 治理 API（P5-T02）
> 方法：admin PUT（二次确认）USD→CNY → 全链路验证 → 回滚 USD

## 1. 二次确认门禁

| 动作 | 结果 |
| --- | --- |
| PUT 无 `confirmImpact/ackNoConversion` | **400** `confirmImpact: Invalid literal value, expected true; ackNoConversion: …`（Zod literal 拒绝）✓ |
| PUT 带双确认 | 200 `{applied:true, changeId:1}` ✓ |

## 2. 切 USD→CNY 后全链路

| 环节 | 验证 |
| --- | --- |
| GET /api/storefront/v1/store-config | `code:"CNY", symbol:"¥", locale:"zh-CN"` ✓ |
| 新购物车加购 | cart currency = **CNY** ✓ |
| 新购物车 quote | currency CNY ✓ |
| **旧购物车（USD 快照）quote** | **409 CURRENCY_CHANGED**（要求重建，不静默换算）✓ |
| 页面 store-config（BFF→真实端点） | CNY 透传 ✓ |
| **订单快照（id=58，切换前创建）** | `currency:"USD", amount 259.80` **不变**（C6：历史订单不受影响）✓ |

## 3. 审计链（shop_config_changes）

```
audit#1  USD → CNY   status=rolled_back
audit#2  CNY → USD   status=applied  rollbackOf=1
```

- 回滚 API：`POST /shop/settings/currency/rollback {changeId:1}` → 200，changeId=2，`rollbackOf=1` ✓
- 回滚后：store-config 回 USD；旧购物车 quote 恢复 `currency:"USD", amountCents:12990` ✓

## 4. C8 缓存语义

- 进程内 TTL 60s + 管理端保存/回滚即时 `invalidateCurrencyCache()`（实测切换后直接查询已生效，无需等 TTL）✓
- BFF 页面响应 `Cache-Control: public, max-age=30`（CDN 层 ≤30s）✓

## 5. 遗留（如实）

- 后台设置界面（admin Vue 页面）未做——API 已强制二次确认与审计，界面属后台前端工作项
- 「定时生效」（effectiveAt → pending 键 + sweeper 应用）代码路径就绪，未单独实测
