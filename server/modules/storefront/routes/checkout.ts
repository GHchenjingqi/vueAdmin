import { Router } from 'express'
import { validate } from '../../../middleware/validate.js'
import { quoteSchema, createOrderSchema } from '../../../shared/schemas/storefront.js'
import * as checkoutController from '../controllers/checkoutController.js'
import { customerAuth, optionalCustomerAuth } from '../middleware/customerAuth.js'

/**
 * 结算路由（公开，挂在 /api/storefront/v1/checkout）
 * quote：服务端重算报价；orders：建单（幂等 + 库存预占）；orders/:id：凭 accessToken 取单；
 * GET /orders（顾客 JWT）：P4-T03 当前顾客订单列表。
 */
const router = Router()

router.post('/quote', optionalCustomerAuth, validate(quoteSchema, 'body'), checkoutController.quote)
router.post('/orders', optionalCustomerAuth, validate(createOrderSchema, 'body'), checkoutController.createOrder)
router.get('/orders', customerAuth, checkoutController.listMyOrders)
router.get('/orders/:id', checkoutController.getOrder)

export default router
