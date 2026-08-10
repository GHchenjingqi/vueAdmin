import { Router } from 'express'
import { authMiddleware } from '../../../middleware/auth.js'
import * as categoryController from '../controllers/categoryController.js'
import * as tagController from '../controllers/tagController.js'
import * as contentController from '../controllers/contentController.js'

const router = Router()

// 分类管理
router.get('/categories', authMiddleware, categoryController.list)
router.get('/categories/options', authMiddleware, categoryController.options)
router.get('/categories/:id', authMiddleware, categoryController.getById)
router.post('/categories', authMiddleware, categoryController.create)
router.put('/categories/:id', authMiddleware, categoryController.update)
router.delete('/categories/:id', authMiddleware, categoryController.remove)

// 标签管理
router.get('/tags', authMiddleware, tagController.list)
router.get('/tags/options', authMiddleware, tagController.options)
router.get('/tags/:id', authMiddleware, tagController.getById)
router.post('/tags', authMiddleware, tagController.create)
router.put('/tags/:id', authMiddleware, tagController.update)
router.delete('/tags/:id', authMiddleware, tagController.remove)

// 内容管理
router.get('/contents', authMiddleware, contentController.list)
router.get('/contents/:id', authMiddleware, contentController.getById)
router.post('/contents', authMiddleware, contentController.create)
router.put('/contents/:id', authMiddleware, contentController.update)
router.delete('/contents/:id', authMiddleware, contentController.remove)

export default router