import { Router } from 'express'
import * as dictTypeController from '../controllers/dictTypeController.js'

const router = Router()

// 特殊端点放在 /:id 之前
router.get('/all', dictTypeController.all)
router.get('/', dictTypeController.list)
router.get('/:id', dictTypeController.getById)
router.post('/', dictTypeController.create)
router.put('/:id', dictTypeController.update)
router.delete('/:id', dictTypeController.remove)

export default router