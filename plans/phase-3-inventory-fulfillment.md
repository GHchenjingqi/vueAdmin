# 阶段 3：库存/仓配 + 订单履约最小闭环

**目标**：建立统一**库存中心**（多仓：保税仓 / 海外仓 / 直邮），打通**订单履约最小闭环**（手工建单 + 库存占用 + 1 个物流对接），让商品真正"可卖可发"。

**周期**：3–4 周
**前置依赖**：阶段 1（商品/SKU）、阶段 2（渠道发布）完成

---

## 3.1 库存中心数据模型

- 动作：新增迁移：
  - `warehouses`：`name`, `type`(bonded|overseas|direct), `country`, `address`, `tenant_id`
  - `inventory`：`sku_id`, `warehouse_id`, `quantity`, `locked`, `tenant_id`（可用量 = quantity - locked）
  - `inventory_log`：`sku_id`, `warehouse_id`, `delta`, `type`(in|out|lock|unlock), `ref`(订单/采购), `tenant_id`
- Zod：`shop.ts` 增加 warehouseSchema / inventorySchema / inventoryLogSchema。
- 产出：3 张表 + schema。
- 验收：`migrate:status` 含新表；typecheck 通过。

## 3.2 库存服务（统一库存中心，防超卖）

- 动作：`server/modules/shop/services/inventoryService.ts`
  - `adjust(skuId, warehouseId, delta)`：写 `inventory` + 记 `inventory_log`
  - `occupy(skuId, qty, orderId)` / `release(skuId, qty, orderId)`：锁定量管理
  - `available(skuId)`：跨仓聚合可用量（渠道发布时校验库存用）
- 所有操作走事务；service 注入 `tenant_id`。
- 产出：`inventoryService.ts` + 单测（占用/释放/超卖拦截）。
- 验收：`npm --prefix server run test` 通过；并发占用不超卖（单测覆盖）。

## 3.3 订单与履约模型

- 动作：新增迁移：
  - `orders`：`order_no`, `channel_id`, `shop_id`, `buyer`(JSON), `currency`, `amount`, `status`(created|paid|fulfilled|shipped|done|cancelled), `tenant_id`
  - `order_items`：`order_id`, `sku_id`, `qty`, `price`, `tenant_id`
  - `order_shipments`：`order_id`, `carrier`, `tracking_no`, `customs_no`(报关单号), `status`, `tenant_id`
- Zod：orderSchema / orderItemSchema / shipmentSchema。
- 产出：3 张表 + schema。
- 验收：typecheck/test 通过。

## 3.4 订单服务（最小闭环）

- 动作：`server/modules/shop/services/orderService.ts`
  - `createManualOrder(payload)`：手工建单 → 写 `orders`+`order_items` → 对每个 SKU 调 `inventoryService.occupy()`（库存不足则回滚并报错）
  - `markPaid / ship(orderId, carrier, trackingNo)`：`ship` 时生成 `order_shipments`（含报关单号占位），释放占用并扣减实际库存
  - `cancel(orderId)`：释放占用
- 产出：`orderService.ts` + 单测。
- 验收：手工建单正确占用库存；发货后库存扣减、占用释放；取消回滚。

## 3.5 物流对接（本期 1 个，走适配层）

- 动作：在 `channelAdapter.ts`（阶段 2 已建）增加 `logistics` 子模块：`createShipment(order)` 本期对接 1 家（如 mock 或 4PX/云途其一），返回 `tracking_no`；其余留接口。报关字段 `customs_no` 由 `complianceService` 依据 SKU 的 `hs_code/origin_country/declared_value` 自动填充。
- 产出：物流适配最小实现。
- 验收：发货调用返回运单号并写入 `order_shipments`。

## 3.6 前端：库存 + 订单页面

- 动作（`src/views/shop/`）：
  - `inventory/WarehouseList.vue`、`inventory/InventoryList.vue`（按 SKU×仓库展示可用量 + 流水）
  - `order/OrderList.vue` + `OrderDetail.vue`（建单、发货、取消）
  - `product/SkuManager.vue` 增加"库存"页签，展示各仓可用量
- i18n：补充库存/订单相关文案（中英）。
- 产出：3+ 页面。
- 验收：`npm run format && npm run typecheck && npm run lint && npm run test` 全绿；走查"建单→占用→发货→扣减"完整闭环。

## 3.7 阶段收尾

- 动作：
  1. 前端全量验证；后端 typecheck/test + migrate:status。
  2. 提交：`git commit -m "feat(shop): 库存中心与订单履约最小闭环"`
- 完成标准：商品可在后台建单发货，库存跨仓统一、不超卖，报关字段自动带出。

---

**阶段 3 完成标准清单**

- [ ] 多仓库存表 + 库存服务（占用/释放/聚合/防超卖）
- [ ] 订单/订单项/物流单表 + 订单服务
- [ ] 手工建单正确占用并扣减库存
- [ ] 发货生成运单号 + 报关字段自动填充
- [ ] 前端库存/订单页面可用并走通闭环
- [ ] 前端全量验证 + 后端验证全绿
- [ ] 已提交 `feat(shop):` commit
