import { Router } from 'express'
import * as referralController from '../controllers/referralController.js'
import { customerAuth } from '../middleware/customerAuth.js'

/**
 * P5-T07 Referral / Affiliate（挂载于 /api/storefront/v1/referrals）
 *   GET /me              我的推荐码 + 佣金汇总 + 明细（顾客 JWT）
 *   GET /validate/:code  校验推荐码是否有效（公开）
 */
const router = Router()

router.get('/me', customerAuth, referralController.me)
router.get('/validate/:code', referralController.validate)

export default router
