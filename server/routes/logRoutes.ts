import { Router } from 'express'
import * as logController from '../controllers/logController.js'

const router = Router()

// RESTful 规范: GET /api/logs
router.get('/', logController.list)

// RESTful 规范: GET /api/logs/:id
router.get('/:id', logController.getById)

export default router