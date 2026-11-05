# DEPLOYMENT_RUNBOOK.md · 部署与回滚手册（骨架，P0-T17 / X-T06 完善）

> 生成：2026-11-04 · 覆盖：Nuxt BFF + Express API + MySQL；环境：dev(5173) / staging / prod

## 1. 架构与组件

| 组件 | 载体 | 端口 | 健康检查 |
| --- | --- | --- | --- |
| Storefront BFF (Nuxt SSR) | Docker / Node | 3000 | `GET /api/health`（BFF 内） |
| Storefront API (Express) | 现有 server 进程（5173/5180） | — | `GET /api/storefront/v1/health`、`GET /health` |
| MySQL 8 | 本机/容器 | 3306 | `migrate:status` |

## 2. 部署步骤（staging）

1. `git pull` → `npm run install:all`（或 CI 构建镜像）。
2. `server/.env` 核对：`DB_*`、`JWT_SECRET`、`JWT_CUSTOMER_SECRET`、`PAYMENT_MOCK_SECRET`、`ALLOWED_ORIGINS`（含 BFF 域名）。
3. `npm --prefix server run migrate`（新表：shop_customers/cart/orders 扩展列/reservations/payments/webhook_events/config_changes…）。
4. 启动 BFF：`cd shops && pnpm build && node .output/server/index.mjs`（PORT=3000）。
5. 验证：`/api/storefront/v1/store-config` 200 且 currency.code=配置值；`/health` ok。

## 3. 币种切换操作（配合 P5-T02）

1. 后台「商城设置→币种」：填写新币种 → 界面强制确认「价格数值不会自动换算」→ 提交（confirmImpact/ackNoConversion）。
2. 生效：立即（缓存主动失效）或定时（sweeper 应用）。
3. 验证：≤60s 内 `GET /store-config` 返回新 code；抽查 5 页面符号；T-12 回归。
4. 回滚：`POST /shop/settings/currency/rollback {changeId}`（同审计）。

## 4. 故障处置速查

| 故障 | 处置 |
| --- | --- |
| store-config 503 CONFIG_MISSING | 检查 settings 行 `shop.currency`；恢复或写回合法 JSON；期间下单阻断属预期（C7） |
| Webhook 大量 4xx | 检查 provider secret 配置/时钟偏差；勿关闭验签 |
| 库存异常（locked 不落） | 跑释放任务 `POST /admin/ops/reservations/sweep`；核对 inventory_log |
| 回滚发布 | `docker rollback` / 前一版本镜像 + 数据库迁移 `migrate:down`（仅撤销最后一批） |

## 5. 监控告警处置（P4-T13）

> 每条告警含阈值 / 通知渠道 / runbook 链接。处置要点：

| 告警 | 阈值（示例） | 处置 |
| --- | --- | --- |
| ssr-error-rate | >5%（5 分钟） | 查 SSR 错误堆栈与上游 API 连通；按 requestId 串三层 |
| api-p95 | >800ms | 查慢查询 `slowQueryLog`、缓存命中、DB 连接池 |
| payment-failure-rate | >10%（10 分钟） | 查支付 provider 状态/密钥/限流；勿盲目重试 |
| webhook-latency | >2000ms | 查验签与幂等耗时；确认无回调风暴 |
| inventory-anomaly | ≥1 次 | 跑 `POST /admin/ops/reservations/sweep` 释放过期；核对 inventory_log |
| currency-config-fail | ≥1 次 | 检查 settings `shop.currency`；恢复合法 JSON（C7 阻断属预期） |

## 6. 待演练项（X-T06 完成项）

- [ ] staging 完整演练记录（时间/人/耗时）
- [ ] RTO 实测值回填
- [ ] 生产数据库备份/恢复演练（每日备份 + 7 天保留）
