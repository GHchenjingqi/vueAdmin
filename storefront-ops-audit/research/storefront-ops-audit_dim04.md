# storefront-ops-audit Dimension 04 · 履约 / 售后 / 客户运营

Route: C
证据范围：`server/modules/shop/services/{orderService,rmaAdminService,orderMailService}.ts`、`server/modules/storefront/services/{trackingService,abandonedCartService,wishlistService,subscriptionService}.ts`、`src/views/shop/order/{OrderList,RmaAdmin}.vue`

## 结论

订单履约侧缺少批量操作与作业单据，客服侧缺少"换货/部分退"这条最常见路径，客户运营侧的邮件没有转化链路和退订合规。这些不影响"能下单"，但会直接推高每单人力成本。

## 证据链

### 1. 无批量发货

`orderService.ship` 一次只处理一个订单 id，内部对订单行加 `LOCK.UPDATE` 后逐 SKU 释放预占 + 实扣 + 建运单 + 置 shipped。[^dim04-ship]

后台 `OrderList.vue` 的发货是行内按钮 + 单条弹窗，表单只有承运商和运单号两个输入框。[^dim04-ui] 没有多选、没有批量导入运单号。

跨境日出百单时，这意味着逐单复制粘贴运单号。

### 2. 无拣货单 / 面单 / 发票

在 `server/modules` 与 `shops/server` 检索 packing slip / shipping label / waybill / invoice，除计费模块的 `Invoice` 模型（订阅计费，非订单发票）与支付网关的 `invoice_id` 注释外无命中。[^dim04-docs]

`orderService.ship` 的报关单号由首个 SKU 拼接而成：[^dim04-customs]

```js
const customsNo = firstSku
      ? `${firstSku.hsCode || 'NA'}-${firstSku.originCountry || 'NA'}-${firstSku.declaredValue ?? 'NA'}`
      : 'NA'
```

这是"凭证编号"而非"可打印报关单据"。

### 3. 售后只有批准/驳回，没有换货与部分退

`rmaAdminService` 状态机为 `pending → approved → returned → refunded`，`approveRma` 只做一次 CAS 更新。[^dim04-rma]

`refundService` 支持按网关原路退款，`installRefundGatewayProvider` 会在启动时注入真实网关。[^dim04-refund]

但 RMA 与退款之间没有自动衔接：批准 RMA 不会触发退款，也没有"部分金额退款""换货重发"的分支。[^dim04-rma2]

### 4. 到货通知后端有、前台没入口

`subscriptionService` 实现 `subscribeRestock` 与 `notifyRestock`（到货后取 `waiting` 订阅者发送通知）。[^dim04-restock]

路由已挂载 `POST /restock/subscribe`。[^dim04-route]

但在 `shops/pages` 与 `shops/components` 全目录检索 `restock`，无任何命中。[^dim04-noui]

缺货商品页因此没有任何"留下邮箱等补货"的入口，缺货即流失。

### 5. 营销邮件缺转化链路与退订

弃购召回邮件正文只有商品名、数量、行小计与一句提醒，没有商品链接、没有回到购物车的 CTA。[^dim04-abandon]

降价提醒同理，只有新旧价格。[^dim04-price]

两封邮件都不含退订链接。`abandonedCartService.isUnsubscribed` 只在入队前做过滤，邮件正文本身没有一键退订入口。[^dim04-unsub] 而 `subscriptionService` 已实现基于 token 的 `GET /newsletter/unsubscribe`。[^dim04-token]

`.env.example` 中 `NUXT_COMMERCE_SOURCE=mock`，`nuxt.config.ts` 默认 `auto`。[^dim04-src]

### 6. 政策页写死，运营改不了

`policies/[slug].vue` 从 `@shared/mock/fixtures` 读取 `MOCK_POLICY_PAGES`。[^dim04-policy] 后台没有政策页编辑入口，隐私政策/退货政策的更新必须改代码发版。

### 7. 顾客 token 存 localStorage，无账号注销

`shared/customer/auth.ts` 注释与实现均为 localStorage 存 token。[^dim04-token2] 在 `server/modules/storefront` 与 `shops/pages` 检索 `deleteAccount` / `注销` / `dataExport`，无命中。[^dim04-gdpr]

## 影响判断

- 批量能力缺失是纯人力成本：按日均 100 单、每单 40 秒计算，一天约 67 分钟耗在复制运单号上。
- 缺货无订阅入口，等于把"现在买不到"直接变成"永远不回来"。
- 邮件无 CTA 无退订：转化率低，且有 CAN-SPAM / GDPR 合规风险。
- 政策页写死会让合规更新依赖研发排期。
- localStorage 存 token 在 XSS 场景下可被直接读取；无注销入口不满足 GDPR 的"被遗忘权"。

## 修复方向

1. **批量发货**：新增 `POST /shop/orders/batch-ship`，接受 `[{orderId, carrier, trackingNo}]`，逐单复用现有事务逻辑，单条失败不阻断其余并返回明细结果；后台订单列表加多选。
2. **作业单据**：新增拣货单（按订单聚合 SKU 汇总）与打包面单（收件人 + 条码）PDF 导出，复用现有报表导出能力。
3. **RMA 与退款打通**：批准 RMA 时可填退款金额（支持部分退），调用 `refundService`；增加 `exchange` 类型走"换货重发"。
4. **缺货订阅入口**：PDP 在 `!inStock` 时显示邮箱输入，接 `POST /restock/subscribe`。
5. **邮件模板升级**：所有营销邮件统一注入 `{{unsubscribeUrl}}` 与商品深链；模板抽到 DB 或文件，避免改文案要发版。
6. **政策页 CMS 化**：复用现有 `ShopArticle` 或新增 `shop_policies` 表，前台改为读接口。
7. **账号注销与数据导出**：新增 `DELETE /auth/me` 与 `GET /auth/me/export`，符合 GDPR 删除权与可携带权。

[^dim04-ship]: File: server/modules/shop/services/orderService.ts, `ship(id, input)` 单订单事务.
[^dim04-ui]: File: src/views/shop/order/OrderList.vue, 发货弹窗仅 carrier 与 trackingNo.
[^dim04-docs]: File: server/modules, 检索 packing slip/shipping label/waybill/invoice 无订单单据实现.
[^dim04-customs]: File: server/modules/shop/services/orderService.ts, `customsNo` 由 hsCode-originCountry-declaredValue 拼接.
[^dim04-rma]: File: server/modules/shop/services/rmaAdminService.ts, `approveRma` CAS 更新 pending → approved.
[^dim04-refund]: File: server/modules/shop/services/refundGatewayProvider.ts, `installRefundGatewayProvider` 按原通道退款.
[^dim04-rma2]: File: server/modules/shop/services/rmaAdminService.ts, 状态机无 exchange 分支，批准不触发退款.
[^dim04-restock]: File: server/modules/storefront/services/subscriptionService.ts, `subscribeRestock` 与 `notifyRestock`.
[^dim04-route]: File: server/modules/storefront/routes/subscription.ts, `router.post('/restock/subscribe', ...)`.
[^dim04-noui]: File: shops/pages 与 shops/components, 检索 restock 无命中.
[^dim04-abandon]: File: server/modules/storefront/services/abandonedCartService.ts, `renderEmail` 正文无链接.
[^dim04-price]: File: server/modules/storefront/services/wishlistService.ts, price_drop 邮件仅价格文案.
[^dim04-unsub]: File: server/modules/storefront/services/abandonedCartService.ts, `isUnsubscribed` 仅入队前过滤.
[^dim04-token]: File: server/modules/storefront/routes/subscription.ts, `GET /newsletter/unsubscribe?token=`.
[^dim04-src]: File: shops/.env.example, `NUXT_COMMERCE_SOURCE=mock`.
[^dim04-policy]: File: shops/pages/policies/[slug].vue, `import { MOCK_POLICY_PAGES } from '@shared/mock/fixtures'`.
[^dim04-token2]: File: shops/shared/customer/auth.ts, `localStorage.setItem(TOKEN_KEY, token)`.
[^dim04-gdpr]: File: server/modules/storefront 与 shops/pages, 检索 deleteAccount/注销/dataExport 无命中.
