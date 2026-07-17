import { Router } from 'express'
import * as roleController from '../controllers/roleController.js'

const router = Router()

// 特殊端点放在 /:id 之前
router.get('/all', roleController.all)

// RESTful
router.get('/', roleController.list)
router.get('/:id', roleController.getById)
router.post('/', roleController.create)
router.put('/:id', roleController.update)
router.delete('/:id', roleController.remove)

export default router