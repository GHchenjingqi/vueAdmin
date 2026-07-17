import { Router } from 'express'
import * as noticeController from '../controllers/noticeController.js'

const router = Router()

// SSE 实时推送
router.get('/sse', noticeController.sse)

// 特殊端点放在 /:id 之前
router.post('/read', noticeController.markAllRead)

// RESTful
router.get('/', noticeController.list)
router.get('/:id', noticeController.getById)
router.post('/', noticeController.create)
router.put('/:id', noticeController.update)
router.delete('/:id', noticeController.remove)

// 标记已读
router.post('/:id/read', noticeController.markRead)

export default router