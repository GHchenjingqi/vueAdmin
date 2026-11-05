# G4 门禁检查清单 · P4-T17

> 生成：2026-11-05 · 关联：`P4-T17 G4 门禁：政策审核、客服履约可执行、埋点验证`
> 性质：**技术能力盘点与待决策清单**。本清单只登记证据与缺口，**不代勾任务状态**；G4 达成需业务方逐项复核签字。

---

## 1. 政策审核（政策经目标市场专业人士审核）

| 项 | 现状 | 证据 | 缺口 / 待决策 |
| --- | --- | --- | --- |
| 政策页面渠道 | ✅ 已具备 | `shops/pages/policies/[slug].vue`（CMS 驱动，隐私/条款/物流/退换货可挂载） | 无 |
| 政策文本内容 | ⬜ 待审核 | CMS 政策文章已可发布 | **需目标市场专业人士审核**隐私政策/服务条款/退货政策文本（合规口径、争议管辖、数据出境等）——业务决策项 |
| RMA 退货规则 | ✅ 机制已备 | RMA 流程：状态机 pending→approved→returned、原因/明细/金额服务端重算（`db6f5f6`，9 例单测） | 退货窗口期/可退品类等商业规则需业务定稿并写入政策文本 |
| 运营合规卡点 | ✅ 已具备 | 发布合规检查（channel 合规卡点，shopPhases 回归覆盖） | 无 |

## 2. 客服履约可执行（客服可查单、可退款）

| 项 | 现状 | 证据 | 缺口 / 待决策 |
| --- | --- | --- | --- |
| 客服查单 | ✅ API 已备 | admin `GET /shop/orders`（分页）、`GET /shop/orders/:id`（详情）；P4-T03 顾客侧订单列表归属隔离（`751c61e`） | admin 前端订单管理页是否满足客服操作习惯，需业务试用确认 |
| 订单履约操作 | ✅ API 已备 | `POST /orders/:id/pay` / `ship` / `cancel`（均为 authMiddleware 保护） | 同上 |
| 退款执行 | ✅ API 已备 | `GET/POST /orders/:id/refunds`（T-09，`751df39`）：订单行锁、累计不超实付、部分→refunding/全额→refunded、幂等键、可插拔 provider 异常整笔回滚；10 例单测 | 退款审批权限分配（谁可操作）为业务决策 |
| 售后 RMA | ⚠️ 顾客侧已备 | 顾客 `POST/GET /rma`、cancel、return tracking（customerAuth） | **admin 侧 RMA 审批/驳回端点未见专门路由**——若客服需在后台处理 RMA，属后续技术任务；当前可经订单退款通道兜底 |
| 订单邮件补偿 | ✅ API 已备 | `GET /order-mails` / `drain` / `:id/retry`（P3-T17，`019d7ae`）：入队即快照币种、5 次退避→dead、人工重发 | SMTP 实际投递与 drain 定时调度仍未接生产配置（如实登记） |
| 物流轨迹查询 | ✅ 已备 | `GET /track/:orderNo?accessToken=` 双要素防枚举（`6c55a9b`）；17track provider 可插拔+缓存降级 | 外部物流 API 密钥配置为上线项 |

## 3. 埋点验证（埋点抽样与后台对账一致）

| 项 | 现状 | 证据 | 缺口 / 待决策 |
| --- | --- | --- | --- |
| 事件采集与幂等 | ✅ 已备 | `shop_analytics_events`（唯一 (tenantId,eventId)）、GA4 九事件 + refund 白名单、consent 门控（未授予仅落库 `skipped_no_consent`）、金额取订单快照校验（`b8a5b9c`，14 例单测） | 无 |
| 前端→后端链路 | ✅ 已联调 | `shared/analytics/capi.ts` + BFF `track-event` 直通；端到端 8/8（合法 200/重放幂等/未知 400/purchase 校验 400）（`c57d26a`/`7831d41`） | 无 |
| 订单归因 | ✅ 已备 | attribution first-touch 缓存、建单固化 sourceSiteId+UTM（`c57d26a`） | 无 |
| **后台对账通道** | ⚠️ 缺口 | admin 仅有 `analytics/sales|profit|turnover` 销售分析 | **缺 `shop_analytics_events` 的 admin 查询/抽样导出端点**——对账操作前需补一个技术任务（查询 + 按 dispatchStatus 过滤）；属后续可执行项 |
| 抽样对账执行 | ⬜ 待业务 | — | 需真实 GA4 后台 vs 本地落库抽样比对（业务操作，依赖真实投放/流量环境） |

## 4. 结论与行动项

- **技术侧可继续**：补 `shop_analytics_events` admin 对账查询端点（建议列为下一个技术任务）。
- **业务侧待决策**：政策文本专业审核签字、退款/RMA 权限分配、admin 履约界面试用确认、真实环境抽样对账。
- G4 整体保持 `[ ]`，任一子项完成由业务方在计划文档回填，本清单不代勾。
