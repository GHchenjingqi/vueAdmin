import { Router } from 'express'
import { authMiddleware } from '../../middleware/auth.js'
import { requireAdmin } from '../../middleware/requireAdmin.js'
import * as controller from './controller.js'

/** admin：GET /api/v1/experiments */
export const adminRouter = Router()
adminRouter.get('/', authMiddleware, requireAdmin, controller.list)

/** 公开：GET /api/storefront/v1/experiments/:key/assign?subjectId= */
export const publicRouter = Router()
publicRouter.get('/:key/assign', controller.assign)
