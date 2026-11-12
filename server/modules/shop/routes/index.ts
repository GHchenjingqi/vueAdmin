import { Router } from 'express'
import { authMiddleware } from '../../../middleware/auth.js'
import { requireAdmin } from '../../../middleware/requireAdmin.js'
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
  createBundleSchema,
  updateBundleSchema,
  analyticsQuerySchema,
  createRefundSchema,
  rmaRejectSchema,
  qaAnswerSchema,
} from '../../../shared/schemas/shop.js'
import { articleAdminListQuerySchema, articleCreateSchema, articleUpdateSchema } from '../../../shared/schemas/cmsAdmin.js'
import { bannerAdminListQuerySchema, bannerCreateSchema, bannerUpdateSchema } from '../../../shared/schemas/bannerAdmin.js'
import { updatePaymentCredentialsSchema } from '../../../shared/schemas/storefront-commerce.js'
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
import * as paymentChannelsController from '../controllers/paymentChannelsController.js'
import * as refundController from '../controllers/refundController.js'
import * as orderMailController from '../controllers/orderMailController.js'
import * as articleAdminController from '../controllers/articleAdminController.js'
import * as bannerAdminController from '../controllers/bannerAdminController.js'
import * as customerAdminController from '../controllers/customerAdminController.js'
import * as mailCampaignController from '../controllers/mailCampaignController.js'
import * as membershipTierController from '../controllers/membershipTierController.js'
import * as rmaAdminController from '../controllers/rmaAdminController.js'
import * as reviewAdminController from '../controllers/reviewAdminController.js'
import * as auditLogController from '../controllers/auditLogController.js'
import * as productImportController from '../controllers/productImportController.js'
import * as scrape1688Controller from '../controllers/scrape1688Controller.js'
import { importMulterErrorHandler } from '../controllers/productImportController.js'
import * as referralCommissionController from '../controllers/referralCommissionController.js'
import { updateCurrencySchema, rollbackCurrencySchema, updatePaymentChannelsSchema } from '../../../shared/schemas/storefront-commerce.js'

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
// 批量导入（须在 /spus/:id 之前注册，否则 :id 会吞掉 import-template / import 子路径）
router.get('/spus/import-template', authMiddleware, productImportController.template)
router.post('/spus/import/preview', authMiddleware, productImportController.preview, importMulterErrorHandler)
router.post('/spus/import/commit', authMiddleware, productImportController.commit, importMulterErrorHandler)
// 1688 采集（preview 抓取+转存图片不写库；commit 写库为 draft）
router.post('/spus/scrape-1688/preview', authMiddleware, scrape1688Controller.scrapePreview)
router.post('/spus/scrape-1688/commit', authMiddleware, scrape1688Controller.scrapeCommit)
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

// ==================== 售后 RMA 审批（P4-T17 G4：客服履约可执行） ====================
router.get('/rmas', authMiddleware, rmaAdminController.list)
router.post('/rmas/:id/approve', authMiddleware, validate(idParamSchema, 'params'), rmaAdminController.approve)
router.post('/rmas/:id/reject', authMiddleware, validate(idParamSchema, 'params'), validate(rmaRejectSchema, 'body'), rmaAdminController.reject)

// ==================== 商品评价 / 问答后台审核（补齐 pending → 公开的断点） ====================
router.get('/reviews', authMiddleware, reviewAdminController.listReviews)
router.post('/reviews/:id/approve', authMiddleware, validate(idParamSchema, 'params'), reviewAdminController.approveReview)
router.post('/reviews/:id/reject', authMiddleware, validate(idParamSchema, 'params'), reviewAdminController.rejectReview)
router.get('/qa', authMiddleware, reviewAdminController.listQuestions)
router.post('/qa/:id/answer', authMiddleware, validate(idParamSchema, 'params'), validate(qaAnswerSchema), reviewAdminController.answerQuestion)
router.post('/qa/:id/hide', authMiddleware, validate(idParamSchema, 'params'), reviewAdminController.hideQuestion)

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

// ==================== 阶段 5：Bundle / 搭配购 ====================
router.get('/bundles', authMiddleware, validate(shopPaginationSchema, 'query'), marketingController.listBundles)
router.get('/bundles/:id', authMiddleware, validate(idParamSchema, 'params'), marketingController.getBundle)
router.post('/bundles', authMiddleware, validate(createBundleSchema), marketingController.createBundle)
router.put('/bundles/:id', authMiddleware, validate(idParamSchema, 'params'), validate(updateBundleSchema), marketingController.updateBundle)
router.delete('/bundles/:id', authMiddleware, validate(idParamSchema, 'params'), marketingController.deleteBundle)

// ==================== 阶段 4：数据参谋 ====================
router.get('/analytics/sales', authMiddleware, validate(analyticsQuerySchema, 'query'), analyticsController.sales)
router.get('/analytics/profit', authMiddleware, validate(analyticsQuerySchema, 'query'), analyticsController.profit)
router.get('/analytics/turnover', authMiddleware, validate(analyticsQuerySchema, 'query'), analyticsController.turnover)
// G4 埋点对账：原始事件抽样查询（P4-T17 / docs/reports/g4-gate-checklist.md §3）
router.get('/analytics/events', authMiddleware, analyticsController.listEvents)
// P6 推荐效果看板：CTR 聚合（曝光/点击/CTR，按 placement+strategy 分组）
router.get('/analytics/reco-ctr', authMiddleware, analyticsController.recoCtr)
router.get('/analytics/search-hot', authMiddleware, analyticsController.searchHot)
router.get('/analytics/search-funnel', authMiddleware, analyticsController.searchFunnel)

// ==================== 商城设置：币种配置治理（P0-T05b / P5-T02 / X-T03） ====================
// 二次确认（confirmImpact + ackNoConversion）、审计 config_changes、定时生效与回滚；
// 价格数值不会自动换算（C5）——界面提示由后台前端承接。
router.get('/settings/currency', authMiddleware, currencyConfigController.getCurrency)
router.get('/settings/currency/active', authMiddleware, currencyConfigController.getActive)
router.put('/settings/currency', authMiddleware, requireAdmin, validate(updateCurrencySchema), currencyConfigController.updateCurrency)
router.post('/settings/currency/rollback', authMiddleware, requireAdmin, validate(rollbackCurrencySchema), currencyConfigController.rollbackCurrency)
router.get('/config-changes', authMiddleware, requireAdmin, currencyConfigController.listConfigChanges)

// 支付通道后台开关：勾选才展示/可结算；密钥/证书由后台加密配置（DB 主、env 兜底），绝不落 settings 明文
router.get('/settings/payment-channels', authMiddleware, paymentChannelsController.getChannels)
router.put('/settings/payment-channels', authMiddleware, requireAdmin, validate(updatePaymentChannelsSchema), paymentChannelsController.updateChannels)
router.get('/settings/payment-channels/state', authMiddleware, requireAdmin, paymentChannelsController.channelState)
// 支付凭据后台配置（加密落库，掩码回显）
router.get('/settings/payment-channels/credentials', authMiddleware, requireAdmin, paymentChannelsController.getCredentials)
router.put('/settings/payment-channels/credentials', authMiddleware, requireAdmin, validate(updatePaymentCredentialsSchema), paymentChannelsController.updateCredentials)

// X-T03 审计日志查询（仅 admin 可读，用于回溯订单/支付/库存/退款/文章状态变更链）
router.get('/audit-logs', authMiddleware, requireAdmin, auditLogController.listAuditLogs)
router.get('/audit-logs/export', authMiddleware, requireAdmin, auditLogController.exportAuditLogs)

// P5-T07 分销佣金台账（admin 可查 + 结算/作废 pending 项）
router.get('/referral-commissions', authMiddleware, validate(shopPaginationSchema, 'query'), referralCommissionController.list)
router.post('/referral-commissions/:id/settle', authMiddleware, validate(idParamSchema, 'params'), referralCommissionController.settle)

// P5-T06 CMS 后台写入（复用 shop_articles；发布/下线触发缓存失效 + X-T03 审计）
router.get('/articles', authMiddleware, requireAdmin, validate(articleAdminListQuerySchema, 'query'), articleAdminController.list)
router.post('/articles', authMiddleware, requireAdmin, validate(articleCreateSchema), articleAdminController.create)
router.get('/articles/:id', authMiddleware, requireAdmin, validate(idParamSchema, 'params'), articleAdminController.detail)
router.put('/articles/:id', authMiddleware, requireAdmin, validate(idParamSchema, 'params'), validate(articleUpdateSchema), articleAdminController.update)
router.post('/articles/:id/publish', authMiddleware, requireAdmin, validate(idParamSchema, 'params'), articleAdminController.publish)
router.post('/articles/:id/unpublish', authMiddleware, requireAdmin, validate(idParamSchema, 'params'), articleAdminController.unpublish)
// 首页 Banner CRUD
router.get('/banners', authMiddleware, requireAdmin, validate(bannerAdminListQuerySchema, 'query'), bannerAdminController.list)
router.post('/banners', authMiddleware, requireAdmin, validate(bannerCreateSchema), bannerAdminController.create)
router.put('/banners/:id', authMiddleware, requireAdmin, validate(idParamSchema, 'params'), validate(bannerUpdateSchema), bannerAdminController.update)
router.delete('/banners/:id', authMiddleware, requireAdmin, validate(idParamSchema, 'params'), bannerAdminController.remove)

// 会员系统（C 端顾客管理，admin JWT）——与后台用户管理（users 体系）无关
router.get('/customers', authMiddleware, requireAdmin, customerAdminController.list)
router.get('/customers/:id', authMiddleware, requireAdmin, validate(idParamSchema, 'params'), customerAdminController.getById)
router.patch('/customers/:id/status', authMiddleware, requireAdmin, validate(idParamSchema, 'params'), customerAdminController.updateStatus)
router.post('/customers/:id/points', authMiddleware, requireAdmin, validate(idParamSchema, 'params'), customerAdminController.adjustPoints)

// 营销邮件（对会员/用户群发，admin JWT）
router.get('/mail-campaigns', authMiddleware, requireAdmin, mailCampaignController.list)
router.get('/mail-campaigns/audience-stats', authMiddleware, requireAdmin, mailCampaignController.audienceStats)
router.post('/mail-campaigns', authMiddleware, requireAdmin, mailCampaignController.create)
router.post('/mail-campaigns/:id/send', authMiddleware, requireAdmin, validate(idParamSchema, 'params'), mailCampaignController.send)
router.get('/mail-campaigns/:id/recipients', authMiddleware, requireAdmin, validate(idParamSchema, 'params'), mailCampaignController.recipients)

// 会员等级管理（后台自定义三维度门槛/折扣/策略）
// 注意：特殊子路由（recalculate/expiry/expire-now）必须注册在 :id 之前，否则被 :id 吞掉
router.get('/membership-tiers', authMiddleware, requireAdmin, membershipTierController.list)
router.post('/membership-tiers', authMiddleware, requireAdmin, membershipTierController.create)
router.post('/membership-tiers/recalculate', authMiddleware, requireAdmin, membershipTierController.recalculate)
router.get('/membership-tiers/expiry', authMiddleware, requireAdmin, membershipTierController.getExpiry)
router.put('/membership-tiers/expiry', authMiddleware, requireAdmin, membershipTierController.setExpiry)
router.post('/membership-tiers/expire-now', authMiddleware, requireAdmin, membershipTierController.expireNow)
router.put('/membership-tiers/:id', authMiddleware, requireAdmin, membershipTierController.update)
router.delete('/membership-tiers/:id', authMiddleware, requireAdmin, membershipTierController.remove)

export default router
