# MARKET_STRATEGY.md · 市场与币种配置策略（P0-T01 / T03 / T05 / T05b）

> 生成：2026-11-04（AI 按默认决策产出；开工授权=用户同日指令「按开发计划开始落代码直到全部完成」；正式业务签核项见 §6）

## 1. 首发国家/区域、语言与币种（P0-T01）

| 项 | 决策（默认） | 说明 |
| --- | --- | --- |
| 首发 | 美国（US） | 独立站类型=independent；站点上下文 `siteContext`（X-Site-Id → shops 记录），单站点起步 |
| 语言 | en-US（单语言，结构预留 zh-CN） | 与 i18n 结构、`SEO_SPEC` hreflang 一致 |
| 币种 | **USD，来源=后台配置**（settings 表 key=`shop.currency`，JSON：code/symbol/decimalDigits/symbolPosition/locale） | 前端零硬编码：不出现 `$`/`¥`/`USD` 字面量，一律取 Store Config；配置缺失/非法 → fail-closed（C7） |
| 配置表/字段 | `settings.optionKey='shop.currency'`、`settings.optionValue`（JSON 文本） | 记录于此以满足 P0-T01「记录配置表名、字段、当前值」；迁移种子行写入默认 USD 配置（显式写入 ≠ 隐式默认） |

## 3. 履约要素（P0-T03）

| 要素 | 决策（默认） | 落点 |
| --- | --- | --- |
| 发货仓 | CN 主仓（广州）+ US 东部三方仓（`shop_warehouses` 已有模型） | `P2-T04` 配送承诺按仓计算（首版：默认 CN 仓 + 按国家选择仓） |
| 可配送国家 | US、CA、GB、AU、DE、FR（首批清单，settings key=`shop.shipping.countries`） | 地址不在清单 → `ADDRESS_NOT_SHIPPABLE`（T-08） |
| 退货地址与承担方 | 美国 3PL 退货地址（settings key=`shop.returns.address`）；质量问题商家承担运费，无责退货买家承担 | `shop_return_requests` 政策快照 |
| 进口税承担 | DDU（买家承担进口税）；US 销售税由商家在结算时代收（TaxProvider 规则表） | P3-T06 |
| 运费报价 | 按当前配置币种报价（运费规则表 settings key=`shop.shipping.rates`），与报价币种一致否则拒绝 | P3-T05 |

## 4. 税务方案（P0-T05）

| 项 | 决策（默认） | 说明 |
| --- | --- | --- |
| 计税方式 | 内置规则表 TaxProvider（settings key=`shop.tax.rates`：按州综合税率简化表），预留服务商适配层 | 展示方式=结算时含税报价（tax 单列） |
| 责任主体 | 商家作为 marketplace facilitator 代收代缴（US 场景默认） | 税费币种=配置币种；失败策略=阻断（不静默按 0，P3-T06） |
| 报价接口出入参 | `POST /checkout/quote` 出参 `tax: {amount:int 分, currency}` | 见 API_CONTRACT |

## 5. 币种配置治理决策（P0-T05b，四条结论）

1. **操作权限**：仅 admin（`/api/v1/shop/settings/currency`，admin 鉴权 + 审计）；非管理员改配置返回 403（P4-T15 渗透项）。
2. **二次确认 + 影响提示**：PUT 请求必须带 `confirmImpact:true` 与 `ackNoConversion:true`；界面文案含「价格数值不会自动换算」（$1,299 → ¥1,299 的业务事故风险提示）。
3. **是否定时生效**：支持 `effectiveAt` 定时生效（settings 存 pending 变更， sweeper 到点应用）与「立即生效」两档；支持回滚（apply 变更同样写审计，回滚=再应用旧值）。
4. **切换后存量处理**：存量购物车保留原报价快照，下次报价返回 `CURRENCY_CHANGED` 要求重建；未支付订单由 sweeper 按 TTL 关闭并邮件引导重新下单（P3-T14）；已支付订单不动（C6）。
- **审计字段**：`shop_config_changes`（id、key、oldValue JSON、newValue JSON、operatorId、effectiveAt、appliedAt、rollbackOf、createdAt）——谁/何时/从什么改成什么/是否回滚，全留痕（X-T03）。

## 6. 审批状态（待业务签核项）

| # | 事项 | 当前状态 | 需要谁 |
| --- | --- | --- | --- |
| 1 | 首发市场=US / 语言=en-US | 默认决策已执行（用户 2026-11-04 开工指令视为授权） | 业务负责人签字 |
| 2 | 履约清单 §3（仓/国家/退货/税） | 默认决策已执行，规则表可在后台改 | 运营 + 财务 |
| 3 | 支付服务商真实开户与币种清单核验 | 以 Mock Provider 完成沙箱链路，真实开户列遗留项 | 财务 / 支付 |
| 4 | 税率规则表数值 | 简化表占位，上线前由税务顾问复核 | 税务顾问 |
