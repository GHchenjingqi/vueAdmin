import { Router } from 'express'
import { validate } from '../../../middleware/validate.js'
import { quoteSchema, createOrderSchema } from '../../../shared/schemas/storefront.js'
import * as checkoutController from '../controllers/checkoutController.js'

/**
 * 结算路由（公开，挂在 /api/storefront/v1/checkout）
 * quote：服务端重算报价；orders：建单（幂等 + 库存预占）；orders/:id：凭 accessToken 取单。
 */
const router = Router()

router.post('/quote', validate(quoteSchema, 'body'), checkoutController.quote)
router.post('/orders', validate(createOrderSchema, 'body'), checkoutController.createOrder)
router.get('/orders/:id', checkoutController.getOrder)

export default router
