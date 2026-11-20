import { Router } from 'express'
import { authMiddleware } from '../../../middleware/auth.js'
import { adminGuard } from '../middleware/adminGuard.js'
import * as uploadController from '../../../controllers/uploadController.js'
import * as categoryController from '../controllers/categoryController.js'
import * as platformController from '../controllers/platformController.js'
import * as promptController from '../controllers/promptController.js'
import * as reviewController from '../controllers/reviewController.js'

const router = Router()

router.use(authMiddleware, adminGuard)

// 效果图上传：复用框架上传控制器（含扩展名/魔数校验），
// 不走 /upload 的 quotaGuard('files')，避免默认配额为 0 时整个上传链路不可用。
router.post('/upload-image', uploadController.uploadFile)

router.get('/categories/options', categoryController.options)
router.get('/categories', categoryController.list)
router.post('/categories', categoryController.create)
router.put('/categories/:id', categoryController.update)
router.delete('/categories/:id', categoryController.remove)

router.get('/platforms/options', platformController.options)
router.get('/platforms', platformController.list)
router.post('/platforms', platformController.create)
router.put('/platforms/:id', platformController.update)
router.delete('/platforms/:id', platformController.remove)

router.get('/prompts', promptController.list)
// 注意：静态路径必须放在 /prompts/:id 之前，否则会被动态段吞掉
router.get('/prompts/model-options', promptController.modelOptions)
router.get('/prompts/parent-options', promptController.parentOptions)
router.get('/prompts/:id', promptController.getById)
router.post('/prompts', promptController.create)
router.put('/prompts/:id', promptController.update)
router.post('/prompts/:id/publish', promptController.publish)
router.post('/prompts/:id/offline', promptController.offline)
router.delete('/prompts/:id', promptController.remove)

router.get('/reviews', reviewController.list)
router.post('/reviews/:id/approve', reviewController.approve)
router.post('/reviews/:id/reject', reviewController.reject)

router.get('/stats', promptController.stats)

export default router
