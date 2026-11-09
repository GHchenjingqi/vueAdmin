# 门禁签字辅助包（G2 / G3 / G4 / G5 + 横切收尾）

> 生成：2026-11-06 · 关联任务：`P2-T14` / `P3-T19` / `P4-T17` / `P5-T09` / `X-T06`
> 定位：**为业务/责任方逐项复核、签字确认提供证据与待决策点清单**。本包只汇总证据与待决策项，**不代勾门禁状态、不代替签字**；每项门禁达成须由责任方在本包「签字确认」栏勾选，并在 `storefront-execution-plan_v1.0.md` 对应任务行回填 `[x]`。
> 依据报告：`g2-audit.md`、`real-integration.md`、`g4-gate-checklist.md`、`g5-regression-report.md`、`performance-acceptance.md`、`t12-currency-switch.md`。

---

## 1. G2 门禁（P2-T14）· 信息准确、价格币种正确、可抓取、移动端验收

**验收标准**：抽查 20 个 SKU 与后台一致；切币种后抽查 5 个页面符号正确；Search Console 可抓取。

### 技术侧证据（已 PASS）
| 项 | 结果 | 依据 |
| --- | --- | --- |
| 可售 SKU 样本 | PASS（20） | `g2-audit.md` A1 |
| 详情价格与后台 `product_prices` 一致（USD，分） | PASS 3/3（测试商品无 USD 价行为设计 `price=null`） | A2 |
| `inStock` 与 `available`（quantity-locked）一致 | PASS 20/20 | A3 |
| sitemap 只含可索引 URL、无私有路径 | PASS（286 真实 URL） | B1 |
| robots 屏蔽 checkout/account + 声明 Sitemap | PASS | B2 |
| 详情 canonical 指向自身 slug | PASS | B3 |
| 搜索页 noindex | PASS | B5 |
| `store-config.version` 来自后台 settings（非 mock） | PASS | C1 |
| 移动端性能 | PASS：LCP P75 ≤140ms、CLS=0、TTFB 34–95ms | `performance-acceptance.md` |
| 切币种 5 页面符号 | T-12 已覆盖 store-config/详情 JSON-LD/购物车重建；页面级 ¥ 以有价样本（¥129.90 渲染路径）+ JSON-LD 为证 | `t12-currency-switch.md` |

### 待决策 / 外部项
- **Search Console 提交与抓取验证**（需 Google Search Console 账号 + 站点验证）——唯一未闭合项。

### 签字确认（责任方勾选）
- [ ] Search Console 已验证站点可抓取（含 sitemap 提交）
- [ ] 价格/库存/币种符号抽查通过（本包 §技术侧证据）
- [ ] 移动端验收通过（LCP/CLS/TTFB）

---

## 2. G3 门禁（P3-T19）· 沙箱闭环 + 异常路径通过

**验收标准**：支付回调乱序、重复回调、库存异常、币种配置变更四类场景有测试证据。

### 技术侧证据（已 PASS）
| 场景 | 结果 | 依据 |
| --- | --- | --- |
| T-02 幂等：同 `idempotencyKey` 重放返回同单 | ✓ | `real-integration.md` §3 |
| T-03 Webhook 幂等：重复投递 `alreadyProcessed:true`，paymentStatus/reservations/inventory 三不变 | ✓ | §3 |
| T-04 关浏览器支付成功：支付由 Webhook 驱动，结果页仅轮询 | ✓ | §3 |
| T-05 失败释放：`payment.failed` → `releaseReservation` 先释放再抛错 | ✓ | §3 |
| T-10 越权：错误 accessToken → 404（不泄露存在性） | ✓ | §3 |
| T-11 缓存：cart/checkout/orders 全部 `private, no-store` | ✓ | §3 |
| 库存（T-01 相关）：预占 committed 后 quantity 50→45、locked 归 0 | ✓ | §3 |
| 后端全量：§9 T-01~T-12 并发/幂等/异常路径 | ✓ 630/630（68 文件） | `g5-regression-report.md` |
| T-12 币种切换回归（四处一致） | ✓ 已随 P5-T02 收口 | `t12-currency-switch.md` |

> T-06（价格变化重报）、T-07（优惠券）、T-08（不可配送）契约层已就绪，规则表数据已随 P3 批次落码并有单测。

### 待决策 / 外部项
- **生产级环境真实 E2E 抽样**（沙箱已闭环；生产环境需真实可售商品 + 支付网关）。

### 签字确认（责任方勾选）
- [ ] 沙箱完整交易 E2E 通过（含支付回跳/回调）
- [ ] 异常路径（重复请求/回调乱序/库存异常/币种变更）测试证据齐备
- [ ] 生产级抽样计划与执行确认

---

## 3. G4 门禁（P4-T17）· 政策审核、客服履约可执行、埋点验证

**验收标准**：政策经目标市场专业人士审核；客服可查单可退款；埋点抽样与后台对账一致。

### 技术侧证据（已闭合）
| 项 | 结果 | 依据 |
| --- | --- | --- |
| 退款执行 API（订单行锁/累计不超实付/部分→refunding/全额→refunded/幂等/可插拔 provider 整笔回滚） | ✅ | `g4-gate-checklist.md` §2 |
| 售后 RMA：顾客侧 + 后台 `GET /shop/rmas`、`POST /shop/rmas/:id/{approve,reject}`（附原因，仅 pending，租户隔离） | ✅ | §2（2026-11-05 补齐，3 例单测） |
| 订单邮件补偿（入队即快照币种/5 次退避→dead/人工重发） | ✅ | §2 |
| 埋点采集与幂等（`shop_analytics_events` 唯一 (tenantId,eventId)、GA4 九事件 + refund 白名单、consent 门控、金额取订单快照校验） | ✅ | §3 |
| 前端→后端链路（端到端 8/8：合法 200/重放幂等/未知 400/purchase 校验 400） | ✅ | §3 |
| 后台对账通道 `GET /shop/analytics/events`（过滤 + limit 钳制 + 倒序） | ✅ | §3（2026-11-05 补齐，3 例单测） |

### 待决策（业务侧，本包不代签）
1. **政策文本专业审核签字**：隐私政策/服务条款/退货政策——合规口径、争议管辖、数据出境等，需目标市场专业人士审核。
2. **退款 / RMA 审批权限分配**：明确谁可操作（建议见 §附：权限矩阵建议）。
3. **admin 履约界面试用确认**：客服可查单、可退款操作路径人工试用。
4. **真实环境抽样对账**：用 `GET /shop/analytics/events` 抽样比对 GA4 后台（依赖真实投放/流量）。

### 签字确认（责任方勾选）
- [ ] 政策文本经目标市场专业人士审核通过
- [ ] 退款/RMA 审批权限分配明确（见附建议）
- [ ] admin 履约界面人工试用通过
- [ ] 埋点抽样对账一致

---

## 4. G5 门禁（P5-T09）· 扩展未破坏主链路回归

**验收标准**：主市场交易 E2E 全绿；币种切换回归通过；缓存与 SEO 无回归。

### 技术侧证据（已 PASS）
| 项 | 结果 | 依据 |
| --- | --- | --- |
| 主市场交易 E2E（服务端） | ✓ 69/69（6 文件，含 §9 T-01~T-12 并发/幂等/异常） | `g5-regression-report.md` §3-A |
| 币种切换回归 | ✓ 57/57（5 文件）+ `t12-currency-switch.md` / `t12-jsonld-currency-switch.md` | §3-B |
| 缓存与 SEO | ✓ 47/47（6 文件）+ LCP 140ms/CLS 0 | §3-C |
| 扩展能力隔离性 | ✓ 27/27（4 文件）：feature flag / A/B 关闭态 / CMS 缓存失效 | §3-D |
| 浏览器级冒烟 E2E | ✓ **3/3**（独立生产构建 `:4015`，2.1s） | §4 |
| 后端全量 / 前端单测 | ✓ 630/630 · 45/45 | §2 |
| typecheck | ✓ 0 错（server + shops） | §2 |
| P5-T01~T08 收口 | ✓ 全部 `[x]` | 计划 §7 |

> 本会话定位并修复浏览器 E2E 深层根因：`shops/server/api/catalog/[...path].ts` 不认 `commerceSource=mock` 导致目录（真实库测试商品）与购物车（mockStore）数据源不一致（加购 `variant not found` / 下单 `CART_EMPTY`）；增加 mock 分支后 mock 模式自洽，E2E 3/3。

### 待决策 / 外部项
- ~~**业务方签字**：扩展能力上线不破坏既有交易链路。~~ ✅ 已签字（见下方签字记录，2026-11-09）。
- **真实环境**：生产级 E2E 抽样、币种切换真实验收、真实 CDN 缓存失效链路（当前为可插拔失效器，需接真实 CDN）——**签字人知悉，随 X-T06 生产部署验收**（dev/预发证据见上表及 `g5-regression-report.md` §9）。

### 签字确认（责任方勾选）
- [x] 扩展能力上线不破坏主市场交易链路（业务确认）
- [ ] 生产级 E2E 抽样通过 → 随 X-T06 生产部署验收
- [ ] 币种切换真实验收通过 → 随 X-T06 生产部署验收
- [ ] 真实 CDN 缓存失效链路验证通过 → 随 X-T06 生产部署验收

### 签字记录（2026-11-09）
- **签字人**：业务方（经小浣熊会话逐项确认，确认范围：签字并关闭门禁）。
- **确认范围**：勾选①「扩展能力上线不破坏主市场交易链路」；②③④ 生产环境验收项签字人知悉，归入 X-T06 生产部署验收，不阻塞 G5 关闭。
- **依据**：技术侧证据全 PASS（上表）+ 2026-11-09 真实链路端到端实证（`g5-regression-report.md` §9：加购→下单→Pay Now→Paid、`paymentStatus=captured`、真实运费与仓库分配；冒烟 E2E 3/3 含支付终态；E2E 已集成 CI）。
- **门禁状态**：**G5 关闭**；P5-T09 任务行 `[x]`。X-T06 生产部署时须回验 ②③④ 并在本包补勾。

---

## 5. 横切 X-T06 · 发布与回滚 Runbook

### 技术侧证据
- Runbook 已产出（§10 交付物 #9）：架构/部署/币种切换/故障处置/回滚。
- **DB 迁移回滚已实测**（2026-11-05 dev）：000065 `down` 0.568s / `up` 0.243s、端到端 ≈11.7s，RTO 已回填 runbook §6.1。

### 待环境
- **staging 完整发布回滚演练**（应用 + DB 全链路）。
- **生产备份/恢复演练**。

### 签字确认（责任方勾选）
- [ ] staging 发布回滚演练通过
- [ ] 生产备份/恢复演练通过
- [ ] RTO/RPO 目标确认

---

## 附 · 权限矩阵建议（G4 辅助，需业务确认）

> 建议为**最小权限 + 全程审计**（审计链路已就绪：`audit_logs`、`config_changes`、RMA 后台操作留痕）。以下为建议角色划分，非强制，最终由业务方定夺。

| 操作 | 建议角色 | 说明 |
| --- | --- | --- |
| 退款审批 | 客服主管 / 财务 | 退款走独立状态机，幂等 + 累计不超实付，超权限由财务复核 |
| RMA 审批（approve/reject） | 客服主管 | 仅 `pending` 可操作，reject 必附原因 |
| 币种配置切换 | 管理员（二次确认） | 已有 `config_changes` 审计链 + 定时生效/回滚 |
| 埋点对账查询 | 运营 / 数据分析 | 只读，`limit` 钳制，不暴露顾客隐私 |

---

*本包由回归与盘点证据生成；每项门禁的 `[x]` 状态须由责任方在 `storefront-execution-plan_v1.0.md` 对应任务行回填，本包不代勾。*
