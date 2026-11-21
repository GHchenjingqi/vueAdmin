/**
 * 提示词前台路由（挂载于 /api/v1/portal）
 *
 * 公开读接口使用 optionalAuth（已登录时额外返回收藏状态）；
 * 注册公开；其余写接口强制登录。不使用 adminGuard。
 */
import { Router } from 'express'
import { optionalAuth, requirePortalUser } from '../middleware/portalAuth.js'
import * as portalController from '../controllers/portalController.js'
import * as userPromptController from '../controllers/userPromptController.js'
import * as favoriteController from '../controllers/favoriteController.js'
import * as uploadController from '../../../controllers/uploadController.js'

const router = Router()

router.use(optionalAuth)

// ==================== 公开浏览 ====================
router.get('/categories', portalController.categories)
router.get('/platforms', portalController.platforms)
router.get('/model-options', portalController.modelOptions)
router.get('/parent-options', portalController.parentOptions)
router.get('/prompts', portalController.list)
router.get('/prompts/:id/related', portalController.related)
router.get('/prompts/:id', portalController.detail)

// ==================== 注册 ====================
router.post('/auth/register', portalController.register)

// ==================== 以下需要登录 ====================
router.use(requirePortalUser)

// 投稿效果图上传：与后台共用同一套校验与存储目录，绕开默认配额限制
router.post('/upload-image', uploadController.uploadFile)

router.get('/mine', userPromptController.list)
router.get('/mine/:id', userPromptController.getById)
router.post('/mine', userPromptController.create)
router.put('/mine/:id', userPromptController.update)
router.post('/mine/:id/submit', userPromptController.submit)
router.delete('/mine/:id', userPromptController.remove)

router.get('/favorites', favoriteController.list)
router.post('/favorites/:promptId', favoriteController.add)
router.delete('/favorites/:promptId', favoriteController.remove)

export default router
