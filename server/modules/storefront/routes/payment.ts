import express, { Router } from 'express'
import { validate } from '../../../middleware/validate.js'
import { createPaymentSessionSchema } from '../../../shared/schemas/storefront.js'
import * as paymentController from '../controllers/paymentController.js'

/**
 * 支付路由（公开，挂在 /api/storefront/v1/payments）
 * session：创建支付会话（金额 / 币种取自订单快照）；
 * webhooks/:provider：支付回调（用 express.raw 保留原始 body 用于签名校验）。
 */
const router = Router()

router.post('/session', validate(createPaymentSessionSchema, 'body'), paymentController.createSession)
router.post('/webhooks/:provider', express.raw({ type: 'application/json', limit: '1mb' }), paymentController.webhook)

export default router
