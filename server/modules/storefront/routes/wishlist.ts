import { Router } from 'express'
import * as wishlistController from '../controllers/wishlistController.js'
import { customerAuth } from '../middleware/customerAuth.js'
import { validate } from '../../../middleware/validate.js'
import {
  wishlistAddSchema,
  wishlistProductIdParamSchema,
  wishlistListQuerySchema,
  wishlistNotifySchema,
} from '../../../shared/schemas/storefront.js'

/**
 * Storefront 收藏夹路由（挂在 /api/storefront/v1/wishlist）
 * 全部需顾客 JWT（customerAuth）：收藏只属于顾客本人。
 */
const router = Router()

// 特殊子路由必须注册在 :productId 之前，否则被 :productId 吞掉
router.get('/', validate(wishlistListQuerySchema, 'query'), customerAuth, wishlistController.list)
router.get('/ids', customerAuth, wishlistController.ids)
router.post('/', validate(wishlistAddSchema), customerAuth, wishlistController.add)
router.delete('/', customerAuth, wishlistController.clear)
router.delete('/:productId', validate(wishlistProductIdParamSchema, 'params'), customerAuth, wishlistController.remove)
router.patch('/:productId/notify', validate(wishlistProductIdParamSchema, 'params'), validate(wishlistNotifySchema), customerAuth, wishlistController.notify)

export default router
