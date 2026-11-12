import { Router } from 'express'
import { customerAuth } from '../middleware/customerAuth.js'
import * as couponController from '../controllers/couponController.js'

/**
 * 优惠券 C 端接口（挂载于 /api/storefront/v1/coupons）
 */
const router = Router()

router.get('/available', customerAuth, couponController.listAvailable)

export default router
