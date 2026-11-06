# G5 门禁 · 扩展未破坏主链路回归报告（2026-11-06）

> 关联任务：`P5-T09 G5 门禁：扩展未破坏主链路回归`
> 验收标准：**主市场交易 E2E 全绿；币种切换回归通过；缓存与 SEO 无回归**（依赖 P5-T01 ~ P5-T08）
> 本报告只登记**实测证据与缺口**，不代勾门禁状态；G5 在计划文档中保持 `[ ]`。

## 1. 结论摘要

| 验收项 | 结果 | 证据 |
| --- | --- | --- |
| 主市场交易 E2E | ✅ 通过（服务端） | A 组 69/69（6 文件），含 §9 T-01~T-12 并发/幂等/异常路径 |
| 币种切换回归 | ✅ 通过 | B 组 57/57（5 文件）+ `t12-currency-switch.md` / `t12-jsonld-currency-switch.md` 全链路实测 |
| 缓存与 SEO | ✅ 通过 | C 组 47/47（6 文件）+ `performance-acceptance.md`（LCP 140ms / CLS 0） |
| 扩展能力不污染主链路 | ✅ 通过 | 隔离性 27/27（4 文件）：feature flag / A/B 关闭态 / CMS 缓存失效 |
| 浏览器级冒烟 E2E | ⚠️ 2/3 | 首页、商品详情通过；下单被**运行中服务构建产物失效**阻断（§5），非代码回归 |
| 后端全量 / 前端单测 | ✅ 630/630 · 45/45 | 68 文件 / 8 文件，见 §2 |

**门禁判定：技术侧回归证据齐备，但 G5 仍不达成**——P5-T01~T08 尚未全部收口（多语言、区域支付、多仓路由、Bundle 仍为并行方未提交 WIP），且浏览器级 E2E 需在服务重建后复跑、业务方需签字。按 §0.2 不代勾。

## 2. 环境与全量基线

| 项 | 值 |
| --- | --- |
| 采集时间 | 2026-11-06 11:00 (GMT+8)，dev 本地环境 |
| 后端 | `cd server && npx vitest run` → **68 files / 630 tests 全绿，0 失败** |
| 前端 | `cd shops && npx vitest run --config vitest.config.ts` → **8 files / 45 tests 全绿** |
| typecheck | 已提交基线（HEAD `3331e8b`）**0 错误**；当前工作树 3 错见 §6 |
| 运行中服务 | BFF/SSR `http://localhost:3014`、后台 `https://127.0.0.1:5173` 均 200（旧构建产物，见 §5） |

注：上一轮记录的唯一失败（并行方 `featureFlags.test.ts` bnpl 断言，dev 库残留 `bnpl:true`）本轮已被并行方自行修复，全量恢复 630/630。

## 3. 三组针对性回归（逐项实测）

### A · 主市场交易 E2E — 69/69（6 文件）

```
storefront-trade-gate · storefront-commerce · shopPhases
storefront-orders-list · storefront-refund · storefront-cart-merge
```

覆盖 §9 T-01~T-12 的核心断言：同 SKU 并发 `occupy` 不超卖、相同 `idempotencyKey` 不重复建单、Webhook 重复投递 `alreadyProcessed`、支付成功不依赖浏览器回跳、失败/超时释放预占、改价后服务端重报价、优惠券过期拒绝、配送白名单、退款与 RMA、订单列表、购物车合并。

### B · 币种切换回归 — 57/57（5 文件）

```
storefront · storefront-order-mail · storefront-tax
storefront-coupon · storefront-shipping
```

互补实测报告：
- `t12-currency-switch.md`：admin 双确认 USD→CNY 后，store-config / 新购物车 / 报价均为 CNY；**旧 USD 购物车报价返回 409 CURRENCY_CHANGED**（不静默换算）；**切换前订单快照保持 USD 259.80 不变**；`shop_config_changes` 审计链完整；可回滚 USD。
- `t12-jsonld-currency-switch.md`：CNY→USD→CNY 逐次抓 SSR HTML 解析 `application/ld+json`，`priceCurrency` 与前台可见符号同步。

### C · 缓存与 SEO — 47/47（6 文件）

```
cache · siteCache · dictCache · storefront-cms · cms-admin · cms-admin-security
```

- `cmsCacheService` 站点级 revision + 可插拔失效器；发布/下线逐次 bump，失效器异常仅 `warn` 不阻断发布。
- 公开列表/详情 ETag + 304；**详情先查库再判 ETag**，下线文章持旧 ETag 仍返回 404（防缓存"复活"）。
- `cms-admin-security.test.ts` 锁定 JSON-LD `<` 转义、admin 鉴权、禁改 `status`、slug 正则。
- `performance-acceptance.md`：移动端 LCP P75 最大 **140ms** < 2500ms、CLS 全为 0、TTFB 34–95ms。

### D · 扩展能力隔离性 — 27/27（4 文件）

```
experiments · featureFlags · cms-admin · cms-admin-security
```

`ab_test` / 5 个新功能 flag 关闭态降级 `control` 且不计算分桶、不触发曝光 hook（零副作用）；CMS 写操作不改报价库存。这直接支撑 G5「扩展能力上线不破坏既有交易链路」。

## 4. 浏览器级冒烟 E2E（本轮改进与实测）

**发现并修复的用例缺陷**（`shops/tests/e2e/smoke.spec.ts`）：
1. 原用例硬编码 mock fixtures 的商品 slug `101-hd-lace-glueless-body-wave-wig`。运行中 BFF 走真实数据源（`NUXT_COMMERCE_SOURCE=auto`）时该商品不在库中，SSR 返回 **404 `Product not found`**，两个用例因找不到 `Add to Cart` 直接超时。改为**从首页 SSR 链接动态取商品**，mock / 真实数据源均适用。
2. 真实库首页首个商品为 `Out of stock`、按钮 disabled，click 仍会超时。改为**跳过缺货卡片 + 逐个验证 `Add to Cart` 可用**（最多 6 个候选）。

**实测结果（Chromium / `E2E_BASE_URL=http://localhost:3014`）**：

| 轮次 | 结果 | 说明 |
| --- | --- | --- |
| 修前 | 1 passed / 2 failed | 商品详情、下单均因硬编码 slug 404 超时 |
| 第 1 次修后 | 2 passed / 1 failed | 详情页通过；首个商品缺货、按钮 disabled |
| 第 2 次修后 | **2 passed / 1 failed** | 首页 ✅、商品详情 ✅（含 `toBeEnabled()`）；下单卡在 `/checkout` |

## 5. 阻断项归因（非代码回归）

下单用例停在 `page.fill('#fullName')`，但当前 `pages/checkout/index.vue` 的 `address` 仍包含 `fullName`、模板 `:id="key"` 会生成 `#fullName`。直接抓 SSR：

```
GET http://localhost:3014/checkout → 500
{"statusCode":500,"statusMessage":"Server Error",
 "message":"Cannot find module '...shops\\.output\\server\\chunks\\build\\index-CDn8YrA2.mjs' ..."}
```

`shops/.output/server/chunks/build/` 中该 chunk **确实不存在**（目录内只剩新哈希的 chunk）。即：3014 是并行方**运行中未重启的旧 Nuxt 构建**，前端改动后 chunk 文件被替换，旧进程引用已删除的模块 → 首页/商品页因已加载的 chunk 可用仍 200，checkout 走缺失 chunk 报 500。

**结论**：属构建产物与运行中进程不同步的环境问题，不是交易链路代码回归。本轮不擅自重启或重建并行方服务（会打断其调试）。服务重建后复跑第 3 项即可闭合。

## 6. 当前工作树的 WIP 干扰（如实登记）

| 项 | 状态 | 归属 / 影响 |
| --- | --- | --- |
| `bundleService.ts` / `ShopBundle.ts` | 未跟踪新文件，HEAD 中不存在 | 并行方 P5-T05 WIP。`bundleService.ts` 从 `storefront/services/` 引用 `../models/ShopBundle.js` 与 `../models/index.js`（实际模型在 `shop/models/`），导致 `server` typecheck 报 **3 错**（TS2307×2 + TS2339）。已提交基线不受影响，本轮不代修、不提交。 |
| `000066_add-cart-locale.ts` / `000067_add-warehouse-routing.ts` | 未跟踪迁移 | 并行方 P5-T01 / P5-T04，已自行在 dev 库执行；本轮未触碰。 |
| `storefront-warehouse-routing.test.ts` | 未跟踪测试 | 并行方 P5-T04，已计入本轮全量 630/630。 |
| `featureFlags.ts` / `checkoutService.ts` / `quoteService.ts` / `cart.vue` 等 | 工作树 `M` | 并行方未提交 WIP，全程未夹带、未覆盖。 |

## 7. 缺口与行动项（G5 达成前）

1. **服务重建 + E2E 复跑**：重启/重建 3014 的 Nuxt 产物后执行 §8 第 4 条命令，期望 3/3；由并行方在其调试窗口收口后进行。
2. **P5 批次收口**：P5-T01（多语言）、T03（区域支付/BNPL）、T04（多仓路由）、T05（Bundle）、T07（Referral）需并行方提交并稳定，G5 依赖 P5-T01~T08 全部完成。
3. **商业规则定稿**：Bundle 组合报价、Referral 归因窗口/佣金币种，非代码实现缺口。
4. **业务签字与真实环境**：主市场交易 E2E 在生产级环境抽样、币种切换真实验收、CDN 缓存失效链路（当前为可插拔失效器，需接真实 CDN）。
5. **`bundleService.ts` 导入路径**：并行方 WIP 收口时需修正为 `../../shop/models/...`，否则 typecheck 不干净。

## 8. 复跑命令

```bash
# 后端全量 + 三组针对性回归
cd server && npx vitest run
npx vitest run __tests__/storefront-trade-gate.test.ts __tests__/storefront-commerce.test.ts \
  __tests__/shopPhases.test.ts __tests__/storefront-orders-list.test.ts \
  __tests__/storefront-refund.test.ts __tests__/storefront-cart-merge.test.ts
npx vitest run __tests__/storefront.test.ts __tests__/storefront-order-mail.test.ts \
  __tests__/storefront-tax.test.ts __tests__/storefront-coupon.test.ts \
  __tests__/storefront-shipping.test.ts
npx vitest run __tests__/cache.test.ts __tests__/siteCache.test.ts __tests__/dictCache.test.ts \
  __tests__/storefront-cms.test.ts __tests__/cms-admin.test.ts __tests__/cms-admin-security.test.ts
npx tsc --noEmit -p tsconfig.json

# 前端单测 + 浏览器级冒烟（需服务可用且构建产物同步）
cd ../shops && npx vitest run --config vitest.config.ts
E2E_BASE_URL=http://localhost:3014 npx playwright test \
  --config tests/e2e/playwright.config.ts --reporter=line
```

---

*本报告由回归实测生成；门禁状态变更须由业务/责任方在 `storefront-execution-plan_v1.0.md` §P5-T09 回填。*
