# 门禁证据自动化预检（4 门禁 / 17 签字 / 3 类阻塞）

> 生成：2026-11-09 · 交付物：`scripts/gate-preflight.mjs`、`shops/tests/e2e/gate-smoke.playwright.config.ts`、`docs/reports/gate-preflight-result.json`、`.github/workflows/ci.yml`
> 定位：把 **4 个门禁 + 17 项签字 + 3 类阻塞**里所有「能用代码完成」的部分一次性落地，把签字方需要手工收集证据的工作量压到最小。
> **强约束**：不代勾门禁状态、不代替责任方签字、不回填 `shops/mds/storefront-execution-plan_v1.0.md` 的任务行。签字包 `docs/reports/gate-signoff-pack.md` 原件保持不动（17 个 `[ ]` 一个未动）。

---

## 1. 三类阻塞：本轮闭合对照

| 阻塞 | 上轮盘点状态 | 本轮动作 | 结果 |
| --- | --- | --- | --- |
| **① E2E 服务** | 3014 / 4015 报 502、5173 未启动 → G3/G5 浏览器级验收无法复跑 | 排查端口与服务，复用现成 storefront 复跑冒烟 | **技术证据已刷新**：坐实 3014/4015 的 502 是 `HTTP_PROXY`（`127.0.0.1:64652`）返回的**代理假象**，`--noproxy` 直连为 `ECONNREFUSED`（端口无监听）；5173 已恢复（HTTPS `/health` 200）；并行方在 3103 启动的 `.output` 生产构建可直接复用，冒烟 **3/3 通过（14.8s）** |
| **② CI 接线** | `on.push.branches` / `on.pull_request.branches` 不含 `master_shop`，推送不触发 CI | 两处分支列表加入 `master_shop`，并新增只读 `gate-preflight` job | **已闭合**：YAML 解析通过（push / pull_request 均含），每次推送自动复验门禁证据与签字栏完整性；并断言 `deploy-staging.if` 仍只认 `dev`/`develop`，加分支不会误触发自动部署 |
| **③ 并行方 WIP** | 约 61 项未提交，不能代提交 | 精确盘点 + 交接清单（本文 §5） | **未闭合，需并行方动作**：44 个已跟踪修改 + 21 个未跟踪项，按约定不夹带、不代提交、不代决 |

> 关于 ①：本地浏览器冒烟刷新的是 **G3/G5 技术侧证据**，**不能替代** G3-S1（沙箱完整交易 E2E 由责任方确认）、G3-S3 / G5-S2（生产级抽样，需真实环境）等签字项。两者不可混同。

---

## 2. 四个门禁：技术侧已自动化，签字侧留白

| 门禁 | 任务行 | 计划状态 | 技术侧证据 | 签字项 | 已签 | 回填规则 |
| --- | --- | --- | --- | --- | --- | --- |
| G2（信息准确 / 币种 / 可抓取 / 移动端） | P2-T14 | `[~]` | PASS，脚本自动复验 | 3 | 0 | 3 项由责任方勾选后方可回填 `[x]` |
| G3（沙箱闭环 + 异常路径） | P3-T19 | `[~]` | PASS，脚本自动复验 + 冒烟 3/3 | 3 | 0 | 同上 |
| G4（政策审核 / 客服履约 / 埋点） | P4-T17 | `[ ]` | PASS，脚本自动复验 | 4 | 0 | 同上 |
| G5（扩展未破坏主链路） | P5-T09 | `[ ]` | PASS，脚本自动复验 + 冒烟 3/3 | 4 | 0 | 同上 |
| X-T06（发布回滚 Runbook，横切） | X-T06 | 横切 | Runbook 已产出 | 3 | 0 | 同上 |

计划文档的 4 个任务行**一个都没改**：技术侧 PASS 不等于门禁通过，门禁达成须以签字为准。

---

## 3. 17 项签字：结构化分类（全部可对照、可复验）

脚本 `SIGNOFF_ITEMS` 逐字登记了 `docs/reports/gate-signoff-pack.md` 的 17 个签字栏，每项带 `id / gate / 责任方 / 前置条件 / 证据路径 / 复验命令`。

| 类别 | 数量 | 含义 | 开发侧能否闭合 |
| --- | --- | --- | --- |
| `EVIDENCE_READY` | **4** | 技术证据已齐，仅待责任方复核确认（G2-S2、G2-S3、G3-S2、G5-S1） | 证据可自动复验，**结论仍须人给** |
| `EXTERNAL_ENV` | **9** | 需外部账号 / 真实环境 / 第三方（Search Console、法务审核、生产抽样、真实 CDN、staging 与备份演练等） | **不能**，须外部条件先具备 |
| `HUMAN_DECISION` | **4** | 需人工试用或业务决策（沙箱 E2E 确认、RMA 权限分配、admin 试用、RTO/RPO 口径） | **不能**，须责任方决策 |

- 签字栏自检：脚本每次运行会校验签字包仍为 **17 项未勾 / 0 项已勾**；若发现被代勾直接报 `FAIL`。
- 逐项明细：运行 `node scripts/gate-preflight.mjs` 输出完整表格，或查看 `docs/reports/gate-preflight-result.json` 的 `signoff` 数组。

---

## 4. 怎么用（一键复验）

```bash
# 轻量预检：DB / 5173 / storefront / CI 分支 / 签字包完整性 / 文档链接
node scripts/gate-preflight.mjs

# 追加前后端 typecheck
node scripts/gate-preflight.mjs --full

# 追加浏览器冒烟（需先启动 storefront；默认 http://127.0.0.1:3103）
node scripts/gate-preflight.mjs --e2e

# 机器可读输出 / 写入证据快照 / CI 严格模式
node scripts/gate-preflight.mjs --json
node scripts/gate-preflight.mjs --out docs/reports/gate-preflight-result.json
node scripts/gate-preflight.mjs --strict        # 有 FAIL 时退出码 1；WARN 不阻断
```

浏览器冒烟也可单独复跑（必须从 `shops/` 目录运行，避免根与 shops 两份 `@playwright/test` 冲突）：

```bash
cd shops && E2E_BASE_URL=http://127.0.0.1:3103 \
  npx playwright test --config=tests/e2e/gate-smoke.playwright.config.ts
```

CI 侧已接 `gate-preflight` job（`--strict`）：每次触发复验技术证据与签字栏完整性，环境类 `WARN` 不阻断，只有技术检查 `FAIL` 才阻断合并。该 job **不跑** `--e2e`（需 storefront 服务），浏览器冒烟仍由 `e2e-tests` job / 本地复验负责。

> `docs/reports/gate-preflight-result.json` 是 **证据快照**（生成于 HEAD `7b3f012`、含生成时间与当时工作区状态），不是实时状态；重新运行脚本即可刷新。快照记录本次 10 项检查：8 `PASS`、2 `WARN`（3014/4015 历史端口未启动）、0 `FAIL`，其中 `e2e.smoke = 3 例通过`。

---

## 5. 并行方 WIP 交接清单（阻塞 ③，不代提交）

快照时间 2026-11-09 09:58，共 **44 个已跟踪修改 + 21 个未跟踪项**。按约定：不夹带、不代提交、不代决定范围。

### 5.1 已跟踪修改（44）分组

| 目录 | 数量 | 内容 |
| --- | --- | --- |
| `shops/pages` | 16 | 页面级 i18n / 展示文案（前端 WIP 主体） |
| `shops/components` | 10 | 组件 i18n |
| `shops/composables` | 4 | `useCart` / `useExperiment` / `useLocale` / `useSeo` |
| `shops/shared` | 3 | i18n 消息与 mock fixtures |
| `shops/tests` | 2 | `smoke.spec.ts`、`locale.spec.ts` |
| `shops/server` | 2 | `[...mock].ts`、locale 中间件 |
| `docs/reports` | 2 | `g5-regression-report.md`、`security-pentest.md` |
| `shops/app` / `layouts` / `middleware` / `plugins` | 各 1 | `router.options.ts` 等 |
| `.workbuddy` | 1 | `memory/2026-11-05.md`（工作日志，**不提交**） |

### 5.2 未跟踪项（21）分组

- **临时脚本 / 产物（不提交）**：`.box-agent-scratch/` 下 11 项，含 `playwright.local.config.ts`、`g2-audit.cjs`、`g3-fix/`、`p5-fixes/`、`gate-e2e-results/`（本轮 E2E 产物）等；另有 `image-*.png` ×2、`xargs.exe.stackdump` ×2、`server/uploads/reviews/`。
- **待并行方决定是否入库**：`shops/composables/useI18n.ts`、`shops/tests/e2e/diag.spec.ts`、`shops/tests/e2e/playwright.local.config.ts`、`docs/reports/gate-signoff-pack.md`。
- **工作日志（不提交）**：`.workbuddy/memory/2026-11-06.md`。

### 5.3 建议动作（由并行方决定）

1. `shops/` 前端 i18n 约 40 个文件是一整批改动，应作为一个提交整体入库，勿拆分、勿由本线代提。
2. `docs/reports/gate-signoff-pack.md` 是签字载体，建议单独入库；入库后 `signoff.integrity` 自检在 CI 上也会生效（当前因未跟踪为 `SKIP`）。
3. `.box-agent-scratch/`、`*.stackdump`、`image-*.png`、`server/uploads/reviews/` 属临时产物，建议加入 `.gitignore` 后不入库。
4. `.workbuddy/memory/` 为工作日志，按约定不入库。

导出精确清单：`git status --porcelain=v1`。

---

## 6. 仍待责任方 / 真实环境（一律不代勾）

- **17 项签字**：见 `docs/reports/gate-signoff-pack.md` 各节「签字确认」栏，须责任方逐项勾选。
- **4 个门禁回填**：签字齐备后，由责任方在 `shops/mds/storefront-execution-plan_v1.0.md` 把 P2-T14 / P3-T19 / P4-T17 / P5-T09 回填 `[x]`。
- **已登记残留 34 项**：6 份审计报告 27 项 + `docs/reports/p5-fix-readiness.md` §9.6 7 项，多为业务口径确认、需新建迁移或低优先级性能项，本轮未触碰。

---

*本文件只汇总自动化能力与交接信息，不构成任何门禁通过或签字结论。*
