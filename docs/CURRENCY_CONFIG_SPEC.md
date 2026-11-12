# CURRENCY_CONFIG_SPEC.md · 币种配置规格（交付物 #15 · P1-T06 / P5-T02）

> 版本：v1.0 · 日期：2026-11-04 · 依据：计划 §0.6 全局约束 C1–C8、`MARKET_STRATEGY.md §5`、`BACKEND_AUDIT.md §2`

## 1. 数据模型（单一启用币种 Single Active Currency）

| 项 | 值 |
| --- | --- |
| 存储 | `settings` 表，`optionKey='shop.currency'`，`optionValue` 为 JSON 文本，`autoload=1` |
| 结构 | `{ code, symbol, decimalDigits, symbolPosition, thousandsSeparator, decimalSeparator, locale }` |
| 校验 | code ∈ ISO-4217 白名单（USD/CNY/EUR/GBP/CAD/AUD 起步）；decimalDigits 0–4；symbol/locale 缺省取 ISO 元数据 |
| 当前值 | USD（迁移 `20261112_000001` 幂等种子；显式写入 ≠ 隐式默认）。历史上的 `20261104_000050` 文件已不在仓库，改由该迁移在空库首次部署时补种；已存在该键时不覆盖运营配置 |
| 定时变更 | `settings.optionKey='shop.currency.pending'` = `{config, changeId, effectiveAt}`，由 sweeper 到点应用 |

## 2. 读取与缓存（C7/C8）

```
getActiveCurrency():
  1) 进程内缓存（TTL 60s）命中 → 返回
  2) 未命中 → Setting.findOne(optionKey='shop.currency') → JSON.parse → validateCurrencyConfig
  3) 缺失 → AppError(503, 'SHOP_CURRENCY_CONFIG_MISSING')   # fail-closed，禁止默认 USD
     非法 → AppError(503, 'SHOP_CURRENCY_CONFIG_INVALID')
失效：管理端保存/回滚/定时应用后 invalidateCurrencyCache()（清 TTL 缓存 + siteCache 单键刷新）
```

- 对外暴露：`GET /api/storefront/v1/store-config` → `{currency, market, version}`，响应头 `Cache-Control: public, max-age=30, stale-while-revalidate=30`（≤60s 生效）。
- BFF（shops） `/api/store-config`：真实端点就绪后透传；当前返回同构 mock 配置（`NUXT_COMMERCE_SOURCE` 独立于此开关）。

## 3. 变更治理（P5-T02 / 审计表 `config_changes`）

| 环节 | 规格 |
| --- | --- |
| 权限 | 仅 admin（`/api/v1/shop/settings/currency`，authMiddleware）；非管理员 403 |
| 二次确认 | PUT body 必须 `confirmImpact:true` + `ackNoConversion:true`（Zod literal），否则 400 `CONFIRMATION_REQUIRED`；界面文案必须含「价格数值不会自动换算」 |
| 定时生效 | `effectiveAt` 未来时间 → 写 pending 键 + `config_changes.status='scheduled'`，sweeper 到点应用 |
| 回滚 | `POST /shop/settings/currency/rollback {changeId}` → 以该行 oldValue 再应用一次，新审计行 `rollbackOf=changeId`，原行 `status='rolled_back'` |
| 审计 | 每次变更写 `config_changes`（oldValue/newValue/operator/effectiveAt/appliedAt/rollbackOf）——谁/何时/从→到 全留痕 |
| 副作用 | 切换后：目录 HTML 缓存 ≤60s 自然过期；存量购物车下次报价 `CURRENCY_CHANGED` 重建；未支付订单按 TTL 关闭（sweeper）；已支付订单不动（C6） |

## 4. 下游消费一致性（T-12 四处口径）

| 消费方 | 数据源 | 禁止 |
| --- | --- | --- |
| 页面价格（Price 组件） | store-config.currency → formatMoney | 硬编码 `$`/`¥` 符号 |
| JSON-LD `priceCurrency` | store-config.currency.code | 写死 |
| 订单/支付 | 创建时快照固化（order.currency/amountCents） | 读当前配置渲染历史订单 |
| 邮件 | 订单快照币种 | 读当前配置 |

## 5. 未决项（交接并行 Agent）

1. 后台端点 `GET /api/storefront/v1/store-config`（读取 §1 键 + §2 缓存语义）——BFF 已按同构契约预留，端点就绪即切换。
2. 管理端 PUT/rollback 端点与后台设置页（§3 规格；参考实现见 git 历史 `shop/controllers/storeConfigController.ts` 早期版本与交接备忘）。
3. `CURRENCY_CHANGED` 全链路实测（依赖 1）。
