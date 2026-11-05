import { Router } from 'express'
import { authMiddleware } from '../../../middleware/auth.js'
import { validate } from '../../../middleware/validate.js'
import { idParamSchema } from '../../../shared/schemas/common.js'
import {
  createCategorySchema,
  updateCategorySchema,
  createBrandSchema,
  updateBrandSchema,
  createAttributeSchema,
  updateAttributeSchema,
  createSpuSchema,
  updateSpuSchema,
  statusChangeSchema,
  createSkuSchema,
  updateSkuSchema,
  upsertPriceSchema,
  rateSnapshotSchema,
  shopPaginationSchema,
  createChannelSchema,
  updateChannelSchema,
  createWarehouseSchema,
  updateWarehouseSchema,
  createShopSchema,
  updateShopSchema,
  createChannelProductSchema,
  adjustInventorySchema,
  createOrderSchema,
  shipOrderSchema,
  createPromotionSchema,
  updatePromotionSchema,
  createCouponSchema,
  updateCouponSchema,
  analyticsQuerySchema,
  createRefundSchema,
} from '../../../shared/schemas/shop.js'
import * as categoryController from '../controllers/categoryController.js'
import * as brandController from '../controllers/brandController.js'
import * as attributeController from '../controllers/attributeController.js'
import * as spuController from '../controllers/spuController.js'
import * as skuController from '../controllers/skuController.js'
import * as priceController from '../controllers/priceController.js'
import * as channelController from '../controllers/channelController.js'
import * as shopStoreController from '../controllers/shopStoreController.js'
import * as channelProductController from '../controllers/channelProductController.js'
import * as warehouseController from '../controllers/warehouseController.js'
import * as inventoryController from '../controllers/inventoryController.js'
import * as orderController from '../controllers/orderController.js'
import * as marketingController from '../controllers/marketingController.js'
import * as analyticsController from '../controllers/analyticsController.js'
import * as currencyConfigController from '../controllers/currencyConfigController.js'
import * as refundController from '../controllers/refundController.js'
import * as orderMailController from '../controllers/orderMailController.js'
import { updateCurrencySchema, rollbackCurrencySchema } from '../../../shared/schemas/storefront-commerce.js'

/**
 * 商城后台模块路由
 *
 * 统一前缀 /api/v1/shop（在 server/routes/index.ts 挂载）。
 * 阶段 1：商品中心；阶段 2：渠道/店铺/发布（审批流回调）；阶段 3：库存/订单；阶段 4：营销/数据。
 * 租户隔离：authMiddleware 建立租户上下文，service 层显式注入 tenantId。
 */
const router = Router()

/**
 * POST /shop/workflow-callback
 * 工作流审批结束回调（由引擎 fireWorkflowCallback 触发）。内部接口免鉴权：
 * 仅依据 instanceId + status 更新 SPU 状态，并校验实例确属 shop-publish 业务。
 */
router.post('/workflow-callback', spuController.workflowCallback)

router.get('/health', (_req, res) => {
  res.json({ code: 0, data: { ok: true, service: 'shop', time: new Date().toISOString() } })
})

// ==================== 类目 ====================
router.get('/categories', authMiddleware, categoryController.tree)
router.get('/categories/options', authMiddleware, categoryController.options)
router.get('/categories/:id', authMiddleware, validate(idParamSchema, 'params'), categoryController.getById)
router.post('/categories', authMiddleware, validate(createCategorySchema), categoryController.create)
router.put('/categories/:id', authMiddleware, validate(idParamSchema, 'params'), validate(updateCategorySchema), categoryController.update)
router.delete('/categories/:id', authMiddleware, validate(idParamSchema, 'params'), categoryController.remove)

// ==================== 品牌 ====================
router.get('/brands', authMiddleware, validate(shopPaginationSchema, 'query'), brandController.list)
router.get('/brands/options', authMiddleware, brandController.options)
router.get('/brands/:id', authMiddleware, validate(idParamSchema, 'params'), brandController.getById)
router.post('/brands', authMiddleware, validate(createBrandSchema), brandController.create)
router.put('/brands/:id', authMiddleware, validate(idParamSchema, 'params'), validate(updateBrandSchema), brandController.update)
router.delete('/brands/:id', authMiddleware, validate(idParamSchema, 'params'), brandController.remove)

// ==================== 属性 ====================
router.get('/attributes', authMiddleware, attributeController.list)
router.get('/attributes/options', authMiddleware, attributeController.options)
router.get('/attributes/:id', authMiddleware, validate(idParamSchema, 'params'), attributeController.getById)
router.post('/attributes', authMiddleware, validate(createAttributeSchema), attributeController.create)
router.put('/attributes/:id', authMiddleware, validate(idParamSchema, 'params'), validate(updateAttributeSchema), attributeController.update)
router.delete('/attributes/:id', authMiddleware, validate(idParamSchema, 'params'), attributeController.remove)

// ==================== SPU（商品） ====================
router.get('/spus', authMiddleware, spuController.list)
router.get('/spus/:id', authMiddleware, validate(idParamSchema, 'params'), spuController.detail)
router.post('/spus', authMiddleware, validate(createSpuSchema), spuController.create)
router.put('/spus/:id', authMiddleware, validate(idParamSchema, 'params'), validate(updateSpuSchema), spuController.update)
router.post('/spus/:id/status', authMiddleware, validate(idParamSchema, 'params'), validate(statusChangeSchema), spuController.changeStatus)
router.post('/spus/:id/submit-for-publish', authMiddleware, validate(idParamSchema, 'params'), spuController.submitForPublish)
router.delete('/spus/:id', authMiddleware, validate(idParamSchema, 'params'), spuController.remove)

// ==================== SKU ====================
router.get('/skus', authMiddleware, skuController.list)
router.get('/spus/:spuId/skus', authMiddleware, skuController.listBySpu)
router.post('/skus', authMiddleware, validate(createSkuSchema), skuController.create)
router.get('/skus/:id', authMiddleware, validate(idParamSchema, 'params'), skuController.getById)
router.put('/skus/:id', authMiddleware, validate(idParamSchema, 'params'), validate(updateSkuSchema), skuController.update)
router.delete('/skus/:id', authMiddleware, validate(idParamSchema, 'params'), skuController.remove)

// ==================== 价格（多币种） ====================
router.get('/skus/:skuId/prices', authMiddleware, priceController.listBySku)
router.put('/skus/:skuId/prices', authMiddleware, validate(upsertPriceSchema), priceController.upsert)
router.delete('/skus/:skuId/prices/:currency', authMiddleware, priceController.remove)

// ==================== 汇率快照 ====================
router.get('/rates/snapshot', authMiddleware, priceController.getSnapshot)
router.get('/rates/snapshots', authMiddleware, priceController.listSnapshots)
router.put('/rates/snapshot', authMiddleware, validate(rateSnapshotSchema), priceController.saveSnapshot)

// ==================== 阶段 2：渠道 / 店铺 / 渠道商品 ====================
router.get('/channels', authMiddleware, validate(shopPaginationSchema, 'query'), channelController.list)
router.get('/channels/options', authMiddleware, channelController.options)
router.get('/channels/:id', authMiddleware, validate(idParamSchema, 'params'), channelController.getById)
router.post('/channels', authMiddleware, validate(createChannelSchema), channelController.create)
router.put('/channels/:id', authMiddleware, validate(idParamSchema, 'params'), validate(updateChannelSchema), channelController.update)
router.delete('/channels/:id', authMiddleware, validate(idParamSchema, 'params'), channelController.remove)

router.get('/shops', authMiddleware, validate(shopPaginationSchema, 'query'), shopStoreController.list)
router.get('/shops/options', authMiddleware, shopStoreController.options)
router.get('/shops/:id', authMiddleware, validate(idParamSchema, 'params'), shopStoreController.getById)
router.post('/shops', authMiddleware, validate(createShopSchema), shopStoreController.create)
router.put('/shops/:id', authMiddleware, validate(idParamSchema, 'params'), validate(updateShopSchema), shopStoreController.update)
router.delete('/shops/:id', authMiddleware, validate(idParamSchema, 'params'), shopStoreController.remove)

router.get('/channel-products', authMiddleware, validate(shopPaginationSchema, 'query'), channelProductController.list)
router.post('/channel-products', authMiddleware, validate(createChannelProductSchema), channelProductController.publish)

// ==================== 阶段 3：库存中心 ====================
router.get('/warehouses', authMiddleware, validate(shopPaginationSchema, 'query'), warehouseController.list)
router.get('/warehouses/options', authMiddleware, warehouseController.options)
router.get('/warehouses/:id', authMiddleware, validate(idParamSchema, 'params'), warehouseController.getById)
router.post('/warehouses', authMiddleware, validate(createWarehouseSchema), warehouseController.create)
router.put('/warehouses/:id', authMiddleware, validate(idParamSchema, 'params'), warehouseController.update)
router.delete('/warehouses/:id', authMiddleware, validate(idParamSchema, 'params'), warehouseController.remove)

router.get('/inventory', authMiddleware, validate(shopPaginationSchema, 'query'), inventoryController.list)
router.get('/inventory/logs', authMiddleware, validate(shopPaginationSchema, 'query'), inventoryController.logs)
router.post('/inventory/adjust', authMiddleware, validate(adjustInventorySchema), inventoryController.adjust)

// ==================== 阶段 3：订单履约 ====================
router.get('/orders', authMiddleware, validate(shopPaginationSchema, 'query'), orderController.list)
router.get('/orders/:id', authMiddleware, validate(idParamSchema, 'params'), orderController.detail)
router.post('/orders', authMiddleware, validate(createOrderSchema), orderController.create)
router.post('/orders/:id/pay', authMiddleware, validate(idParamSchema, 'params'), orderController.markPaid)
router.post('/orders/:id/ship', authMiddleware, validate(idParamSchema, 'params'), validate(shipOrderSchema), orderController.ship)
router.post('/orders/:id/cancel', authMiddleware, validate(idParamSchema, 'params'), orderController.cancel)
// T-09：退款（薄层复用 shop 订单快照，金额/币种由服务端决定）
router.get('/orders/:id/refunds', authMiddleware, validate(idParamSchema, 'params'), refundController.list)
router.post('/orders/:id/refunds', authMiddleware, validate(idParamSchema, 'params'), validate(createRefundSchema), refundController.create)

// ==================== P3-T17：订单邮件 outbox（查询 / 手动投递 / 失败重发） ====================
router.get('/order-mails', authMiddleware, orderMailController.list)
router.post('/order-mails/drain', authMiddleware, orderMailController.drain)
router.post('/order-mails/:id/retry', authMiddleware, validate(idParamSchema, 'params'), orderMailController.retry)

// ==================== 阶段 4：营销中心 ====================
router.get('/promotions', authMiddleware, validate(shopPaginationSchema, 'query'), marketingController.listPromotions)
router.get('/promotions/:id', authMiddleware, validate(idParamSchema, 'params'), marketingController.getPromotion)
router.post('/promotions', authMiddleware, validate(createPromotionSchema), marketingController.createPromotion)
router.put('/promotions/:id', authMiddleware, validate(idParamSchema, 'params'), validate(updatePromotionSchema), marketingController.updatePromotion)
router.delete('/promotions/:id', authMiddleware, validate(idParamSchema, 'params'), marketingController.deletePromotion)

router.get('/coupons', authMiddleware, validate(shopPaginationSchema, 'query'), marketingController.listCoupons)
router.get('/coupons/:id', authMiddleware, validate(idParamSchema, 'params'), marketingController.getCoupon)
router.post('/coupons', authMiddleware, validate(createCouponSchema), marketingController.createCoupon)
router.put('/coupons/:id', authMiddleware, validate(idParamSchema, 'params'), validate(updateCouponSchema), marketingController.updateCoupon)
router.delete('/coupons/:id', authMiddleware, validate(idParamSchema, 'params'), marketingController.deleteCoupon)

// ==================== 阶段 4：数据参谋 ====================
router.get('/analytics/sales', authMiddleware, validate(analyticsQuerySchema, 'query'), analyticsController.sales)
router.get('/analytics/profit', authMiddleware, validate(analyticsQuerySchema, 'query'), analyticsController.profit)
router.get('/analytics/turnover', authMiddleware, validate(analyticsQuerySchema, 'query'), analyticsController.turnover)

// ==================== 商城设置：币种配置治理（P0-T05b / P5-T02 / X-T03） ====================
// 二次确认（confirmImpact + ackNoConversion）、审计 config_changes、定时生效与回滚；
// 价格数值不会自动换算（C5）——界面提示由后台前端承接。
router.get('/settings/currency', authMiddleware, currencyConfigController.getCurrency)
router.get('/settings/currency/active', authMiddleware, currencyConfigController.getActive)
router.put('/settings/currency', authMiddleware, validate(updateCurrencySchema), currencyConfigController.updateCurrency)
router.post('/settings/currency/rollback', authMiddleware, validate(rollbackCurrencySchema), currencyConfigController.rollbackCurrency)
router.get('/config-changes', authMiddleware, currencyConfigController.listConfigChanges)

export default router
