import { Router } from 'express'
import * as authController from '../controllers/authController.js'
import { authMiddleware } from '../middleware/auth.js'

const router = Router()

// GET /api/auth/captcha - 获取验证码（无需认证）
router.get('/captcha', authController.captcha)

// POST /api/auth/login - 登录（无需认证）
router.post('/login', authController.login)

// GET /api/auth/profile - 获取当前用户信息（需认证）
router.get('/profile', authMiddleware, authController.profile)

export default router