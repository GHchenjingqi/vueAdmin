# 前端独立站 · 冒烟与验收证据（2026-11-04）

> 工程：`shops/`（Nuxt 3）· 构建产物 `.output/` · 全部命令在 `shops/` 目录执行

## 1. 静态验证

| 命令 | 结果 |
| --- | --- |
| `npx nuxi typecheck` | **0 错误**（strict 模式） |
| `npx eslint .` | **exit 0** |
| `npx vitest run` | **12/12 通过**（formatMoney 5 + 契约/mock 7） |
| `npx nuxt build` | 成功（Total 2.26 MB / gzip 557 kB） |

## 2. 生产构建 SSR 冒烟（:3000，真实链路 NUXT_API_INSECURE_TLS=1）

| 检查 | 证据 |
| --- | --- |
| `/api/store-config` | 返回 USD 配置（code/symbol/decimalDigits/locale）✓ |
| `/api/catalog/products` 真实优先 | 返回现有后台真实商品（`242-t179377…`，DECIMAL→分适配，price=null 正常处理）✓ |
| `/api/catalog/categories` 真实优先 | 真实类目树（slug=`c-{id}` 映射）✓ |
| SSR 首页 HTML 直出 | `Glueless Wigs, Melted` + 真实商品标题 `测试商品t179377…`（**服务器渲染，非客户端二次请求**）✓ |
| 商品详情真实数据 | `{"id":242,...,"variants":[...]}` ✓ |
| 不存在商品 | 404 页（dev 与 prod 一致）✓ |

## 3. mock 回退与货币直出（:3003，NUXT_API_BASE=死端口）

| 检查 | 证据 |
| --- | --- |
| 后台不可达 → mock 回退 | 返回 fixtures 商品（`101-hd-lace-…`，price 129900 分）✓ |
| SSR HTML 含货币符号 | 首页 HTML 直出 `$1,299.00`（Price 组件唯一入口，配置驱动）✓ |

## 4. 交易 mock 链路（:3000）

| 步骤 | 结果 |
| --- | --- |
| POST /api/cart/items | 200 ✓ |
| POST /api/checkout/orders（Idempotency-Key: smk-001） | 200，orderNo=SO1793778847460121 |
| 同 key 重放 | **返回同一 orderNo**（幂等，T-02 契约）✓ |
| POST …/pay | 200 → sessionUrl ✓ |
| GET /api/orders/:no?t=正确token | 200，`paymentStatus:"captured"`（T-04：结果页由服务端状态驱动）✓ |
| GET /api/orders/:no?t=错误token | **404**（T-10 契约）✓ |
| 私有接口响应头 | `Cache-Control: private, no-store`（T-11）✓ |

## 5. dev 模式冒烟（nuxt dev :3004）

- ~2s 可用；首页/详情/搜索/政策页均 200；不存在商品 404。

## 6. 遗留（随阶段推进）

- Playwright 浏览器运行验证（CI 环境执行 `npm run test:e2e`）。
- 后端阶段：Store Config 真实服务、cart/checkout/orders 真实路由替换 mock（契约不变，前端零改动）。
