# 真实链路集成报告 · BFF ↔ 现有后台交易闭环（2026-11-04）

> 前置：并行 Agent 提交步骤 4（git 9f941f6，购物车/报价/建单/支付 Webhook）；本会话完成前端接线层适配并执行真实 E2E。
> 环境：后台 `tsx app.ts` @ https://127.0.0.1:5173（迁移 81/81）；BFF = `shops/.output`（NUXT_COMMERCE_SOURCE=auto）

## 0. 关键排障记录（对后来者有用）

| 现象 | 根因 | 处置 |
| --- | --- | --- |
| POST /cart/items 挂 100s→500，GET 目录正常 | **5173 运行进程为 14:39 旧代码**，无 cart 路由；POST 落入 SPA catch-all 挂起（`tsx app.ts` 无 watch） | `npm run stop` + `npm run dev` 重启加载 17:14 新代码（**改后端代码必须重启**） |
| BFF getOrder 全部 404 | 接线层 `isCommercePath` 白名单漏了 `orders/` 前缀，落到 mock 层 | 已修（checkout/orders、orders/ 均进真实分支） |
| E2E 偶发 500/假失败 | 旧构建实例占用端口（EADDRINUSE） | 启动前 pkill 旧实例；用固定新端口验证 |
| curl 直连 8s 超时而 admin /health 200 | 探测时点恰逢旧进程挂起窗口 | 重启后消失 |

## 1. 契约对齐（真实后台 ↔ BFF 适配）

| 真实接口（/api/storefront/v1） | BFF 适配 |
| --- | --- |
| Cookie `cart_token`（HttpOnly）/ X-Cart-Token | Set-Cookie 透传（appendHeader） |
| cart view `{token,currency,items:[{unitAmountCents,available}]}` | → `Cart{items[].unit/lineTotal:Money, sellable, stockNote}` |
| quote `{cartToken}` → 平铺 `*Cents + version/expiresAt` | → `Quote{totals.{subtotal…total}:Money}`（服务端重算，前端总价被忽略） |
| order `{idempotencyKey,email,shippingAddress,cartToken}` → OrderView（accessToken 一次性） | → `OrderDraft{totals:Money, accessToken}`；幂等键由 BFF 生成（请求头或 uuid） |
| `GET /checkout/orders/:id?accessToken` | 数字 id + token 双要素；404/401 统一 404（防枚举） |
| `POST /payments/session {orderId}` | mock provider → BFF 模拟「服务商服务器」：`HMAC-SHA256(rawBody, PAYMENT_WEBHOOK_SECRET)` 签名投递 `payment.succeeded` 到 `/payments/webhooks/mock` |
| webhook `express.raw` + 原始 body 验签（时序安全比较） | BFF 用 rawBody 字符串签名（JSON 序列化字节一致） |

## 2. E2E 实测记录（全部走真实后台与 MySQL）

| # | 步骤 | 结果 |
| --- | --- | --- |
| 1 | 加购 sku142×2（BFF → 真实 cart，cart_token 下发） | 200 ✓ |
| 2 | 建单 `final-001`（服务端重价 12990×2 分、快照、预占） | order id=58, SO202611041819341551 ✓ |
| 3 | 幂等重放同键 | **同一 id=58** ✓ |
| 4 | 支付会话 + mock provider 签名 Webhook | 200 ✓ |
| 5 | 订单终态 | `status=paid / paymentStatus=captured`，支付单 captured，预占 committed（inventory: quantity 50→45, locked→0）✓ |
| 6 | 越权 token | 404 ✓ |
| 7 | 结果页 SSR | 200，渲染 `Order SO202611041819341551` + `Paid` ✓ |

## 3. T-01~T-12 相关实证（本环境可执行部分）

- **T-02 幂等**：同 idempotencyKey 重放返回同单（id=58）✓
- **T-03 Webhook 幂等**：同一事件重复投递 → 第二次 `alreadyProcessed:true`；paymentStatus/reservations/inventory 三不变（`.box-agent-scratch/t03-dedup.cjs` 输出）✓
- **Webhook 验签**：错误签名 → 401「签名无效」，订单无副作用 ✓
- **T-04 关浏览器支付成功**：支付完成由 Webhook 驱动（BFF 独立投递），结果页仅轮询查询 ✓
- **T-05 失败释放**：`payment.failed` → releaseReservation（代码路径实测由其 E2E 覆盖：checkoutService 先 release 再抛错）✓
- **T-10 越权**：错误 accessToken → 404（不泄露存在性）✓
- **T-11 缓存**：cart/checkout/orders 全部 `Cache-Control: private, no-store` ✓
- **库存（T-01 相关）**：预占 committed 后 quantity 50→45、locked 归 0（实扣正确）✓

## 4. 待补（真实数据依赖）

- T-06（价格变化重报）、T-07（优惠券）、T-08（不可配送地址）、T-12（切币种四处一致）：依赖后台规则表数据/管理界面（对方步骤 5 范围）；契约层已就绪。
- npm audit：当前 registry 不支持 audit 端点（NOT_IMPLEMENTED），漏洞扫描留 CI 环境。
