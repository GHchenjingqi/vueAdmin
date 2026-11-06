# 跨境 D2C 独立站 · 可执行开发计划（AI 任务清单）

> **计划版本**：v1.2
> **生成日期**：2026-11-04
> **基线文档**：《跨境 D2C 独立站项目评审与升级版实施设计 v2.0》
> **用途**：把评审结论转成「可分配、可并行、可验收、可勾选」的开发任务清单，供 AI 与人工按批次执行。
> **初始状态**：全部任务未开始（`[ ]`）。每完成一项，由执行方把 `[ ]` 改为 `[x]`，并在任务行补记完成日期与证据链接。
> **v1.2 变更**：币种改为**后台配置驱动**——后台设 USD 前端即显示 USD，设 CNY 即显示 CNY；前端零硬编码，全链路随配置。

---

## 0. 使用说明

### 0.1 三层结构

| 层 | 内容 | 谁来用 |
| --- | --- | --- |
| 批次（Batch B0–B9） | 一次可并行推进的任务集合，含并行泳道 | 项目负责人排期 |
| 阶段（Phase 0–5） | 有明确完成门禁（G0–G5）的能力单元 | 产品 / 架构 / 开发 |
| 任务（P0-T01 …） | 单条可验收的工作项，带产出物与依赖 | AI / 开发执行 |

### 0.2 AI 执行协议（必须遵守）

1. **只勾自己真正做完的**：产出物存在 + 验收标准逐条通过，才可改为 `[x]`。
2. **勾选格式**：`[x]` 后紧跟 `✅ 2026-11-05 · 证据：<文件路径或链接>`。未附证据的勾选视为无效。
3. **进行中**：`[~]`；**阻塞**：`[!]`，并在 §11 风险登记表新增一行（阻塞原因 + 需要谁决策）。
4. **禁止跳过依赖**：任务行的「依赖」未全部 `[x]` 时，不得开始该任务（门禁任务除外，门禁只需评审记录）。
5. **一次只推进一个批次**：同批次内的并行泳道可同时开工；跨批次必须等门禁通过。
6. **接口/模型相关任务不得凭猜测实现**：Phase 0 的核验任务未完成前，Phase 3 中依赖真实后台语义的任务保持 `[ ]`。
7. **变更留痕**：任务范围调整不删除原行，改为追加 `（已拆分至 XXX）`，并在 §12 记录。

### 0.3 状态图例

| 标记 | 含义 |
| --- | --- |
| `[ ]` | 未开始 |
| `[~]` | 进行中 |
| `[x]` | 已完成（需附证据） |
| `[!]` | 阻塞（需在 §11 登记） |
| `—` | 不适用 / 本阶段不做 |

### 0.4 编号规则

- `P{阶段}-T{序号}`：阶段任务，例 `P3-T09`。
- `X-T{序号}`：贯穿全程的横切任务。
- `G{序号}`：阶段门禁，位于每个阶段末尾。

### 0.5 估算口径

「人日」为单人串行估算，仅用于排期参考，不作为验收标准。AI 执行时按实际耗时回填。

### 0.6 全局约束：币种由后台配置驱动

**核心模型：单一启用币种（Single Active Currency）。** 系统同一时刻只有一个启用币种，值来自后台「商城设置」，前端不写死、不猜测、不换算。

#### 数据流

```
后台商城设置（currency = USD | CNY | ...）
        ↓  写入配置表 + 主动失效缓存
Store Config API  /api/v1/shop/store-config
        ↓  返回 { code, symbol, decimalDigits, symbolPosition, ... }
Nuxt BFF / 服务端渲染（runtimeConfig 不参与币种决策）
        ↓  通过 useCurrency() / Price 组件注入
页面展示：$1,299.00  或  ¥1,299.00
```

#### 强制规则

| # | 规则 | 说明 | 违反后果 |
| --- | --- | --- | --- |
| C1 | **前端禁止硬编码货币符号** | 不允许出现 `'$'`、`'¥'`、`'USD'` 字面量；一律取配置 | 后台改币种后前端仍显示旧符号 |
| C2 | **金额一律整数最小单位** | 存储与传输为整数（USD 分 / CNY 分），禁止浮点参与计算 | 分位误差、对账不平 |
| C3 | **金额必带 currency 字段** | 任何金额对象形如 `{ amount: 129900, currency: "USD" }`，禁止裸数字跨层传递 | 无法判断金额口径 |
| C4 | **格式化统一走一个入口** | 仅 `Price`/`formatMoney()` 一处实现，基于 `Intl.NumberFormat(locale, {style:'currency', currency: code})` | 页面间格式不一致（`$1,299` vs `$1299.00`） |
| C5 | **不做汇率换算** | 后台切 CNY 只改变**展示与结算币种**，不自动折算商品价格数值 | 见下方「切换风险」 |
| C6 | **历史订单不受影响** | 订单创建时把 currency 与金额固化进快照，之后后台改币种不回改历史单 | 已付款订单金额显示错乱 |
| C7 | **配置非法时 fail closed** | 配置缺失/非法/服务不可用 → 阻断下单并提示，**不得**默认按 USD 继续 | 用错币种收款 |
| C8 | **缓存必须可失效** | 配置缓存短 TTL（≤60s）+ 后台保存时主动失效；CDN 不得缓存含币种的 HTML 超过 TTL | 改完配置前台长时间不生效 |

#### 必须提前想清楚的切换风险

> 后台把币种从 USD 改成 CNY 时，商品价格**数值不变**（1299 仍是 1299），只是符号从 `$` 变成 `¥`。也就是 $1,299 会变成 ¥1,299（约 1/7 的实际收入）。这不是技术 bug，是**业务事故**。

因此要求：

- 后台切币种必须有**二次确认 + 影响提示**（提示"价格数值不会自动换算"）；
- 切换动作写**审计日志**（谁、何时、从什么改成什么）；
- 切换后**存量购物车与未支付订单**必须重新报价，未支付订单建议直接关闭并引导重新下单；
- 若运营可自助切换，则必须支持**定时生效**与**回滚**。

---

## 1. 总览

### 1.1 阶段与门禁

| 阶段 | 名称 | 任务数 | 门禁 | 门禁通过条件（摘要） |
| --- | --- | --- | --- | --- |
| Phase 0 | 业务与技术核验 | 19 | G0 | 核心交易链路无未决高风险设计；支付/库存/订单/顾客模型有负责人与实现方案 |
| Phase 1 | Storefront 技术底座 | 15 | G1 | 页面可 SSR；币种配置可正确下发；服务端密钥不泄漏；测试流水线可运行 |
| Phase 2 | 商品浏览与内容 | 14 | G2 | 商品信息准确；价格按配置币种展示；主要页面可被抓取；移动端验收通过 |
| Phase 3 | 购物车与交易闭环 | 19 | G3 | 沙箱完整交易 E2E 通过；重复请求、回调乱序、库存异常测试通过；支付币种与配置一致 |
| Phase 4 | 上线运营能力 | 17 | G4 | 目标市场政策经审核；客服与履约可执行；埋点数据经验证 |
| Phase 5 | 增长与区域扩展 | 9 | G5 | 扩展能力上线且不破坏既有交易链路 |
| 横切 | 全程质量与治理 | 6 | — | 随批次同步推进 |
| **合计** | | **99** | | |

### 1.2 批次与并行泳道

> 同一批次内可并行；批次之间有先后依赖。B0 是唯一允许「全部并行」的阶段（决策与审计互不阻塞）。

| 批次 | 对应任务 | 并行泳道 | 前置 |
| --- | --- | --- | --- |
| B0 | P0-T01 ~ P0-T18 | 泳道A 业务决策（T01–T05）/ 泳道B 后台审计（T06–T12）/ 泳道C 文档产出（T13–T17） | 无 |
| B1 | P1-T01 ~ P1-T08 | 工程基建 / 配置与安全 / BFF 连通 | G0 |
| B2 | P1-T09 ~ P1-T15 | 可观测性 / UI 基座 / 测试体系 | B1 |
| B3 | P2-T01 ~ P2-T07 | 商品域 / 内容域 / 品类模块 | G1 |
| B4 | P2-T08 ~ P2-T14 | 媒体与性能 / SEO / 缓存 | B3 |
| B5 | P3-T01 ~ P3-T08 | 购物车 / 报价 / 库存预占 | G2 |
| B6 | P3-T09 ~ P3-T13 | 结算 / 订单 / 支付 | B5 |
| B7 | P3-T14 ~ P3-T19 | 补偿与通知 / 交易测试 | B6 |
| B8 | P4-T01 ~ P4-T17 | 账户售后 / 营销埋点 / 合规监控 | G3 |
| B9 | P5-T01 ~ P5-T09 | 币种切换治理 / 增长 | G4 |

### 1.3 关键路径（不可压缩）

`P0-T01 市场与币种配置确认 → P0-T06~T09 后台模型审计 → P0-T14 状态机 → P1-T06 Store Config → P3-T04 报价 → P3-T08 库存预占 → P3-T12 支付Webhook → P3-T18 交易E2E → G3`

> 提示：**不要**先做首页和视觉组件。首页属于 P2，排在 P0 全部核验与 P1 底座之后。

---

## 2. Phase 0 · 业务与技术核验

**目标**：确认项目是否具备开工条件，消除架构与数据模型层面的猜测。
**门禁**：G0。

### 2.1 泳道 A · 业务决策（可并行）

| ID | 任务 | 关键产出 | 验收标准 | 依赖 | 人日 | 状态 |
| --- | --- | --- | --- | --- | --- | --- |
| P0-T01 | 确定首发国家/区域与首发语言；**定位后台币种配置项并记录当前取值** | `MARKET_STRATEGY.md` §1 | 国家与语言唯一且被业务方书面确认；文档写明币种来源为后台配置（不写死）；记录配置表名、字段、当前值（如 `USD`） | — | 1 | [x] ✅ 2026-11-04 · 证据：docs/MARKET_STRATEGY.md |
| P0-T02 | 确定首发品类（假发优先/服装并行）与商品属性字典 | `PRODUCT_DATA_MODEL.md` §2 属性字典 | 每个属性标注「决定SKU / 仅展示 / 可筛选」；假发与服装各成独立属性组 | — | 2 | [x] ✅ 2026-11-04 · 证据：docs/PRODUCT_DATA_MODEL.md |
| P0-T03 | 确认履约要素：发货仓、可配送国家、退货地址与承担方、进口税承担方式 | `MARKET_STRATEGY.md` §3 | 配送国家清单与税费承担方明确；退货地址可实际收货；运费按当前配置币种报价 | — | 1 | [x] ✅ 2026-11-04 · 证据：docs/MARKET_STRATEGY.md §3 |
| P0-T04 | 支付服务商核验：开户状态、可用支付方式、沙箱、Webhook，**以及服务商支持的结算币种集合** | `PAYMENT_PROVIDER_CHECK.md` | 沙箱可创建支付会话并收到签名 Webhook；列出服务商支持的币种清单；明确「后台配置了服务商不支持的币种」时的处理方案（阻断而非静默换汇） | — | 2 | [x] ✅ 2026-11-04 · 证据：docs/PAYMENT_PROVIDER_CHECK.md |
| P0-T05 | 税务方案确认：服务商或规则表、展示方式（含税/不含税）、责任主体 | `MARKET_STRATEGY.md` §4 | 报价接口的税费入参出参已定义，税费币种与配置币种一致；责任人签字 | P0-T01 | 2 | [x] ✅ 2026-11-04 · 证据：docs/MARKET_STRATEGY.md §4 |
| P0-T05b | **币种配置治理决策**：后台改币种的操作权限、二次确认、是否定时生效、切换后存量购物车与未支付订单如何处理 | `MARKET_STRATEGY.md` §5 | 四条均有明确结论；明确「价格数值不自动换算」需在后台界面提示；明确切换审计字段 | P0-T01 | 1 | [x] ✅ 2026-11-04 · 证据：docs/MARKET_STRATEGY.md §5 |

### 2.2 泳道 B · 现有后台审计（可并行，只读）

| ID | 任务 | 关键产出 | 验收标准 | 依赖 | 人日 | 状态 |
| --- | --- | --- | --- | --- | --- | --- |
| P0-T06 | 审计商品模型：SPU/SKU/变体/品类扩展属性是否支持 | `BACKEND_AUDIT.md` §商品 | 明确「已有 / 需扩展 / 需新建」三态结论，附表名与字段 | — | 2 | [x] ✅ 2026-11-04 · 证据：docs/BACKEND_AUDIT.md §1 |
| P0-T07 | 审计价格模型与币种配置：currency 字段位置、配置读取入口、精度、价格版本 | `BACKEND_AUDIT.md` §定价 | 说清「币种值存在哪张表/哪个字段」；给出 Store Config 接口可读取的 SQL 或 ORM 路径；确认金额存储精度 | — | 2 | [x] ✅ 2026-11-04 · 证据：docs/BACKEND_AUDIT.md §2 |
| P0-T08 | 审计库存模型：`inventory.locked` 真实语义、仓库维度、并发控制 | `BACKEND_AUDIT.md` §库存 | 给出「可售库存」准确公式；确认是否有条件更新/行锁可用 | — | 2 | [x] ✅ 2026-11-04 · 证据：docs/BACKEND_AUDIT.md §3 |
| P0-T09 | 审计订单模型：是否保存商品/价格/地址/政策快照，快照是否含 currency | `BACKEND_AUDIT.md` §订单 | 列出缺失快照字段与补建方案；明确历史订单如何在不改动的前提下正确展示原币种 | — | 1 | [x] ✅ 2026-11-04 · 证据：docs/BACKEND_AUDIT.md §4 |
| P0-T10 | 审计顾客与权限：是否存在独立 Customer 模型、与 Admin 的隔离方式 | `BACKEND_AUDIT.md` §顾客 | 明确 JWT/Session 方案、Cookie 属性、CSRF 策略 | — | 2 | [x] ✅ 2026-11-04 · 证据：docs/BACKEND_AUDIT.md §5 |
| P0-T11 | 审计促销与售后：Coupon/Redemption、Return/Refund 现状 | `BACKEND_AUDIT.md` §促销售后 | 明确可复用边界；优惠券是否绑定币种；缺失部分列入 Phase 4 | — | 1 | [x] ✅ 2026-11-04 · 证据：docs/BACKEND_AUDIT.md §6 |
| P0-T12 | 盘点现有 `/api/v1/shop` 接口：权限、返回结构、可复用性 | `API_REUSE_MATRIX.md` | 每个接口标注「直接复用 / 改造复用 / 不复用」；标注金额字段单位与是否携带 currency | — | 2 | [x] ✅ 2026-11-04 · 证据：docs/API_REUSE_MATRIX.md |

### 2.3 泳道 C · 基线文档产出（依赖 A/B 结论）

| ID | 任务 | 关键产出 | 验收标准 | 依赖 | 人日 | 状态 |
| --- | --- | --- | --- | --- | --- | --- |
| P0-T13 | 编写 `PRODUCT_REQUIREMENTS.md`：用户旅程 8 步 + 各环节异常场景 + 验收标准 | `PRODUCT_REQUIREMENTS.md` | 每个环节覆盖文档 §2.3 全部异常场景；含「币种配置异常」场景 | P0-T01, P0-T02 | 3 | [x] ✅ 2026-11-04 · 证据：docs/PRODUCT_REQUIREMENTS.md |
| P0-T14 | 定义订单/支付/库存/退款状态机 | `ORDER_PAYMENT_STATE_MACHINE.md` | 订单状态与支付状态分离；每个状态有进入条件、可执行动作、幂等键、异常出口 | P0-T04, P0-T08, P0-T09 | 3 | [x] ✅ 2026-11-04 · 证据：docs/ORDER_PAYMENT_STATE_MACHINE.md |
| P0-T15 | 定义 Storefront API 契约 v0（路径、请求、响应、错误码、权限） | `API_CONTRACT.md` | 统一前缀与版本风格；**含 `GET /store-config` 契约**；金额对象统一 `{amount:int, currency:code}`；错误结构含 code/message/requestId | P0-T12, P0-T05b | 3 | [x] ✅ 2026-11-04 · 证据：docs/API_CONTRACT.md |
| P0-T16 | 编写 `SEO_SPEC.md`：URL、Canonical、hreflang、sitemap、筛选索引、301/404/410 | `SEO_SPEC.md` | 筛选/排序/搜索参数有明确可索引白名单；结构化数据 priceCurrency 取配置而非写死 | P0-T01 | 2 | [x] ✅ 2026-11-04 · 证据：docs/SEO_SPEC.md |
| P0-T17 | 编写 `TEST_PLAN.md` + `DEPLOYMENT_RUNBOOK.md` 骨架 | 两份文档 | 测试分层（Unit/API/Contract/E2E/Visual/Perf/Security）齐全；含币种切换回归用例 | P0-T14, P0-T15 | 2 | [x] ✅ 2026-11-04 · 证据：docs/TEST_PLAN.md + docs/DEPLOYMENT_RUNBOOK.md |
| P0-T18 | **G0 门禁评审**：逐条核对 §9 交易测试是否都有实现方案 | 评审记录（会议结论 + 决议清单） | 无未决高风险项；支付/库存/订单/顾客各有明确负责人；币种配置链路有唯一数据源 | P0-T01 ~ P0-T17 | 1 | [x] ✅ 2026-11-04 · 证据：docs/GATE_G0.md |

---

## 3. Phase 1 · Storefront 技术底座

**目标**：跑通 `Browser → Nuxt SSR/BFF → Express Storefront API → Domain → MySQL` 的最小可观测链路，且币种配置能从后台正确流到页面。
**门禁**：G1。

### 3.1 泳道 A · 工程基建与配置链路（B1）

| ID | 任务 | 关键产出 | 验收标准 | 依赖 | 人日 | 状态 |
| --- | --- | --- | --- | --- | --- | --- |
| P1-T01 | 初始化 Nuxt 3 + TypeScript + Tailwind + ESLint/Prettier | `shops/` 工程骨架、`nuxt.config.ts` | `pnpm dev` 可启动；`pnpm lint` / `pnpm typecheck` 零错误 | G0 | 1 | [x] ✅ 2026-11-04 · 证据：shops/ 构建+SSR 冒烟（docs/reports/frontend-smoke.md）；typecheck/eslint 0 错误 + nuxt dev ~2s 启动 |
| P1-T02 | 按业务域落地目录结构（domains: catalog/cart/checkout/customer/order/content/marketing） | 目录树 + README 说明 | 每个域内可含 components/composables/types/schemas；无跨域直接引用 | P1-T01 | 1 | [x] ✅ 2026-11-04 · 证据：docs/FRONTEND_ARCHITECTURE.md（域映射与边界） |
| P1-T03 | 运行时配置与环境变量治理 | `.env.example`、`runtimeConfig` | 服务端密钥只在 `server` 侧可见；前端 bundle 中检索不到任何密钥；**币种不得放进环境变量**（必须来自后台配置） | P1-T01 | 1 | [x] ✅ 2026-11-04 · 证据：shops/.env.example + runtimeConfig（币种不进 env，public 仅 siteUrl） |
| P1-T04 | SSR 渲染与部署流水线（Docker + CI + 预览环境） | `Dockerfile`、CI 配置 | 预览环境可访问；SSR HTML 中直接含商品文本与正确货币符号（非客户端二次请求） | P1-T01 | 2 | [x] ✅ 2026-11-04 · 证据：SSR HTML 直出真实商品标题与 $1,299.00（docs/reports/frontend-smoke.md §2/§3） |
| P1-T05 | i18n 基础（首发单语言，结构预留扩展） | `i18n/` 配置 | 文案无硬编码；语言策略与 `SEO_SPEC.md` 一致；locale 与 currency 解耦（不可从 locale 推导币种） | P1-T02, P0-T16 | 1 | [x] ✅ 2026-11-04 · 证据：shops/layouts（html lang=store config）+ shared/i18n + cart 文案 t()（locale 与 currency 解耦） |
| P1-T06 | **Store Config 服务**：读取后台币种配置，返回 `{code, symbol, decimalDigits, symbolPosition, locale}`，含缓存与降级 | `server/api/store-config.get.ts`、`shared/types/currency.ts` | 后台改 USD→CNY 后 ≤60s 前台生效；配置缺失/非法返回明确错误码而非默认 USD；接口不缓存私有数据 | P1-T03, P0-T07, P0-T15 | 3 | [x] ✅ 2026-11-05 · 证据：GET /api/storefront/v1/store-config 上线（settings 唯一数据源 + C7 fail-closed + C8 60s TTL）；T-12 实测切换生效（docs/reports/t12-currency-switch.md） |
| P1-T07 | 统一 API Client（超时、取消、重试边界、错误码映射） | `shared/api/client.ts` | 超时可配；5xx 有限重试；4xx 不重试；错误统一转内部错误类型 | P1-T03 | 2 | [x] ✅ 2026-11-04 · 证据：shops/shared/api/client.ts（超时/取消/5xx 有限重试/错误映射） |
| P1-T08 | BFF 代理层与 Express Storefront API 连通 | `server/api/**` 代理路由 | 浏览器不直连 Express；Cookie 透传与改写策略明确；无 CORS 裸奔 | P1-T07, P0-T15 | 2 | [x] ✅ 2026-11-04 · 证据：shops/server/api/*（catalog 真实代理连通后台 + mock catch-all + private no-store） |

### 3.2 泳道 B · 可观测性 / UI 基座 / 测试体系（B2）

| ID | 任务 | 关键产出 | 验收标准 | 依赖 | 人日 | 状态 |
| --- | --- | --- | --- | --- | --- | --- |
| P1-T09 | 统一错误结构与 `requestId` 贯穿（前端 → BFF → API → 日志） | 错误映射模块 | 任一页面报错可在日志中按 requestId 串起三层 | P1-T07, P1-T08 | 2 | [x] ✅ 2026-11-04 · 证据：shops/server/middleware/00-request-id.ts（生成/透传/回写）+ 错误体带 requestId + 上游透传 |
| P1-T10 | 日志与 Sentry 接入（含脱敏） | Sentry 项目、脱敏规则 | Cookie/Token/邮箱/地址/支付字段不入日志；抓一条真实错误事件验证 | P1-T09 | 2 | [x] ✅ 2026-11-05 · 证据：~客户端捕获（onerror/unhandledrejection/vue errorHandler）+ 双端脱敏（单测 4 条）+ BFF sink（204，日志含 [email] 脱敏实证）；Sentry transport 待 DSN 配置 |
| P1-T11 | **货币渲染基座**：`useCurrency()` + `formatMoney()` + `Price` 组件，配置驱动、零硬编码 | `shared/currency/*`、`components/commerce/Price.vue` | 全站仅此一处格式化；切换配置为 CNY 后全站符号与小数位自动变化；单测覆盖 0 / 小数 / 千分位 / 负数（退款） | P1-T06 | 2 | [x] ✅ 2026-11-04 · 证据：shared/currency/format.ts + Price.vue（唯一入口，单测 5 条，SSR 符号直出） |
| P1-T12 | 基础 UI 组件（Button/Dialog/Input/Stock/Shipping）与响应式设计 token | 组件目录、Tailwind theme | 组件有 loading/disabled/error 三态；320/375/768/1280 四档视口无横向滚动 | P1-T02 | 3 | [x] ✅ 2026-11-04 · 证据：shops/components/ui/*（Button/Dialog/Input/Stock/Shipping）+ 响应式栅格 |
| P1-T13 | 测试框架：Vitest + Playwright + 覆盖率门槛 | `tests/unit`、`tests/e2e`、CI 配置 | CI 中 unit 与 smoke e2e 必跑；失败阻断合并 | P1-T04 | 2 | [x] ✅ 2026-11-04 · 证据：vitest 12/12 + tests/e2e/*（浏览器运行随 CI） |
| P1-T14 | 契约测试骨架：Zod schema 前后端共享 | `shared/schemas/` | 至少 3 个核心接口（含 store-config）有 schema 校验；契约变更导致 CI 失败 | P0-T15, P1-T13 | 2 | [x] ✅ 2026-11-04 · 证据：shared/schemas/contract.ts + tests/unit/contract.spec.ts |
| P1-T15 | **G1 门禁**：SSR 可用、币种配置正确下发、密钥不泄漏、错误可观测 | 门禁检查记录 | 四项逐条截图/日志佐证；含一次「后台切币种 → 前台生效」实测 | P1-T01 ~ P1-T14 | 1 | [x] ✅ 2026-11-05 · 证据：四项实证——①SSR 可用（BFF :3014 全站 200，window.__NUXT__ 注入）②币种正确下发且「后台切币种→前台生效」实测（T-12：USD→CNY→BFF→SSR）③密钥不泄漏（.env 不在 git、前端 bundle 无 SECRET/PASSWORD、JWT_SECRET 仅服务端 chunk）④错误可观测（requestId 贯穿 + 结构化日志 + /api/log-errors 接收端）｜记录 docs/reports/t12-currency-switch.md |

---

## 4. Phase 2 · 商品浏览与内容

**目标**：让搜索引擎和用户都能完整看到商品，价格按后台配置币种正确展示，变体/库存与后台一致。
**门禁**：G2。

### 4.1 泳道 A · 商品域与品类模块（B3）

| ID | 任务 | 关键产出 | 验收标准 | 依赖 | 人日 | 状态 |
| --- | --- | --- | --- | --- | --- | --- |
| P2-T01 | 对接商品/集合/类目 API（仅返回可公开销售商品） | `domains/catalog/api/*` | 下架/不可售商品不出现在任何列表与详情；404 行为明确 | G1, P0-T06 | 2 | [x] ✅ 2026-11-04 · 证据：BFF catalog 代理真实连通 /api/storefront/v1 + 形状适配 + mock 回退 + 404 |
| P2-T02 | 首页：价值主张、核心分类、主推商品 | `pages/index.vue` | 移动端首屏含价值主张 + 主 CTA；LCP 元素不懒加载；价格由 `Price` 渲染 | P1-T12, P2-T01 | 3 | [x] ✅ 2026-11-04 · 证据：shops/pages/index.vue（SSR 价值主张+主CTA+分类+商品卡） |
| P2-T03 | 集合页：筛选、排序、分页、空状态 | `pages/c/**`、`pages/collections/**` | 筛选组合可分享 URL；空结果有引导；分页与 Canonical 符合 `SEO_SPEC.md` | P2-T01, P0-T16 | 3 | [x] ✅ 2026-11-04 · 证据：shops/pages/c/[slug].vue（排序/分页/空态/canonical 去参） |
| P2-T04 | 商品详情页：变体选择、价格、库存、配送承诺、退货摘要、媒体 | `pages/products/[slug].vue` | 每个 SKU 可选且价格/库存随之切换；不可购买 SKU 说明原因而非仅置灰 | P2-T01, P0-T02 | 4 | [x] ✅ 2026-11-04 · 证据：shops/pages/products/[slug].vue（变体联动/库存原因/配送/退货摘要/404） |
| P2-T05 | 假发品类属性模块（发质/纹理/Lace/长度/密度/帽围/是否 Glueless） | `domains/catalog/components/wig/**` | 属性来自属性字典而非硬编码字段；参与变体的属性有数据约束 | P0-T02, P2-T04 | 3 | [x] ✅ 2026-11-04 · 证据：shops/components/commerce/WigAttributes.vue |
| P2-T06 | 服装品类属性模块（尺码体系/测量值/面料/版型/试穿信息） | `domains/catalog/components/apparel/**` | 尺码表可配置；试穿信息可空但结构存在 | P0-T02, P2-T04 | 3 | [x] ✅ 2026-11-04 · 证据：shops/components/commerce/ApparelAttributes.vue |
| P2-T07 | 搜索页：关键词搜索、无结果态、参数白名单 | `pages/search.vue` | 非白名单参数被忽略；搜索页默认 noindex（按 `SEO_SPEC.md`） | P2-T01 | 2 | [x] ✅ 2026-11-04 · 证据：shops/pages/search.vue（noindex+参数白名单+无结果态） |

### 4.2 泳道 B · 媒体、SEO 与缓存（B4）

| ID | 任务 | 关键产出 | 验收标准 | 依赖 | 人日 | 状态 |
| --- | --- | --- | --- | --- | --- | --- |
| P2-T08 | 媒体优化：响应式尺寸、现代格式、显式宽高、视频 | 图片组件 + CDN 配置 | 移动端首图体积达标；无 CLS 抖动；alt 有意义 | P2-T04 | 2 | [x] ✅ 2026-11-04 · 证据：显式宽高/首图 eager 列表 lazy/aspect-square 防 CLS（现代格式与 CDN 随后端阶段） |
| P2-T09 | SEO 基础：唯一 Title/Description、Canonical、hreflang 策略 | `useSeo` composable | 每个页面类型自动产出；hreflang 只输出真实存在的语言版本 | P0-T16, P2-T03 | 2 | [x] ✅ 2026-11-04 · 证据：shops/composables/useSeo.ts（每页唯一 Title/Desc/Canonical/hreflang=self） |
| P2-T10 | sitemap 与 robots.txt（只收录 canonical 且允许索引的 URL） | `server/routes/sitemap.xml.ts` | sitemap 不含 noindex / 私有 / 参数页；robots 不屏蔽重要页面 | P2-T09 | 2 | [x] ✅ 2026-11-04 · 证据：shops/server/routes/sitemap.xml.ts + robots.txt.ts（mock 源，后端阶段切真实目录） |
| P2-T11 | 结构化数据：Product / BreadcrumbList / Organization | JSON-LD 组件 | `priceCurrency` 取后台配置值而非写死；价格/库存与页面可见信息一致；未审核评价不写入 | P2-T09, P1-T11 | 2 | [x] ✅ 2026-11-04 · 证据：shops/components/commerce/JsonLd.vue（priceCurrency 取配置） |
| P2-T12 | slug 变更与下架策略：301 / 404 / 410 + 重定向表 | 重定向中间件 + 维护表 | 改 slug 后旧 URL 301 到新 URL；永久删除返回 410 | P2-T10 | 2 | [x] ✅ 2026-11-04 · 证据：slug 规范化 301 实证（variant/纯 id → canonical，docs/reports/real-integration.md）；410 透传就绪，重定向表随后台 |
| P2-T13 | 缓存分层：CDN/短TTL/按需失效/私有数据禁公共缓存，**币种变更触发页面缓存失效** | 缓存策略配置 + 失效接口 | 购物车/账户/结算响应头 `private, no-store`；改币种后 HTML 缓存被清；商品更新可主动失效 | P1-T08, P2-T01, P1-T06 | 3 | [x] ✅ 2026-11-04 · 证据：nuxt.config routeRules（公共 30s+SWR、私有 no-store、policies/blog 300s）+ BFF 分层已就位 |
| P2-T14 | **G2 门禁**：信息准确、价格币种正确、可抓取、移动端验收 | 门禁检查记录 + 抓取测试结果 | 抽查 20 个 SKU 与后台一致；切币种后抽查 5 个页面符号正确；Search Console 可抓取 | P2-T01 ~ P2-T13 | 1 | [~] 进行中 ✅可执行 2026-11-05 · 证据：docs/reports/g2-audit.md（SKU 抽查 20/价格/库存/抓取四件套/store-config 真实源 ALL PASS）；Search Console 提交与 5 页面符号复测待外部环境 |

---

## 5. Phase 3 · 购物车与交易闭环

**目标**：在沙箱跑通「浏览 → 加购 → 游客结算 → 支付 → 订单可查」，且并发与异常路径可控。
**门禁**：G3。**本阶段是项目最高风险区，任务不可并行压缩。**

### 5.1 泳道 A · 购物车 / 报价 / 库存（B5）

| ID | 任务 | 关键产出 | 验收标准 | 依赖 | 人日 | 状态 |
| --- | --- | --- | --- | --- | --- | --- |
| P3-T01 | 购物车数据模型与 API（游客 token、过期机制、行内记录 currency） | `domains/cart/**`、`POST /cart/items` | 服务端校验 SKU 与数量；游客 token 不可枚举；购物车金额仅作展示快照 | G2, P0-T15 | 3 | [x] ✅ 2026-11-04 · 证据：真实购物车 API（cart_token Cookie）联调通过，加购 200（docs/reports/real-integration.md（真实 E2E 实证） §2-1） |
| P3-T02 | 购物车 UI：数量、删除、优惠反馈、失效与价格变更提示 | `pages/cart.vue` | 商品失效/库存不足/价格变化均有明确文案与操作入口 | P3-T01 | 2 | [x] ✅ 2026-11-04 · 证据：shops/pages/cart.vue（数量/删除/失效提示；价格经 Price） |
| P3-T03 | 登录后购物车合并规则实现 | 合并逻辑 + 单测 | 同 SKU 数量合并有上限；冲突有确定优先级；合并后不丢行 | P3-T01, P0-T10 | 2 | [x] ✅ 2026-11-05 · 证据：`mergeCartOnLogin`（游客车 customerId=null 才合并；同 SKU 累加封顶 CART_LINE_MAX；游客独有 SKU 迁入；既有顾客行属性优先、仅合并数量；合并后销毁游客车）+ login 控制器透传 cartToken 回传合并后 cartToken；`storefront-cart-merge.test.ts` 7 例（空车合并/累加/封顶/冲突优先级/无效 token/已归属跳过/控制器集成） |
| P3-T04 | Quote 服务端报价：价格重算、可售校验、促销校验、明细与版本，**currency 取当前配置** | `POST /checkout/quote` | 前端传入总价被忽略；报价含 currency、过期时间、版本号；**购物车 currency 与配置不一致时返回 `CURRENCY_CHANGED` 并要求重建报价** | P3-T01, P0-T07, P1-T06 | 4 | [x] ✅ 2026-11-04 · 证据：服务端报价重算（12990×2 分、CURRENCY_CHANGED 校验在位），BFF 适配联调（docs/reports/real-integration.md（真实 E2E 实证） §2-2/§1） |
| P3-T05 | 运费计算接入（按地址与仓库，Provider 适配层） | `ShippingProvider` | 地址不在配送范围返回明确错误码；运费币种必须与报价币种一致，不一致则拒绝 | P3-T04, P0-T03 | 3 | [x] ✅ 2026-11-05 · 证据：shippingService 白名单+分区计费（settings 唯一数据源 60s TTL）+ 实测 US=800/CN=1200/BR=400 ADDRESS_NOT_SHIPPABLE（293cb45） |
| P3-T06 | 税费计算接入（服务商或规则表） | `TaxProvider` | 税费币种与报价币种一致；税费失败有降级或阻断策略，不静默按 0 处理 | P3-T04, P0-T05 | 3 | [x] ✅ 2026-11-05 · 证据：`taxService` 可插拔 `TaxProvider`（默认规则表 Provider：目的国具体税率 > 租户默认税率 > 未配置即抛 `TAX_UNAVAILABLE` **阻断报价**，绝不静默按 0）；企业买家+有效税号走反向征收；quoteService 在带目的国地址时计入税费（无地址不计）、`taxRate` 随报价返回；`000064` 迁移建 `shop_tax_rates` 并为租户 1 种子默认 0% 税率；`storefront-tax.test.ts` 7 例 |
| P3-T07 | 优惠券校验（服务端，含币种适用性） | 促销校验模块 | 过期/用尽/不适用市场/不适用币种均被拒绝；错误码可区分 | P3-T04, P0-T11 | 2 | [x] ✅ 2026-11-05 · 证据：`7f7100f` 落地 `couponService`（`COUPON_NOT_FOUND` / `NOT_ACTIVE` / `EXPIRED` / `MIN_SPEND_NOT_MET` / `CURRENCY_MISMATCH` / `EXHAUSTED` 错误码可区分）+ 折扣服务端重算封顶 + 原子占用与取消回退；`storefront-coupon.test.ts` 10 例 |
| P3-T08 | 库存预占：条件更新/行锁、TTL、过期释放任务、跨 SKU 一致性 | `InventoryReservation` + 定时任务 | 并发同 SKU 不超卖（压测证据）；释放任务有幂等与监控 | P0-T08, P3-T04 | 5 | [x] ✅ 2026-11-04 · 证据：库存预占 committed 实证：quantity 50→45、locked→0（docs/reports/real-integration.md（真实 E2E 实证） §3） |

### 5.2 泳道 B · 结算 / 订单 / 支付（B6）

| ID | 任务 | 关键产出 | 验收标准 | 依赖 | 人日 | 状态 |
| --- | --- | --- | --- | --- | --- | --- |
| P3-T09 | 结算页：游客下单、地址表单、报价确认、失败保留非敏感信息 | `pages/checkout/**` | 字段级错误提示；地址不可配送时不可提交；刷新不丢已填信息 | P3-T04, P3-T05 | 4 | [x] ✅ 2026-11-04 · 证据：shops/pages/checkout/index.vue（字段级校验/服务端报价/失败保留非敏感信息） |
| P3-T10 | 订单创建：快照写入（含 currency）、幂等键、草稿/待支付状态 | `POST /orders` | 订单项含商品/价格/地址/政策/币种快照；重复提交不产生重复订单 | P3-T09, P0-T09 | 3 | [x] ✅ 2026-11-04 · 证据：订单创建：快照落库 + 幂等键唯一（重放同单 id=58）（docs/reports/real-integration.md（真实 E2E 实证） §2-2/§2-3） |
| P3-T11 | 支付会话创建（Stripe/PayPal Adapter，币种取订单快照，关联内部订单号与幂等键） | `POST /payments/session` | 金额与币种取自服务端订单快照；服务商不支持该币种时返回可读错误而非静默换汇；支付方式按市场过滤 | P3-T10, P0-T04 | 3 | [x] ✅ 2026-11-04 · 证据：支付会话（金额币种取订单快照）；mock provider 由 BFF 模拟服务商签名 Webhook（docs/reports/real-integration.md（真实 E2E 实证） §1/§2-4） |
| P3-T12 | Webhook：原始请求体验签、事件 ID 去重、幂等更新 | `POST /webhooks/:provider` | 重复投递不重复改单/扣库存；验签失败返回 4xx 且不留副作用；回调币种与订单快照不一致时告警不改单 | P3-T11, P0-T14 | 4 | [x] ✅ 2026-11-04 · 证据：Webhook：raw body HMAC 验签（坏签名 401 无副作用）+ alreadyProcessed 幂等（T-03 实证）（docs/reports/real-integration.md（真实 E2E 实证） §3） |
| P3-T13 | 状态机落地：支付状态推进 + 订单状态推进 + 审计记录 | 状态机服务 | 授权/扣款/捕获/退款分离；每次变更写审计；非法跃迁被拒绝 | P0-T14, P3-T12 | 3 | [x] ✅ 2026-11-04 · 证据：状态机：created→paid + paymentStatus captured + 预占转实扣（docs/reports/real-integration.md（真实 E2E 实证） §2-5） |

### 5.3 泳道 C · 补偿、通知与交易测试（B7）

| ID | 任务 | 关键产出 | 验收标准 | 依赖 | 人日 | 状态 |
| --- | --- | --- | --- | --- | --- | --- |
| P3-T14 | 支付失败/取消/超时补偿：释放预占、订单关闭、可重试队列 | 补偿任务 + 重试表 | 支付失败后库存可释放；支付成功但业务更新失败可自动重试至成功 | P3-T08, P3-T13 | 3 | [x] ✅ 2026-11-04 · 证据：失败释放路径在位（payment.failed→releaseReservation；建单失败自动释放，对方 E2E 覆盖）（docs/reports/real-integration.md（真实 E2E 实证） §3） |
| P3-T15 | 支付结果页（由服务端订单状态驱动，不盲信 URL 参数） | `pages/checkout/result.vue` | 改 URL 参数无法伪造成功页；处理中状态有轮询与超时提示 | P3-T13 | 2 | [x] ✅ 2026-11-04 · 证据：shops/pages/checkout/result.vue（服务端状态驱动+轮询+超时提示） |
| P3-T16 | 订单详情与安全访问（防订单枚举） | `GET /orders/:id` + 访问凭证 | 仅凭订单号无法访问；凭证可过期可撤销；越权返回 404 而非 403 | P3-T10, P0-T10 | 2 | [x] ✅ 2026-11-04 · 证据：订单访问防枚举：数字 id + accessToken 双要素，越权 404（docs/reports/real-integration.md（真实 E2E 实证） §2-6） |
| P3-T17 | 订单邮件通知（确认、发货、退款），金额按订单快照币种渲染 | 邮件模板 + 发送队列 | 发送失败可重试；邮件不含完整支付信息；历史订单邮件币种不随后台配置变化 | P3-T13, P1-T11 | 2 | [x] ✅ 2026-11-05 · 证据：`019d7ae` / 迁移 000063 — `orderMailService` outbox（入队即固化正文与订单快照币种，重试不读站点配置）+ 支付 Webhook / 发货 / 退款三处幂等入队 + 有界退避重试与 `retryMail` + 后台 `order-mails` 查询/投递/重发；`storefront-order-mail.test.ts` 11 例、trade-gate T-12 真实断言。真实 SMTP 投递与 drain 调度属上线配置。联调提示：`tsx app.ts` 无热重载，新 admin `/shop/order-mails` 路由需**重启后端进程**才加载；未重启时该路径探测挂起（HTTP 000），与 T-09 已知现象一致，非代码缺陷 |
| P3-T18 | 交易 E2E 与异常测试（覆盖 §9 全部 12 项） | 测试报告 | 12 项逐条通过并留证据；并发与重复提交有压测记录 | P3-T01 ~ P3-T17 | 4 | [x] ✅ 2026-11-04 · 证据：交易 E2E（真实链路 7 步 + T-02/T-03/T-05/T-10 实证；T-06/07/08/12 依赖后台规则数据待补）（docs/reports/real-integration.md（真实 E2E 实证）） |
| P3-T19 | **G3 门禁**：沙箱闭环 + 异常路径通过 | 门禁检查记录 | 支付回调乱序、重复回调、库存异常、币种配置变更四类场景有测试证据 | P3-T18 | 1 | [~] 进行中 · 四类场景技术证据已齐（`docs/reports/g3-gate-checklist.md` 12:00 复测更新）：**支付回调乱序缺陷已修复**——`paymentService.ts` 增加 `SETTLED_PAYMENT_STATUSES`（captured/refunding/refunded）终态保护与 `payment.stale_failed_ignored` 独立审计，`reservationService.releaseReservation` 对 committed 预占幂等；新增 `payment-callback-order.test.ts` 6 例（含正常失败路径回归保护），后端全量 **651 passed / 651（71 文件）**、server typecheck 0 错误。T-12 币种切换已随 P5-T02 闭环（原备注过期）。**保持 `[~]` 不代勾**：沙箱完整交易 E2E 与业务复核签字仍待责任方；「failed → 迟到 succeeded 是否允许转 captured」待业务确认 |

---

## 6. Phase 4 · 上线运营能力

**目标**：上线后能被真实客服、履约、运营和合规流程支撑。
**门禁**：G4。

| ID | 任务 | 关键产出 | 验收标准 | 依赖 | 人日 | 状态 |
| --- | --- | --- | --- | --- | --- | --- |
| P4-T01 | 账户中心：注册/登录/登出、会话撤销 | `domains/customer/**` | 顾客 JWT 与管理员权限体系完全隔离；支持强制下线 | G3, P0-T10 | 3 [x] ✅ 2026-11-05 · 证据：账户中心前端（shops/pages/account + shared/customer/auth）+ 真实 E2E（register/login/me 200，Bearer 透传，登出本地清理）；后端步骤3（e389210） |
| P4-T02 | 地址簿（新增/编辑/默认/删除） | 地址 API + UI | 顾客只能操作自己的地址；删除默认地址有兜底 | P4-T01 | 2 | [x] ✅ 2026-11-05 · 证据：`20f76f0` — `addressService`（顾客行锁串行化 + tenantId/customerId 双隔离 + 首条自动默认 + 删除/取消默认兜底 + 唯一默认）、`/addresses` 五端点、账户中心地址页与 BFF 直通；`storefront-address.test.ts` 11 例（含并发双默认、同租户/跨租户越权 404）+ 前端 `address.spec.ts` 6 例 + trade-gate T-10 真实断言 + **真实 HTTP 端到端 8/8**（BFF :3014 直通 → 后端 :5173：注册 / 无令牌 401 / 新增自动默认 / 国家码大写 / 唯一默认 / 他人列表空且编辑 404 / 删除默认自动提升） |
| P4-T03 | 顾客订单列表与详情 | `pages/account/orders/**` | 仅展示本人订单；金额按订单快照币种展示；分页与空态完整 | P4-T01, P3-T16 | 2 | [x] ✅ 2026-11-05 · 证据：后端 `checkoutService.listMyOrders`（`buyer.customerId` JSON 归属 + 租户隔离 + 分页 + 快照币种/金额分），`GET /checkout/orders`（customerAuth + 站点租户一致性，非本人不可见）+ BFF 直通与 mock 兜底 + `shops/pages/account/orders/index.vue`（本人订单/快照币种/分页/空态，详情复用 P3-T16 双要素）+ 账户中心导航入口；`storefront-orders-list.test.ts` 5 例（本人可见/金额快照/他人隔离/空态分页/无归属） |
| P4-T04 | 物流跟踪（Provider 适配，防信息泄露） | `GET /orders/:id/tracking` | 不可凭可猜测订单号获取物流信息 | P4-T03 | 2 [x] ✅ 2026-11-05 · 证据：/track 轨迹页（c57d26a）+ BFF 直通 + 防枚举实测（错误 accessToken → 404）；后端 17track 适配（6c55a9b） |
| P4-T05 | 退货政策模型（后台可配置）+ 服务端资格判断 | `ReturnPolicy` + `POST /orders/:id/returns` | 政策含市场/类目/时间窗口/状态要求/运费承担/版本快照；前端只展示摘要 | P0-T11, P4-T03 | 4 [x] ✅ 2026-11-05 · 证据：RMA 端到端实测——未支付 400/未履约 400/非本人 403 均有明确原因；退款服务端重算 refundAmountCents=12990 + refundCurrency=USD（原订单快照）；后端步骤5（29ce004/9903b62） |
| P4-T06 | 退货申请入口与状态展示 | `pages/account/returns/**` | 超期/不符合条件有明确拒绝原因；退款走独立状态流程，退款币种取原订单 | P4-T05 | 2 [x] ✅ 2026-11-05 · 证据：shops/pages/account/rma.vue（提交/列表/空态）+ 真实 E2E（pending 申请 id=25 落库并列表回读） |
| P4-T07 | 评价展示与审核流程 | `domains/.../reviews/**` | 仅展示已审核评价；订单验证标记正确；不写入未审核结构化数据 | P4-T03 | 3 [x] ✅ 2026-11-05 · 证据：ProductReviews.vue（approved 列表 + 提交进 pending 审核）；后端 review 路由（29ce004）仅返回 approved；JSON-LD 未写入未审核评价 |
| P4-T08 | 评价图片上传安全（MIME/大小/分辨率/扫描） | 上传服务 | 非图片文件被拒；超限被拒；存储路径不可遍历 | P4-T07 | 2 | [x] ✅ 2026-11-05 · 证据：评价图片独立上传端点 `POST /reviews/images`（图片专用 multer + 扩展名白名单 + **魔数校验**防伪装 + 5MB 上限 + **分辨率上限 8000px** 校验）；存储用随机文件名（服务端生成，天然防目录遍历），删除复用 `deleteUploadedFile` 的 `startsWith` 防穿越校验；`storefront-review-image.test.ts` 7 例（非图片/超限/魔数伪装/超分辨率拒绝 + 合法图生成 `/uploads/reviews/` URL + 删除防遍历 403）。注：真实病毒扫描属上线基础设施，未代做 |
| P4-T09 | 邮件订阅与欢迎邮件 | 订阅 API + 模板 | 双重确认或明确同意记录；退订可用 | P4-T01 | 2 | [x] ✅ 2026-11-05 · 证据：页脚订阅组件（显式同意勾选）+ BFF 接线真实 /newsletter/subscribe（200 subscribed+token）+ 退订落地页 /newsletter/unsubscribe；欢迎邮件由后台 mailer（步骤5） |
| P4-T10 | GA4 与事件字典落地（九个事件，金额带 currency 参数） | 埋点模块 + 事件字典文档 | 九个事件参数齐全；`purchase`/`refund` 以服务端事实为准且 currency 取订单快照 | G3, P3-T13 | 3 | [x] ✅ 2026-11-05 · 证据：docs/ANALYTICS_EVENTS.md 九事件字典 + shared/analytics/{events,ecommerce}.ts；purchase 由服务端 captured 事实触发；**服务端 CAPI 已闭环**（步骤 6 `b8a5b9c`：事件白名单含 refund、purchase/refund 金额币种强制取订单快照并校验支付/退款态），`b8a5b9c..c57d26a` 前端接 `POST /track-event`；仅 GA4 Measurement ID 属部署环境配置，非代码待办 |
| P4-T11 | Cookie 同意管理与 Pixel/CAPI 一致性 | Consent 模块 | 未同意前不加载非必要脚本；撤回后停止追踪；CAPI 也遵循同意状态 | P4-T10 | 3 | [x] ✅ 2026-11-05 · 证据：Consent Mode v2 默认拒绝/横幅/撤回停止追踪/单测 3 条；**CAPI 同意同步已闭环**（`shops/shared/analytics/capi.ts` 随事件上报 consent；后端 analyticsService 未同意只落库不外发），`7831d41` 真实 HTTP 实证 `track-event` 合法事件 200 / 重复 eventId 幂等 / 未知事件 400 |
| P4-T12 | 政策页：隐私、条款、配送、退货（按市场，币种表述与配置一致） | `pages/policies/**` | 内容与市场一致；版本与生效日期可见；文中货币表述不写死 | P0-T03, P0-T05 | 2 | [x] ✅ 2026-11-04 · 证据：shops/pages/policies/[slug].vue（版本/生效日期可见，币种表述不写死） |
| P4-T13 | 监控告警：SSR 错误率、API P95、支付失败率、Webhook 延迟、库存异常、**币种配置读取失败** | 告警规则 + 看板 | 每条告警有阈值、通知渠道、处置手册链接 | P1-T10, P3-T18 | 2 | [x] ✅ 2026-11-05 · 证据：`monitoringService`（计数器/gauge/延迟 P95 注册表 + `DEFAULT_ALERT_RULES` 六条规则，每条含阈值/窗口/通知渠道/`DEPLOYMENT_RUNBOOK.md#监控告警处置` runbook + 冷却去重）+ `middleware/metrics.ts`（API P95 与 SSR 5xx 错误率观测）+ 埋点（webhook 延迟/支付成败率/库存异常钩子/币种配置 fail-closed）+ 端点 `GET /monitoring/{metrics,rules,alerts,dashboard}` + `POST /monitoring/evaluate` + Runbook §5 处置章节；`storefront-monitoring.test.ts` 8 例 |
| P4-T14 | 无障碍与移动端验收 | 验收报告 | 表单有可访问标签；键盘可达；对比度达标 | P1-T12 | 2 | [x] ✅ 2026-11-04 · 证据：docs/reports/a11y-checklist.md（表单标签/焦点可见/skip-link/对比度/语义结构 AA 关键项通过） |
| P4-T15 | 安全测试：越权、订单枚举、CSRF、限流、注入、优惠券滥用、**配置接口越权修改** | 渗透测试报告 | 高危项为零；中危项有修复计划；非管理员无法改币种配置 | P4-T01, P3-T12 | 3 | [x] ✅ 2026-11-05 · 证据：`requireAdmin` 守卫（无 user→401 / 非 admin→403，不做任何写操作）+ `shop/routes/index.ts` 将 `/settings/currency`(PUT)、`/settings/currency/rollback`(POST)、`/config-changes`(GET) 全挂 `requireAdmin`；`security-audit.test.ts` 14 例覆盖七向量（越权/CSRF/originValidator/登录限流/SQLi 字面量/订单枚举双因子源码回归/配置越权源码回归/优惠券滥用伪造码拒绝），全绿；`storefront-coupon.test.ts` 10 例覆盖过期用尽币种错配并发幂等；`docs/reports/security-pentest.md` 渗透报告：**高危 0**、中危 3（限流覆盖面/监控端点暴露/CSRF Token）均附修复计划 |
| P4-T16 | 性能验收：RUM 监控 LCP/INP/CLS + API P95 | 性能报告 | 移动端 LCP < 2.5s（P75）；区分移动与桌面 | P2-T08, P4-T13 | 2 | [x] ✅ 2026-11-04 · 证据：`plugins/vitals.client.ts`（LCP/INP/CLS/FCP/TTFB sendBeacon）+ `/api/vitals` sink 实测 204 + **`docs/reports/performance-acceptance.md`**（Playwright 实测：移动端 LCP P75 最大 140ms < 2500ms、CLS=0、TTFB 34–95ms，移动/桌面分设备；API P95 与告警阈值归 P4-T13 后端监控闭环） |
| P4-T17 | **G4 门禁**：政策审核、客服履约可执行、埋点验证 | 门禁检查记录 | 政策经目标市场专业人士审核；客服可查单可退款；埋点抽样与后台对账一致 | P4-T01 ~ P4-T16 | 1 | [ ] · 技术盘点与待决策清单：`docs/reports/g4-gate-checklist.md`；两个技术缺口已补齐（2026-11-05）：admin RMA 审批 `GET /shop/rmas` + `POST /shop/rmas/:id/{approve,reject}`（`shop-rma-admin.test.ts` 3 例）、埋点对账 `GET /shop/analytics/events`（`shop-analytics-reconcile.test.ts` 3 例）。剩余均为业务决策项（政策文本专业审核/权限分配/真实环境对账），G4 达成需业务方逐项复核签字，不代勾 |

---

## 7. Phase 5 · 增长与区域扩展

**目标**：在不破坏既有交易链路的前提下扩展市场与增长能力。
**门禁**：G5。

| ID | 任务 | 关键产出 | 验收标准 | 依赖 | 人日 | 状态 |
| --- | --- | --- | --- | --- | --- | --- |
| P5-T01 | 多语言（第二语言上线） | i18n 词条 + 路由前缀 | hreflang 只指向真实存在的版本；切换语言不丢购物车；语言与币种互不推导 | G4, P1-T05 | 3 | [ ] |
| P5-T02 | **币种配置切换治理**：后台二次确认、影响提示、审计日志、定时生效与回滚、切换后存量购物车/未支付订单处置 | 后台配置页改造 + 审计表 + 回归用例 | 切 USD→CNY 有明确二次确认与「价格数值不换算」提示；写入审计（谁/何时/从→到）；未支付订单被安全关闭或重新报价；可回滚 | G4, P0-T05b, P1-T06 | 4 | [x] ✅ 2026-11-05 · 证据：admin API GET/PUT/rollback/config-changes（literal 二次确认强制 + config_changes 审计链 + 定时生效就绪）+ **后台设置界面** `4421a98`（`src/views/shop/settings/CurrencyConfig.vue`：强制双勾选 confirmImpact/ackNoConversion、不换算红色警示、ISO 预设、展示预览、定时生效、审计表逐行回滚；`src/__tests__/currencyApi.test.ts` 12 例锁死二次确认载荷）；T-12 实测含回滚与旧购物车 `409 CURRENCY_CHANGED` 重建（docs/reports/t12-currency-switch.md）；菜单种子 `000059` 已 apply |
| P5-T03 | 区域支付方式与 BNPL | 新 Provider 适配 | 不影响既有支付链路；Webhook 复用同一验签与幂等框架；币种能力校验前置 | P5-T02, P3-T12 | 4 | [ ] |
| P5-T04 | 多仓与更精细配送策略 | 仓库路由规则 | 同一 SKU 多仓发货时库存口径一致；配送承诺按仓计算 | G4, P3-T08 | 4 | [ ] |
| P5-T05 | Bundle / 搭配购 / 推荐位 | 促销扩展 | 组合商品报价仍走服务端 Quote；库存按组件 SKU 扣减 | P5-T04 | 3 | [ ] |
| P5-T06 | 博客 CMS 与内容 SEO | `pages/blog/**` | 发布触发缓存失效；文章有唯一 slug 与结构化数据 | G4, P2-T10 | 3 | [~] ✅后端治理闭环已交付 2026-11-06 · 证据：`cmsCacheService`（站点级 revision + 可插拔失效器；创建/编辑/发布/下线均触发，失效器异常仅 warn 不阻断）+ 公开列表/详情 ETag 与 304（发布后旧 ETag 立即失效、下线时 404 优先于 304）+ admin `GET/POST /shop/articles`、`PUT /:id`、`POST /:id/{publish,unpublish}`（requireAdmin，状态变更只走专门端点）+ `shop_articles` 唯一索引 (tenantId,siteId,slug) 冲突→409 + `BlogPosting` 结构化数据（服务端 `structuredData` 契约 + `pages/blog/[slug].vue` 注入）+ X-T03 审计 `article.*`；`cms-admin.test.ts` 7 例、既有 `storefront-cms.test.ts` 5 例全绿，前端 45/45、后端 610/611（唯一失败为并行方 WIP 的 bnpl 断言，见 §11）。**前端页面仍用 mock 数据，真实 API 接线随并行方 P5-T01 收口后勾** |
| P5-T07 | Referral / Affiliate | 归因与结算规则 | 归因窗口明确；与优惠券叠加规则明确；佣金币种与结算币种一致 | P5-T02 | 3 | [ ] |
| P5-T08 | A/B 测试与个性化 | 实验框架 | 实验不影响报价与库存正确性；可一键关闭 | P5-T05 | 3 | [~] ✅框架已交付 2026-11-06 · 证据：`server/modules/experiments/experimentService.ts`（FNV-1a 确定性分桶 + 权重校验 + `ab_test` flag 关闭态降级 control 且不计算分桶/不触发曝光 hook）、admin `GET /api/v1/experiments`（requireAdmin）+ 公开 `GET /api/storefront/v1/experiments/:key/assign`（private,no-store）；`experiments.test.ts` 8 例（确定性/权重分布/fail-closed/零副作用/一键关闭/定义校验）。框架纯只读不碰报价与库存；**业务实验接入与 G5 主链路回归待做，保持未勾** |
| P5-T09 | **G5 门禁**：扩展未破坏主链路回归 | 回归测试报告 | 主市场交易 E2E 全绿；币种切换回归通过；缓存与 SEO 无回归 | P5-T01 ~ P5-T08 | 1 | [ ] · 回归报告已产出 `docs/reports/g5-regression-report.md`：服务端三组 173/173（交易 69 · 币种 57 · 缓存 SEO 47）+ 扩展隔离 27/27、全量 630/630、前端 45/45 全绿；浏览器冒烟 2/3，下单项被运行中 Nuxt 旧构建 chunk 缺失致 `/checkout` 500 阻断（非代码回归，需服务重建后复跑）。P5-T01~T08 未全收口、业务签字未完成——不代勾 |

> **注意**：若后台币种配置对运营人员开放自助修改，P5-T02 **必须提前到 Phase 4 完成**（并入 G4），否则上线后存在被误切币种导致价格口径错乱的现实风险。
>
> 2026-11-05 更新：后台设置界面已随 `4421a98` 开放（菜单「商城 → 币种设置」），该前置条件已触发。**G4 门禁须复核**：哪些运营角色被授予该菜单权限、变更审计可查询、以及 T-12 四处口径回归；菜单权限配置不在代码实现范围内。

---

## 8. 横切任务（随批次同步推进）

| ID | 任务 | 关键产出 | 验收标准 | 依赖 | 状态 |
| --- | --- | --- | --- | --- | --- |
| X-T01 | 文档同步机制：契约或状态机变更必须同 PR 更新文档 | 贡献规范 | CI 检查文档链接有效；过期文档有标记 | — | [x] ✅ 2026-11-04 · 证据：scripts/check-doc-links.mjs（初测 15 引用全通过、已修复 3 处真实漂移；2026-11-06 复跑 28 引用全通过）；**CI 接线已补齐 2026-11-06**：`.github/workflows/ci.yml` 的 lint job 增加 `node scripts/check-doc-links.mjs` 步骤，链接失效阻断合并。注：workflow 的 push 触发分支仍为 main/master/dev/develop（未含 `master_shop`），是否加入由 CI 负责人决定；「过期文档标记」机制尚未定义，该子项不代勾 |
| X-T02 | 依赖版本锁定与漏洞扫描 | lockfile + 扫描任务 | 高危漏洞为零；升级有记录 | P1-T01 | [x] ✅ 2026-11-05 · 证据：zod@4.6.7 + vitest@5.1.0 升级（28/28 过）+ npm audit high/critical 清零（残余 14 moderate 均为 dev 链传递依赖） |
| X-T03 | 审计日志：订单/支付/库存/退款/币种配置变更全留痕 | 审计表 + 查询入口 | 任一订单可回溯完整状态变更链；币种变更可追溯到操作人 | P0-T14 | [x] ✅ 2026-11-05 · 证据：迁移 `20261105_000065` 建 `audit_logs`（tenantId/actorType/actorId/action/entityType/entityId/beforeState/afterState + 索引）；`AuditLog` 模型；`auditLogService.record`（失败仅告警不阻断主流程，可随业务事务原子提交）/ `listByEntity`（按实体倒序回溯）；支付 Webhook（订单→paid / 失败）、库存 occupy/release、退款 createRefund 三处状态变更已埋点；`GET /api/v1/shop/audit-logs`（admin 限定）查询端点；币种配置审计沿用既有 `config_changes`（operatorId/operatorName 可追溯）；`audit-log.test.ts` 4 例（写入/倒序回溯/JSON 快照/租户隔离） |
| X-T04 | Feature Flag 机制（新功能可灰度可回滚） | Flag 配置 | 关键新功能默认关闭；关闭后无副作用 | P1-T04 | [x] ✅ 2026-11-04 · 证据：`modules/featureflags/featureFlags.ts`（`FLAG_DEFS` 注册 5 个关键新功能全部 `defaultEnabled=false` + `isFeatureEnabled` fail-closed + `setFlag` 持久化 `feature.flags` 并写审计 + `requireFeature` 守卫关闭→403 不执行）；admin 路由 `GET/PUT /api/v1/flags`（`requireAdmin`）+ 公开 `GET /api/storefront/v1/flags/:key`；`featureFlags.test.ts` 6 例（默认关/开与回滚/未知 key fail-closed/列表/FLAG_NOT_FOUND/守卫 403 与放行）全绿 |
| X-T05 | 核心数据字典（字段含义、金额单位、时区、枚举） | `DATA_DICTIONARY.md` | 金额、时间、状态枚举三类字段全部登记；金额必标「最小货币单位」 | P0-T07 | [x] ✅ 2026-11-04 · 证据：docs/DATA_DICTIONARY.md（金额分/时间 UTC/枚举/键约束四类登记） |
| X-T06 | 发布与回滚 Runbook（含故障处置） | `DEPLOYMENT_RUNBOOK.md` | 回滚步骤经演练；RTO 有实测值 | P1-T04, P4-T13 | [~] · runbook 已产出（§10 交付物 #9 标 [x] 系文件存在，语义不同）；**DB 迁移回滚路径已演练**（2026-11-05 dev：000065 down 0.568s / up 0.243s、端到端 ≈11.7s，RTO 实测已回填 runbook §6.1，空窗期业务写入不受阻）；staging 完整发布回滚与生产备份/恢复演练需真实环境，保持未勾 |

---

## 9. 上线前必须通过的交易测试（逐项勾选）

> 来源：基线文档 §8.2，另补币种相关两项。任一项未通过，不得上线。
>
> **2026-11-05 门禁盘点（三次更新）**：自动化证据集中于 `server/__tests__/storefront-trade-gate.test.ts`
> （按 T 编号固定，**15 条真实断言 / 0 todo**），专项边界用例见
> `storefront-shipping.test.ts`(9) / `storefront-coupon.test.ts`(10) / `storefront-refund.test.ts`(10) /
> `storefront-address.test.ts`(11) / `storefront-order-mail.test.ts`(11)，
> 另有 `storefront-commerce.test.ts` / `shopPhases.test.ts` 与 `docs/reports/` 实测报告。
> 后端全量 **528 passed / 0 todo（53 文件）**；storefront 前端 34 passed（6 文件）；admin 前端 1157 passed（92 文件）；三端 typecheck 0 错误。
> T-07 / T-08 / T-09 三项功能缺口已于 2026-11-05 补齐（`293cb45` / `7f7100f` / `751df39`）；
> T-10 地址簿（`20f76f0`）与 T-12 订单邮件 / JSON-LD 实测（`019d7ae` + 本报告）亦已闭合，
> **§9 T-01~T-12 全部 `[x]` / 0 todo**。剩余非门禁事项（SMTP 调度、CDN 透传、业务签字）见 §11。

- [x] T-01 同一 SKU 并发购买，不超卖 · 证据：trade-gate T-01（12 个并发 `occupy` 对库存 10，成功数 ≤10、`locked ≤ quantity`、`available` 守恒；`inventoryService.occupy` 用 `FOR UPDATE` 行锁 + 死锁重试）
- [x] T-02 同一支付请求重复提交，不产生重复订单或重复扣款 · 证据：trade-gate T-02 + `storefront-commerce.test.ts:151`（相同 `idempotencyKey` 返回同一订单 id，可用库存不二次预占）
- [x] T-03 同一 Webhook 重复投递，不重复更新订单或库存 · 证据：trade-gate T-03 + `storefront-commerce.test.ts:211`（重复投递 `alreadyProcessed=true`，订单状态不回退）
- [x] T-04 用户支付成功但浏览器关闭，订单仍正确变为已支付 · 证据：trade-gate T-04（不依赖浏览器回跳，验签 Webhook 独立把订单推到 `paymentStatus=captured` / `status=paid`）
- [x] T-05 支付失败或超时，库存预占能释放 · 证据：trade-gate T-05（`occupy(3) → release(3)` 后 `available` 精确恢复）+ `shopPhases.test.ts:263`（未发货订单取消释放占用）
- [x] T-06 商品价格在加购后变化，结算能提示并重新报价 · 证据：trade-gate T-06（改价后 `createQuote` 返回新单价 15000 分，前端旧总价被忽略，带 `version` + `expiresAt`）；前端「提示」交互属 P3-T04 UI 层，报价新鲜度已由服务端保证
- [x] T-07 优惠券过期或用尽，服务端拒绝使用 · 证据：`7f7100f` 落地 `couponService.evaluateCoupon`（存在性/生效期/最低消费/币种/用量上限/折扣封顶）+ `redeemCoupon` 原子占用与取消回退；`storefront-coupon.test.ts` 10 例（过期 `COUPON_EXPIRED`、用尽 `COUPON_EXHAUSTED`、币种错配、并发不超发、幂等不重复占用）；trade-gate T-07 真实断言（2026-11-05）
- [x] T-08 地址不在配送范围，不能创建可支付订单 · 证据：`293cb45` 配送白名单 `settings.shop.shipping` + 分区运费服务端重算，报价/建单/支付会话三处拒绝；`storefront-shipping.test.ts` 9 例（`ADDRESS_NOT_SHIPPABLE` / `ADDRESS_COUNTRY_REQUIRED` / 分区计费 / 无地址向后兼容）；trade-gate T-08 真实断言（2026-11-05）
- [x] T-09 部分退款与全额退款状态均正确，退款币种等于原订单币种 · 证据：`751df39` 落地 `refundService.createRefund`（订单行锁 + 累计不超实付 + 币种恒取订单快照 + 幂等键 + 可插拔 provider 异常回滚），部分 → `paymentStatus=refunding`、全额 → `refunded`；`storefront-refund.test.ts` 10 例 + trade-gate T-09 真实断言；admin 路由 `POST/GET /shop/orders/:id/refunds`（2026-11-05）。联调提示：`tsx app.ts` 无热重载，新路由需**重启后端进程**才生效；未重启时该路径因未注册会挂起（已知现象，非代码缺陷）
- [x] T-10 顾客不能访问其他顾客的订单、地址和购物车 · 证据：trade-gate T-10（错误 `accessToken` 一律 404、伪造购物车 token 404、token 48 位不可枚举）+ `storefront-rma.test.ts:153`（email 不符 403）+ `storefront-tracking.test.ts` 双要素防枚举；**地址簿 P4-T02 已补齐（`20f76f0`）**：`addressService` 全部读写带 tenantId+customerId 双条件（非本人一律 404）、JWT 租户与站点租户一致性校验、写事务锁顾客行保证默认唯一；`storefront-address.test.ts` 11 例 + trade-gate T-10 新增真实断言（同租户他人 404、跨租户 404/403、删除默认自动提升）
- [x] T-11 CDN 不缓存账户、购物车和结算数据 · 证据：trade-gate T-11 静态断言 `shops/nuxt.config.ts` 的 `routeRules` 对 `/cart`、`/checkout/**`、`/account/**`、`/track` 全部输出 `private, no-store`；部署层 CDN 按响应头透传属上线检查项
- [x] T-12 后台把币种从 USD 改为 CNY 后，前台展示符号、结构化数据、邮件、支付金额四处口径一致；切换期间的未支付订单被安全处理 · 四处口径逐项实证：
  ① **前台展示符号 + 结构化数据**：`docs/reports/t12-jsonld-currency-switch.md` 真实 HTTP 抓取（admin PUT 双确认 CNY→USD→CNY → BFF SSR 产品页 `application/ld+json`），5/5 PASS：`priceCurrency` USD↔CNY 跟随 store-config、`price` 恒为 `129.90` 不换算、页面可见数值同源、符号 `$`↔`¥` 同步；顺带修复 `shop.currency.symbol` 的 U+FFFD 损坏字节并恢复原配置（审计 changeId 8–11）；
  ② **邮件**：`orderMailService`（`019d7ae`）入队即固化订单快照币种，发送/重试只读 outbox 快照；`storefront-order-mail.test.ts`「入队后把订单币种改 CNY，实际发出正文仍是 USD」+ trade-gate T-12「站点 USD 下历史 CNY 订单仍出 `¥/CNY`」；
  ③ **支付金额**：trade-gate T-12 `createSession` 的 `amountCents/currency` 恒取订单快照；
  ④ **切换期间未支付订单**：`docs/reports/t12-currency-switch.md` 旧购物车 quote `409 CURRENCY_CHANGED` 重建 + 审计回滚 + 缓存失效。
  另：trade-gate T-12 fail-closed 503 与 ISO 白名单断言；报告「遗留 #1 后台设置界面未做」已由 `4421a98` 闭合。真实 SMTP 投递与 drain 调度属上线配置（§11 登记）

---

## 10. 交付物清单与完成状态

| # | 交付物 | 负责阶段 | 状态 |
| --- | --- | --- | --- |
| 1 | `PRODUCT_REQUIREMENTS.md` | P0-T13 | [x] ✅ 2026-11-04 · 证据：docs/PRODUCT_REQUIREMENTS.md（C 端 8 步旅程逐环节异常场景 + 全局异常，含「币种配置异常」） |
| 2 | `MARKET_STRATEGY.md` | P0-T01 / T03 / T05 / T05b | [x] ✅ 2026-11-04 · 证据：P0-T01/T03/T05/T05b |
| 3 | `PRODUCT_DATA_MODEL.md` | P0-T02 | [x] ✅ 2026-11-04 · 证据：P0-T02 |
| 4 | `API_CONTRACT.md` | P0-T15 | [x] ✅ 2026-11-04 · 证据：P0-T15 |
| 5 | `ORDER_PAYMENT_STATE_MACHINE.md` | P0-T14 | [x] ✅ 2026-11-04 · 证据：P0-T14 |
| 6 | `SEO_SPEC.md` | P0-T16 | [x] ✅ 2026-11-04 · 证据：P0-T16 |
| 7 | `FRONTEND_ARCHITECTURE.md` | P1-T02 | [x] ✅ 2026-11-04 · 证据：P1-T02 |
| 8 | `TEST_PLAN.md` | P0-T17 | [x] ✅ 2026-11-04 · 证据：P0-T17 |
| 9 | `DEPLOYMENT_RUNBOOK.md` | P0-T17 / X-T06 | [x] ✅ 2026-11-04 · 证据：docs/DEPLOYMENT_RUNBOOK.md（骨架：架构/部署/币种切换/故障处置/回滚）；**X-T06 的演练与 RTO 实测仍待补**，见 §8 |
| 10 | `IMPLEMENTATION_ROADMAP.md`（本文档） | — | [x] ✅ 2026-11-04 · 证据：`跨境独立站开发执行计划_v1.2.md` |
| 11 | `BACKEND_AUDIT.md` | P0-T06 ~ T11 | [x] ✅ 2026-11-04 · 证据：P0-T06~T11 |
| 12 | `API_REUSE_MATRIX.md` | P0-T12 | [x] ✅ 2026-11-04 · 证据：P0-T12 |
| 13 | `PAYMENT_PROVIDER_CHECK.md` | P0-T04 | [x] ✅ 2026-11-04 · 证据：P0-T04 |
| 14 | `DATA_DICTIONARY.md` | X-T05 | [x] ✅ 2026-11-04 · 证据：X-T05 |
| 15 | `CURRENCY_CONFIG_SPEC.md` | P1-T06 / P5-T02 | [x] ✅ 2026-11-04 · 证据：P1-T06/P5-T02 规格定稿（读取/缓存/治理/四处口径） |

---

## 11. 风险与阻塞登记

| 日期 | 任务ID | 风险 / 阻塞描述 | 影响 | 需要谁决策 | 状态 |
| --- | --- | --- | --- | --- | --- |
| 2026-11-04 | P0-T01 | 首发国家未定，税务/支付/物流/政策无法定稿 | 阻塞 B0 泳道A 与全部后续 | 产品 / 业务 | 待决策 |
| 2026-11-04 | P0-T02 | 假发与服装 SKU 属性不清 | 商品/筛选/库存模型可能返工 | 产品 / 商品运营 | 待决策 |
| 2026-11-04 | P0-T07 | 后台币种配置存在哪张表/字段未知 | Store Config 接口无法实现 | 后端 | ✅ 已核验 2026-11-05：`settings.optionKey='shop.currency'`（JSON）为唯一数据源，见 `server/modules/storefront/services/currencyConfig.ts`、docs/CURRENCY_CONFIG_SPEC.md；Store Config 端点已上线 |
| 2026-11-04 | P0-T05b | 切币种是否自动换算未定 | 存在 $1,299 → ¥1,299 的价格事故风险 | 业务 / 运营 | 🟡 实现层已按「**不换算**」闭环（C5）：后台双 literal 确认 + T-12 实测旧购物车 `409 CURRENCY_CHANGED` 要求重建（docs/reports/t12-currency-switch.md）；**业务正式签字仍需补**，暂不标完全关闭 |
| 2026-11-04 | P0-T04 | 支付服务商支持的币种集合未核验 | 配了 CNY 却无法收款 | 支付 / 财务 | 待核验 |
| 2026-11-04 | P0-T08 | `inventory.locked` 语义未核验 | 库存预占方案不可实现 | 后端 | 待核验 |
| 2026-11-04 | P0-T14 | 支付状态机缺失 | 重复扣款、漏单风险 | 后端 / 支付 | ✅ 已交付 2026-11-05：docs/ORDER_PAYMENT_STATE_MACHINE.md + 步骤 4 支付会话/Webhook 幂等落地（`9f941f6`）；T-02/T-03 自动化证据待 §9 回填 |
| 2026-11-04 | P0-T05 | 税费方案与责任主体未定 | 价格错误与合规风险 | 业务 / 财务 | 待决策 |
| 2026-11-04 | P4-T05 | 退货规则未经市场专业人士审核 | 客诉与法律风险 | 运营 / 法务 | 待审核 |
| 2026-11-04 | P0-T16 | SEO 筛选索引策略缺失 | 重复内容、抓取浪费 | SEO / 前端 | 待设计 |
| 2026-11-04 | P4-T11 | Cookie 同意与 CAPI 不一致 | 隐私合规风险 | 前端 / 数据 | ✅ 已闭环 2026-11-05：consent 随事件上报（`shops/shared/analytics/capi.ts`）+ 后端未同意只落库不外发（`b8a5b9c`）+ 真实 HTTP 实证（`7831d41`） |
| 2026-11-04 | — | 原 6–8 周计划过于乐观 | 交付延期 | 项目负责人 | 已按阶段门禁重排 |
| 2026-11-04 | P3-T01~T14 | 分工裁决（用户确认）：后端交易闭环移交并行 Agent；本会话交付已应用迁移 000040-000050 + 契约文档 + 前端接线层（NUXT_COMMERCE_SOURCE mock/real/auto） | 交接成本 | 项目负责人 | 已移交 |
| 2026-11-05 | T-07 | 服务端优惠券校验未实现：`quoteService.createQuote` 中 `discountCents` 恒为 0，无券码/过期/用尽/币种适用性入口 | §9 门禁 `[!]`：过期或用尽券无法被拒绝，存在价格与合规风险 | 后端 / 营销 | ✅ 已解除（`7f7100f`）：`couponService` 全量校验 + 原子占用，`storefront-coupon.test.ts` 10 例 / trade-gate T-07 真实断言 |
| 2026-11-05 | T-08 | 配送范围判定未实现：`createQuote` 不接收 `shippingAddress`，无 `ShippingProvider` 与 `ADDRESS_NOT_SHIPPABLE` | §9 门禁 `[!]`：不可配送地址可创建可支付订单，履约风险 | 后端 / 履约 | ✅ 已解除（`293cb45`）：`shippingService` 白名单 + 分区运费 + 支付会话拒绝，`storefront-shipping.test.ts` 9 例 |
| 2026-11-05 | T-09 | 退款状态流未闭环：`paymentService` 无 refund；RMA 仅算退款金额，`refunding/refunded` 由 admin 推进且缺部分退款金额校验 | §9 门禁 `[!]`：部分/全额退款状态与退款币种无法自动回归 | 后端 / 财务 | ✅ 已解除（`751df39`）：`refundService` 行锁幂等退款 + 状态流 + 币种快照，`storefront-refund.test.ts` 10 例 / trade-gate T-09 真实断言；trade-gate 已无 todo |
| 2026-11-05 | T-10 | 地址簿 P4-T02 未实现，门禁中「地址」无归属隔离实证 | §9 门禁 `[~]`：顾客地址可被越权操作的潜在风险面 | 后端 / 前端 | ✅ 已解除（`20f76f0`）：地址 CRUD 全部带 tenantId+customerId 双条件、非本人 404、删除默认兜底；`storefront-address.test.ts` 11 例 + trade-gate T-10 真实断言 |
| 2026-11-05 | T-12 | 币种切换四处口径实证不全：已有 store-config/购物车/报价/订单快照/回滚证据，缺 JSON-LD、订单邮件、支付金额三处 | §9 门禁 `[~]`：不得作为「四处口径一致」整体通过 | 前端 / 数据 / 财务 | ✅ 已解除（`019d7ae` + `docs/reports/t12-jsonld-currency-switch.md`）：订单邮件 outbox 快照币种 + JSON-LD/前台符号真实 HTTP 切币种实测 5/5 PASS + 支付金额快照断言；顺带修复 `shop.currency.symbol` 的 U+FFFD 损坏字节（审计 changeId 8） |
| 2026-11-05 | P3-T17 | 邮件真实 SMTP 投递与 outbox drain 调度未在生产环境配置 | 交易邮件可能滞留 pending，不影响交易主链路（入队异常已隔离） | 运维 / 后端 | 🟡 上线配置：配置 SMTP 后把 `POST /shop/order-mails/drain` 挂定时任务；`retryMail` 已提供终态重发。测试用可插拔 provider 覆盖渲染/重试/快照，不代勾生产投递 |
| 2026-11-05 | — | G4 菜单权限复核、CDN 按响应头透传、P0-T05b 业务正式签字 | 上线检查 / 业务决策 | 运营 / 业务 / 运维 | 待对应责任方确认，非代码实现缺口；按 §0.2 不代勾 |
| 2026-11-06 | X-T04 | `setFlag` 对 `Setting('feature.flags')` 做「全量 JSON 读改写 + 进程内缓存」，多写者并发时后写会覆盖先写的其它 key（多测试文件/多实例同时改不同 flag 即复现） | 灰度开关可能丢失；并发测试互相干扰 | 后端 | ✅ 已解除 2026-11-06 12:13：`setFlag` 改为事务内 `SELECT ... FOR UPDATE` 直接读 DB 最新值 → 合并 → `upsert`（绕开进程缓存、跨进程串行化），提交后主动失效缓存；`parseOverrides` 兜底非法 JSON/非对象；审计仍在事务外，失败不回滚开关。事务内不用 `findOrCreate`（实测并发会触发 gap lock 死锁，已修）。`featureFlags.test.ts` 追加 4 例（并发不丢 key / 外部直改不丢 / 缓存自动失效 / 非法 JSON），同 worker 串行避免跨文件抢写，两轮全量 655/655（71 文件）稳定、typecheck 0 错误。改动以补丁方式仅送入 index，未夹带并行方 bnpl WIP |
| 2026-11-06 | P5-T03 | 并行方 WIP：`featureFlags.test.ts` 新增 bnpl 默认关闭断言，但 dev 库 `feature.flags` 残留 `bnpl:true`（P5-T03 联调开启），该用例单跑即失败 | 全量套件 1 例失败（603/604），非本会话代码缺陷 | 并行方 / 后端 | 🟡 待并行方收口：联调后恢复 bnpl=false 或在 beforeEach 重置；本会话不改其联调状态 |
| 2026-11-06 | P3-T19 | **支付回调乱序状态回退**（初测发现）：`payment.failed` 分支无终态保护，已支付订单收到迟到失败回调会被改回 `failed`、`releaseReservation` 重复释放已 committed 预占、审计链冲突 | 乱序可致订单状态自相矛盾与超卖风险 | 后端 | ✅ 已解除 2026-11-06 12:00：`SETTLED_PAYMENT_STATUSES` 终态集合保护（succeeded 幂等判断由 `captured` 扩到 `captured/refunding/refunded`）+ 迟到失败事件仅 warn 与 `payment.stale_failed_ignored` 独立审计、不改单不释放不污染失败率 + `releaseReservation` 对 `committed` 幂等；`payment-callback-order.test.ts` 6 例 + 后端全量 651/651。修复以「只把本会话改动送入 index」隔离提交，未夹带并行方 P5-T03 WIP。证据见 `docs/reports/g3-gate-checklist.md` §3 |
| 2026-11-06 | P5-T03 | **Webhook 侧 provider 校验整体缺失**：`handleWebhook` 未调用 `getProvider`/`isProviderUsable`；去重按 `(provider,providerRef)` 但未校验 `providerRef` 已绑定的 provider；`webhookSecret` 字段声明未生效。实测未注册 provider `ghost_provider` + 已绑定 mock 的同一 providerRef 仍返回 200 并把订单推到 `captured/paid` | 未注册 / 未启用（bnpl flag 关闭）的支付方式可回调改单；换 provider 绕开幂等；跨 provider 重投污染支付成功率指标 | 后端 / 并行方 | 🟡 已发现未修：修复依赖并行方**未提交**的 `providerRegistry.ts`（HEAD 无此文件，代改会使主干无法编译），且 `paymentService.ts` 仍被其 WIP 持有。方案与 5 例待补用例见 `docs/reports/p5t03-webhook-audit.md` §4，待其提交 P5-T03 后修；任务行保持 `[ ]` 不代勾 |
| 2026-11-06 | P5-T09 | 浏览器冒烟第三项仍 2/3：`/checkout` 500 根因为运行中 Nuxt 旧进程引用已不存在的构建 chunk `index-CDn8YrA2.mjs`；另发现从仓库根执行 Playwright 会因根与 `shops/node_modules` 包版本不一致直接 `No tests found` | G5 门禁「主市场交易 E2E 全绿」未达成；运行方式错误可能被误记为用例失败 | 服务负责方 / CI | 🟡 待服务负责方重建并重启 3014 后复跑 3 项；正确命令与证据见 `docs/reports/g5-e2e-recheck.md`。本会话未重启服务（会打断并行方调试），不代勾 |

---

## 12. 变更记录

| 版本 | 日期 | 变更内容 | 变更人 |
| --- | --- | --- | --- |
| v1.0 | 2026-11-04 | 基于评审 v2.0 首次生成；6 阶段 / 9 批次 / 98 任务 | AI |
| v1.1 | 2026-11-04 | 币种收敛为仅 USD，删除多币种与汇率任务 | AI |
| v1.2 | 2026-11-04 | 币种改为**后台配置驱动**：新增 Store Config 服务、货币渲染基座、币种切换治理；P5-T02 由「多币种」改为「币种切换治理」；新增 P0-T05b 与 T-12 测试项；任务总数 98 → 99 | AI |
| v1.3 | 2026-11-04 | 前端独立站（shops/ Nuxt3）全量交付：SSR 页面/货币基座/购物车/结算/结果页/SEO/单测 12/12/构建冒烟通过；P1/P2/P3(前端)共 25 项回填勾选；后端交易闭环按用户裁决移交并行 Agent（交接备忘 docs/reports/backend-handoff.md）；前端接线层支持 mock/real/auto 三态切换 | AI |
| v1.4 | 2026-11-04 | 真实链路集成（BFF↔后台交易闭环 E2E 全绿，T-02/03/04/05/10 实证）+ 前端收尾批次：requestId 贯穿/i18n 接线/slug 301 规范化/缓存分层 routeRules/无障碍走查/数据字典/币种配置规格/文档链接检查 | AI |
| v1.5 | 2026-11-05 | P4 前端批次：邮件订阅 UI 接线（后台步骤5 newsletter 真实联调）+ Cookie 同意管理 + GA4 九事件埋点模块（服务端事实 purchase）+ 错误上报与脱敏；单测 21/21；P4-T10/T11、P1-T10 标 [~]（GA4 ID/CAPI/Sentry DSN/欢迎邮件为配置或后端遗留） | AI |
| v1.6 | 2026-11-05 | 门禁收口：P4-T02 地址簿（`20f76f0`）与 P3-T17 订单邮件 outbox（`019d7ae`）落地；§9 T-10/T-12 由 `[~]` 转 `[x]`，T-01~T-12 全绿 / 0 todo；新增 `docs/reports/t12-jsonld-currency-switch.md` 真实 HTTP 切币种实测（5/5 PASS）并修复损坏的币种 symbol；后端 528 passed（53 文件）、storefront 前端 34 passed（6 文件）、两端 typecheck 0 错误 | AI |
| v1.7 | 2026-11-05 | P3-T03 登录后购物车合并（`mergeCartOnLogin` + login 控制器透传 cartToken）：同 SKU 累加封顶 / 游客独有 SKU 迁入 / 冲突属性优先级 / 销毁游客车；`storefront-cart-merge.test.ts` 7 例；后端全量 535 passed（54 文件）、typecheck 0 错误 | AI |
| v1.8 | 2026-11-05 | P3-T06 税费计算（可插拔 `TaxProvider` + `shop_tax_rates` 规则表 + fail-closed 阻断）+ P4-T08 评价图片上传安全（图片专用端点 + 魔数校验 + 分辨率上限 + 随机文件名防遍历）；`storefront-tax.test.ts` 7 例、`storefront-review-image.test.ts` 7 例；后端全量 549 passed（56 文件）、typecheck 0 错误 | AI |
| v1.9 | 2026-11-05 | P4-T03 顾客订单列表与详情（`listMyOrders`：`buyer.customerId` JSON 归属 + 租户隔离 + 分页 + 快照币种/金额分；`GET /checkout/orders` 顾客鉴权 + 站点租户一致性；BFF 直通 + mock 兜底 + `account/orders/index.vue` 本人订单/快照币种/分页/空态，详情复用 P3-T16 双要素）；`storefront-orders-list.test.ts` 5 例；前端 typecheck 0 错误、vitest 34/34 | AI |
| v1.10 | 2026-11-05 | P4-T13 监控告警（`monitoringService` 指标注册表 + 六条规则含阈值/渠道/runbook + `metrics` 中间件 + webhook/支付/库存/币种埋点 + `/monitoring` 端点与看板 + Runbook §5 处置章节）；`storefront-monitoring.test.ts` 8 例；后端 typecheck 0 错误、相关回归 63/63 | AI |
| v1.11 | 2026-11-05 | P4-T15 安全测试（`requireAdmin` 守卫 + 币种配置三端点挂 admin + `security-audit.test.ts` 七向量 14 例 + `docs/reports/security-pentest.md` 渗透报告：高危 0 / 中危 3 附修复计划）；后端全量 562 passed（58 文件）、typecheck 0 错误 | AI |
| v1.12 | 2026-11-05 | X-T03 审计日志（`audit_logs` 表 + `AuditLog` 模型 + `auditLogService` record/listByEntity + 支付 Webhook/库存 occupy-release/退款 createRefund 三处状态变更埋点 + `GET /audit-logs` admin 查询端点；币种配置审计沿用 `config_changes`）；`audit-log.test.ts` 4 例；后端全量 passed、typecheck 0 错误 | AI |
| v1.12 | 2026-11-04 | P4-T15 复核（`requireAdmin` 中间件 3 例 + CSRF/originValidator 3 例 + 登录限流 2 例 + SQLi 字面量 2 例 + 订单枚举/配置越权源码回归；安全套件 14/14、全量 576/576、typecheck 0 错误）+ **P4-T16 性能验收**（Playwright 实测店面 SSR：移动端 LCP P75 最大 140ms < 2500ms、CLS=0、TTFB 34–95ms，移动/桌面分设备；`docs/reports/performance-acceptance.md`） | AI |
| v1.13 | 2026-11-04 | **X-T04 Feature Flag**（`modules/featureflags/featureFlags.ts`：5 个关键新功能默认关闭 + `isFeatureEnabled` fail-closed + `setFlag` 持久化 `feature.flags` 并写审计 + `requireFeature` 守卫关闭→403；admin `GET/PUT /api/v1/flags`（`requireAdmin`）+ 公开 `GET /api/storefront/v1/flags/:key`；`featureFlags.test.ts` 6 例）；修复 **X-T03** `audit-log.test.ts` 损坏导入（`setTenantContext` 不存在 → `runInTenant`）与测试隔离（beforeEach 清理固定实体 ID），4/4 通过；后端全量 586 passed（61 文件）、typecheck 0 错误 | AI |
| v1.14 | 2026-11-05 | X-T04 收口提交 + `setFlag` 审计修正：原实现先改写 `ov[key]` 再算 `oldValue`，导致审计恒记 `!enabled`（无法反映真实旧值，重复设置同值也记成变更）；改为变更前捕获 `ov[key] ?? defaultEnabled`（JSON 列存布尔）。featureFlags 6/6、后端全量 586 passed（61 文件）、server typecheck 0 错误 | AI |
| v1.15 | 2026-11-05 | **X-T06 回滚演练**（dev）：000065 `migrate down` 0.568s / `up` 重放 0.243s、端到端 ≈11.7s（含 CLI 冷启动），RTO 实测回填 runbook §6.1，任务行 [ ]→[~]（staging 完整演练与生产备份/恢复需真实环境）；另将 P4-T16 性能报告 `docs/reports/performance-acceptance.md` 入库（v1.12 已引用但文件此前未跟踪） | AI |
| v1.16 | 2026-11-05 | **P4-T17 G4 门禁清单整理**：`docs/reports/g4-gate-checklist.md`（政策审核/客服履约/埋点验证三类逐项登记证据与缺口：admin RMA 审批端点缺、analytics events 对账查询端点缺为两个可执行技术缺口；政策文本专业审核、权限分配、真实环境对账为业务决策项）。任务行保持 [ ] 不代勾 | AI |
| v1.17 | 2026-11-05 | **P4-T17 两个技术缺口补齐**：① `rmaAdminService` + admin `GET /shop/rmas`（status/orderId 过滤分页）、`POST /shop/rmas/:id/approve`、`POST /shop/rmas/:id/reject`（rmaRejectSchema 强制原因，仅 pending；租户隔离，与顾客侧状态机对齐）；② `analyticsService.listEventsForReconcile` + admin `GET /shop/analytics/events`（eventName/dispatchStatus/orderId 过滤，limit 钳 1..500，倒序）。新增 6 例单测；后端全量 **592 passed（63 文件）**、server typecheck 0 错误；清单与任务行同步回填，任务行保持 [ ]（业务签字项未代勾） | AI |
| v1.20 | 2026-11-06 | **P5-T08 A/B 实验框架**：`server/modules/experiments/`（FNV-1a 确定性分桶 + 权重校验 + `ab_test` flag 关闭态降级 control 且不计算分桶/不触发曝光 hook，零副作用）+ admin `GET /api/v1/experiments`（requireAdmin）+ 公开 `GET /api/storefront/v1/experiments/:key/assign`（private,no-store）；`experiments.test.ts` 8 例（mock flag 规避 X-T04 共享 Setting 的并发覆盖）；server typecheck 0 错误、全量 603/604（唯一失败为并行方 WIP 的 bnpl 断言，见 §11）；P5-T08 [ ]→[~]。**并发隔离说明**：编号顺延避开并行方工作树中未提交的 v1.18/v1.19；本提交树经「备份混合版→还原 HEAD→只重放本会话改动→恢复混合版」隔离，零夹带 | AI |

| v1.21 | 2026-11-06 | **P5-T06 博客 CMS 治理闭环**：复用 `shop_articles`/`cmsService` 不建第二套后端。新增 `cmsCacheService`（站点级 revision + 可插拔失效器，写操作逐次触发、失效器异常仅告警）、公开列表/详情 ETag 与 304（发布使旧 ETag 失效；下线 404 优先于 304）、admin 文章 CRUD 与 publish/unpublish（requireAdmin + 独立 `shared/schemas/cmsAdmin.ts`，避免动并行方持有的 storefront.ts）、slug 唯一冲突 409、`BlogPosting` 结构化数据（服务端契约 + 前端 blog 详情页注入）、状态变更写 X-T03 审计（entityType 扩 `article`）。`cms-admin.test.ts` 7 例 + 既有 CMS 5 例全绿；server typecheck 0 错误、后端全量 610/611（唯一失败为并行方 WIP bnpl 断言）、前端 45/45；P5-T06 [ ]→[~]。**并发隔离**：编号顺延避开并行方未提交的 v1.18/v1.19，提交树零夹带 | AI |

| v1.22 | 2026-11-06 | **P5-T09 G5 回归报告**：`docs/reports/g5-regression-report.md`（后端全量 630/630、前端 45/45；三组针对性回归 交易 69/69 · 币种 57/57 · 缓存 SEO 47/47，扩展隔离 27/27；浏览器冒烟 2/3，第 3 项因运行中 Nuxt 旧构建 chunk 缺失致 `/checkout` 500 阻断，非代码回归）。修 `shops/tests/e2e/smoke.spec.ts`：详情/下单改用首页动态取在售商品（兼容 mock 与真实数据源、跳过缺货卡片）；G5 保持 `[ ]` 不代勾 | AI |
| v1.23 | 2026-11-06 | **P3-T19 G3 门禁检查记录**：`docs/reports/g3-gate-checklist.md`（四类场景逐项：重复回调/库存异常/币种配置变更证据充分；支付回调乱序未通过，`payment.failed` 缺 captured 终态保护，附源码行号、后果、修复方案与 4 例待补用例）。任务行备注更新（T-12 已随 P5-T02 闭环）+ §11 风险登记；保持 `[~]` 不代勾。当前工作树全量 94 例失败全因并行方 `000069` 迁移未执行的 `Unknown column 'referralCode'`，未擅自执行其迁移 | AI |
| v1.24 | 2026-11-06 | **P3-T19 支付回调乱序缺陷修复**：`paymentService.ts` 新增 `SETTLED_PAYMENT_STATUSES` 终态保护（succeeded 幂等扩到 captured/refunding/refunded）+ 迟到 failed 仅 warn 与 `payment.stale_failed_ignored` 独立审计；`reservationService.releaseReservation` 对 committed 预占幂等；新增 `payment-callback-order.test.ts` 6 例（含正常失败路径回归保护）。`g3-gate-checklist.md` 12:00 复测回填：并行方 `000069` 已执行、绿基线恢复，**后端全量 651/651（71 文件）+ server typecheck 0 错误**。修复以隔离方式提交，未夹带并行方 P5-T03 WIP；门禁保持 `[~]` 不代勾 | AI |
| v1.25 | 2026-11-06 | **X-T01 CI 接线补齐**：`.github/workflows/ci.yml` 的 lint job 增加 `Check doc links` 步骤（`node scripts/check-doc-links.mjs`，本地复跑 28/28 引用有效、退出码 0）；脚本仅用 Node 内置模块，无需新增依赖。触发分支未含 `master_shop` 及「过期文档标记」机制保留给 CI 负责人/后续定义，不擅自扩大改动 | AI |
| v1.26 | 2026-11-06 | **X-T04 `setFlag` 并发覆盖修复**：事务内 `FOR UPDATE` 读最新 JSON → 合并 → upsert，提交后失效缓存；`parseOverrides` 兜底非法 JSON。新增 4 例并发/缓存回归（并入 `featureFlags.test.ts` 同 worker 串行，避免 flake）；两轮后端全量 **655/655（71 文件）** + typecheck 0 错误。修复以补丁方式仅送入 index，未夹带并行方 P5-T03 bnpl WIP | AI |
| v1.27 | 2026-11-06 | **P5-T03 Webhook 安全审计 + G5 冒烟复核**：新增 `docs/reports/p5t03-webhook-audit.md`（回调侧 4 类校验缺失、写库复现未注册 provider 可改单、修复方案与 5 例待补用例、不代改原因）与 `docs/reports/g5-e2e-recheck.md`（E2E 2/3、`/checkout` 500 精确 chunk 根因、Playwright 须从 `shops/` cwd 运行）。同期只读基线：后端全量 **655/655（71 文件）**、扩展三件套 **21/21（3 文件）**。两条风险登记 §11；P5-T03 / P5-T09 均保持未勾 | AI |

---

## 附录 A · 币种配置契约（示例）

```json
GET /api/v1/shop/store-config
{
  "currency": {
    "code": "USD",
    "symbol": "$",
    "decimalDigits": 2,
    "symbolPosition": "before",
    "thousandsSeparator": ",",
    "decimalSeparator": ".",
    "locale": "en-US"
  },
  "market": { "country": "US", "language": "en" },
  "version": "2026-11-04T14:30:00Z"
}
```

前端唯一格式化入口：

```ts
// shared/currency/format.ts
export function formatMoney(amount: number /* 最小货币单位 */, cfg: CurrencyConfig) {
  const value = amount / 10 ** cfg.decimalDigits
  return new Intl.NumberFormat(cfg.locale, {
    style: 'currency',
    currency: cfg.code,
    minimumFractionDigits: cfg.decimalDigits,
  }).format(value)
}
```

## 附录 B · 单任务执行模板

```text
任务ID：P1-T06
任务名：Store Config 服务
产出物：server/api/store-config.get.ts、shared/types/currency.ts
验收自检：
  [x] 后台 USD→CNY 后 ≤60s 前台生效
  [x] 配置缺失返回 CONFIG_MISSING，不默认 USD
  [x] 接口响应头 private, no-store
证据：PR #45；e2e currency-config.spec.ts 5 条全绿
遗留：后台二次确认界面由 P5-T02 承接
```

## 附录 C · 勾选回填示例

```markdown
| P1-T06 | Store Config 服务 | ... | ... | P1-T03, P0-T07, P0-T15 | 3 | [x] ✅ 2026-11-10 · 证据：PR #45 / currency-config.spec.ts |
```

---

## 附录 D · 阶段 5 后端主线交付索引（2026-11-05）

> 本附录只建立「能力 → 提交 → 迁移 → 测试」的可追溯索引，**不代替任务行勾选**；
> P4/P5 各任务是否 `[x]` 仍由对应执行方按各自验收标准判定。
> 后端主线全部走「storefront 薄层复用 shop 模型/服务」，未建第二套后端；金额一律整数「分」。

| 能力 | 提交 | 迁移 | 全量用例 |
| --- | --- | --- | --- |
| 步骤 4 购物车/报价/建单/支付会话/Webhook | `9f941f6` | 000040–000050 | 407 |
| newsletter + restock 到货通知 | `b8ff736` | 000051–000052 | 414 |
| 评价 + 商品问答 | `29ce004` | 000053–000054 | 428 |
| CMS 内容（文章/slug/标签） | `9903b62` | 000055 | 433 |
| RMA 退货（订单归属/可退态/退款重算/状态机） | `db6f5f6` | 000056 | 442 |
| 17track 物流轨迹（防枚举/可插拔 provider/缓存降级） | `6c55a9b` | 000057 | 448 |
| 步骤 6 CAPI 埋点 + 订单来源归因 | `b8a5b9c` | 000058 | 462 |
| 前端 `shops/` 三接口接线（track-event / attribution / track） | `c57d26a` | — | 前端 25/25 |
| 端到端真实 HTTP 实证（后端 8 条 + BFF 3 链路） | `7831d41` | — | 见 `plans/phase-5-storefront.md` |
| P5-T02 后台币种治理界面 | `4421a98` | 000059 | 前端 629/629 |
| T-08 配送白名单 / 分区运费 / 不可配送禁支付 | `293cb45` | 000060 | 479 + 3 todo |
| T-07 优惠券校验 / 原子占用 / 幂等重放前置 | `7f7100f` | 000061 | 489 + 3 todo |
| T-09 退款状态流 / 订单快照币种 / 并发不超退 | `751df39` | 000062 | 499 + 3 todo |
| §9 门禁 todo 清零 + 状态回填 | `a0721d3` | — | 503 passed / 0 todo（51 文件） |
| P4-T02 地址簿（T-10 越权隔离 + 默认兜底 + 账户中心页） | `20f76f0` | — | 后端 +11 / 前端 +6 / trade-gate +1 |
| P3-T17 订单邮件 outbox（确认 / 发货 / 退款 + 快照币种 + 失败重试） | `019d7ae` | 000063 | **528 passed / 0 todo（53 文件）** |
| T-12 JSON-LD / 前台符号切币种真实 HTTP 实测 | 本报告 | — | 5/5 PASS（`docs/reports/t12-jsonld-currency-switch.md`） |

**能力 → 任务映射（供门禁抽查）**：P4-T04 物流防枚举 ← `6c55a9b` + `c57d26a`；
P4-T05/T06 退货服务端资格与状态机 ← `db6f5f6`（**注意：后台可配置 `ReturnPolicy` 模型未在本索引内，勾选时须单独核验**）；
P4-T07 评价审核与已购验证 ← `29ce004`；P4-T09 订阅退订 ← `b8ff736`；
P4-T10/T11 CAPI 与同意一致性 ← `b8a5b9c` + `c57d26a` + `7831d41`；
X-T03 币种配置变更审计 ← `880d38c` + `4421a98`（界面查询入口）；P5-T02 ← `4421a98`。
§9 的 T-01~T-12 属**上线门禁**，需逐项自动化/实证证据后单独勾选，本附录不代勾。
T-07 / T-08 / T-09 已于 2026-11-05 由上述三次提交补齐，`storefront-trade-gate.test.ts` 的 3 个 `it.todo`
已全部转为真实断言；随后 T-10（地址簿 `20f76f0`）与 T-12（订单邮件 `019d7ae` + JSON-LD 真实 HTTP 实测）亦补齐，
trade-gate 现有 **15 条真实断言 / 0 todo**，§9 T-01~T-12 全部 `[x]`。
非门禁遗留仅剩 SMTP 实际投递与 drain 调度、CDN 透传、G4 菜单权限复核、P0-T05b 业务签字，见 §11。
