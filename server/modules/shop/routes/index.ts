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
} from '../../../shared/schemas/shop.js'
import * as categoryController from '../controllers/categoryController.js'
import * as brandController from '../controllers/brandController.js'
import * as attributeController from '../controllers/attributeController.js'
import * as spuController from '../controllers/spuController.js'
import * as skuController from '../controllers/skuController.js'
import * as priceController from '../controllers/priceController.js'

/**
 * 商城后台模块路由
 *
 * 统一前缀 /api/v1/shop（在 server/routes/index.ts 挂载）。
 * 阶段 1：商品中心（类目/品牌/属性/SPU/SKU/价格/汇率快照）。
 * 租户隔离：authMiddleware 内部建立租户上下文 + 全局 Sequelize 钩子自动注入。
 */
const router = Router()

/**
 * GET /shop/health
 * 商城模块健康检查（联调用）
 */
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
router.delete('/spus/:id', authMiddleware, validate(idParamSchema, 'params'), spuController.remove)

// ==================== SKU ====================
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

export default router
