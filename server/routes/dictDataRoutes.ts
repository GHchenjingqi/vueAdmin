import { Router } from 'express'
import * as dictDataController from '../controllers/dictDataController.js'

const router = Router()

// 特殊端点放在 /:id 之前
router.get('/options/:dictType', dictDataController.options)
router.get('/', dictDataController.list)
router.get('/:id', dictDataController.getById)
router.post('/', dictDataController.create)
router.put('/:id', dictDataController.update)
router.delete('/:id', dictDataController.remove)

export default router