import { Router } from 'express'
import * as membershipController from '../controllers/membershipController.js'
import { customerAuth } from '../middleware/customerAuth.js'

/**
 * Storefront 会员路由（挂在 /api/storefront/v1/membership）
 * 全部需顾客 JWT（customerAuth）：会员体系只属于顾客本人。
 */
const router = Router()

router.get('/', customerAuth, membershipController.getMyMembership)
router.get('/points-logs', customerAuth, membershipController.getMyPointsLogs)

export default router
