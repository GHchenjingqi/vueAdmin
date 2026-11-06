# G5 浏览器冒烟复核（2026-11-06 13:09）

> 关联：`docs/reports/g5-regression-report.md` 中「浏览器 E2E 2/3」未闭环项、任务 `P5-T09 G5 门禁`。
> 本报告只补实测证据与根因；G5 / P5-T09 状态**不代勾**。原报告正被并行方编辑，故另立此文件，未改其工作树内容。

## 1. 结果

| # | 用例 | 结果 |
| --- | --- | --- |
| 1 | 首页 SSR + 货币符号 | ✅ passed |
| 2 | 商品详情变体 / 可加购 | ✅ passed |
| 3 | 加购 → 结算 → 订单结果 | ❌ 30s 超时（`page.fill('#fullName')` 等不到表单） |
| 合计 | `cd shops && E2E_BASE_URL=http://localhost:3014 npx playwright test --config=tests/e2e/playwright.config.ts` | **2 passed / 1 failed** |

与 11:00 G5 报告结论一致：第三项失败源于运行中服务，非用例或业务代码回归。

## 2. `/checkout` 500 的精确根因（本轮新增证据）

```
curl http://localhost:3014/
  → 200
curl http://localhost:3014/checkout
  → 500
{
  "error": true,
  "url": "http://localhost:3014/checkout",
  "statusCode": 500,
  "message": "Cannot find module 'D:\\codes\\web\\shops\\.output\\server\\chunks\\build\\index-CDn8YrA2.mjs'
              imported from D:\\codes\\web\\shops\\.output\\server\\chunks\\build\\server.mjs"
}
```

即：运行中的 Nuxt 进程加载的 `server.mjs` 引用了磁盘上已不存在的构建 chunk
（`.output/server/chunks/build/index-CDn8YrA2.mjs`）——构建产物被重建/覆盖后，进程仍是旧实例。
**非代码回归**；需由服务负责方重建并重启 3014 端口的 Nuxt 服务。本会话**未重启**（会打断并行方调试）。

## 3. 运行方式陷阱（本轮新发现）

| 执行方式 | 结果 |
| --- | --- |
| 仓库根 `npx playwright test --config=shops/tests/e2e/playwright.config.ts` | ❌ `Error: Playwright Test did not expect test() to be called here` + `No tests found` |
| `cd shops && npx playwright test --config=tests/e2e/playwright.config.ts` | ✅ 正常执行 3 项 |

根因：仓库根 `@playwright/test` 与 `shops/node_modules/playwright` 版本不一致，
从根执行时 spec 与 runner 来自不同安装，导致 `test()` 不在预期 suite 中注册。
建议 CI / 文档固定 cwd 为 `shops/`，避免把「运行方式错误」误记为 E2E 失败。

## 4. 行动项

1. **[服务]** 由 3014 服务负责方重建 `.output` 并重启进程，确认 `/checkout` 返回 200。
2. **[复核]** 服务恢复后按 §1 命令复跑，期望 3/3；由责任方在 `g5-regression-report.md` 与计划文档 P5-T09 回填，本报告不代勾。
3. **[文档]** 在 E2E 运行说明中固定 cwd = `shops/`，并注明 `E2E_BASE_URL` 默认为 `http://localhost:3000`（本轮服务在 3014，需显式覆盖）。

## 5. 同期基线（只读复核）

| 项 | 结果 |
| --- | --- |
| 后端全量 | **655 passed / 655（71 文件）** |
| 扩展模块三件套（bundle / referral / warehouse-routing） | **21 passed / 21（3 文件）** |
| 前端 E2E 冒烟 | 2 passed / 1 failed（服务侧阻断，见 §2） |

---

*本报告由真实 HTTP 请求与浏览器执行生成；不含代码改动。*
