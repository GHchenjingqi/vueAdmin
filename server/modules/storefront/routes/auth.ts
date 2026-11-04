import { Router } from 'express'
import { validate } from '../../../middleware/validate.js'
import { loginSchema, registerSchema } from '../../../shared/schemas/customer.js'
import * as authController from '../controllers/authController.js'
import { customerAuth } from '../middleware/customerAuth.js'

/**
 * Storefront 顾客认证路由（公开接口，挂在 /api/storefront/v1/auth）
 *
 * - register / login：公开，需站点上下文确定租户（父 router 已注入 siteContext）。
 * - me：需顾客 JWT（customerAuth）。
 */
const router = Router()

router.post('/register', validate(registerSchema, 'body'), authController.register)
router.post('/login', validate(loginSchema, 'body'), authController.login)
router.get('/me', customerAuth, authController.me)

export default router
