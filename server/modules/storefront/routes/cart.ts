import { Router } from 'express'
import { validate } from '../../../middleware/validate.js'
import { cartAddSchema, cartUpdateSchema } from '../../../shared/schemas/storefront.js'
import * as cartController from '../controllers/cartController.js'

/**
 * 购物车路由（公开，挂在 /api/storefront/v1/cart）
 * 游客以 X-Cart-Token / cookie 标识；登录顾客自动归属（customerAuth 在需要时叠加）。
 */
const router = Router()

router.get('/', cartController.getCart)
router.post('/items', validate(cartAddSchema, 'body'), cartController.addItem)
router.patch('/items/:id', validate(cartUpdateSchema, 'body'), cartController.updateItem)
router.delete('/items/:id', cartController.removeItem)

export default router
