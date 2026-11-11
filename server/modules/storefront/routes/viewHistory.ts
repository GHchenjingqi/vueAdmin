import { Router } from 'express'
import { viewHistoryController } from '../controllers/viewHistoryController.js'
import { optionalCustomerAuth } from '../middleware/customerAuth.js'

/**
 * Storefront 浏览历史路由（挂载在 /api/storefront/v1/view-history）
 * - GET /?sessionId=&limit=  最近浏览（optionalCustomerAuth：登录用 customerId，游客用 sessionId）
 */
const router = Router()
router.get('/', optionalCustomerAuth, viewHistoryController.list)

export default router
