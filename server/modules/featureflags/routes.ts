import { Router } from 'express'
import { authMiddleware } from '../../middleware/auth.js'
import { requireAdmin } from '../../middleware/requireAdmin.js'
import * as flagsController from './flagsController.js'

const router = Router()

// admin 面（auth + 平台超管）
router.get('/', authMiddleware, requireAdmin, flagsController.list)
router.put('/:key', authMiddleware, requireAdmin, flagsController.update)

export default router
