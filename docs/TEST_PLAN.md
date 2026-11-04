# TEST_PLAN.md · 测试计划（P0-T17）

> 生成：2026-11-04 · 分层：Unit / API(集成) / Contract / E2E / Visual / Perf / Security · 币种切换回归必须覆盖

## 1. 测试分层与工具

| 层 | 工具 | 范围 | 门禁 |
| --- | --- | --- | **CI 必跑** |
| Unit | Vitest | 货币格式化/报价计算/状态机/优惠券/库存 | ✓ |
| API 集成 | Vitest + supertest | storefront 交易链路（cart/quote/order/pay/webhook） | ✓ |
| Contract | Zod schema（shared/schemas） | store-config / quote / order 响应结构 | ✓ |
| E2E | Playwright | 主流程 + 切币种回归 | smoke 必跑 |
| Visual | Playwright screenshot | 首页/详情/结算关键视口 | 抽查 |
| Perf | Lighthouse CI / RUM | LCP<2.5s(P75 移动) | 上线门禁 |
| Security | 越权/枚举/CSRF/限流/注入清单 | §P4-T15 | 上线门禁 |

## 2. 关键回归用例（编号=T 系列）

- T-01~T-12（见计划 §9）：以 `storefront-api/tests/trade/*.spec.ts` + E2E 覆盖；**T-12 币种切换四处口径一致**为发版必过项。
- 币种链路专项：配置缺失 fail-closed、60s 生效、购物车 CURRENCY_CHANGED、订单快照币种不变、邮件/JSON-LD/支付金额同源。

## 3. 数据与环境

- 集成测试使用独立测试库/事务回滚或内存适配器；E2E 走 https://localhost:5173 沙箱（Mock Provider）。
- 测试数据：假发 SPU×2（多 SKU）、服装 SPU×1、多币种价格行由配置切换产生（不预置第二币种价格，验证 C5：数值不变）。

## 4. 缺陷分级与出口标准

- Blocker/Critical 清零；Major 有 workaround 可带条件上线（记录 §11 风险表）；Coverage 门槛：前端 70%/后端沿用现有 vitest 阈值。
