import { Router } from 'express'
import * as deptController from '../controllers/deptController.js'
import { validate } from '../middleware/validate.js'
import { createDeptSchema, updateDeptSchema, deptQuerySchema } from '../validators/dept.js'
import { idParamSchema } from '../validators/common.js'

const router = Router()

// 特殊端点放在 /:id 之前
router.get('/options', deptController.options)

// RESTful
router.get('/', validate(deptQuerySchema, 'query'), deptController.list)
router.get('/:id', validate(idParamSchema, 'params'), deptController.getById)
router.post('/', validate(createDeptSchema, 'body'), deptController.create)
router.put('/:id', validate(idParamSchema, 'params'), validate(updateDeptSchema, 'body'), deptController.update)
router.delete('/:id', validate(idParamSchema, 'params'), deptController.remove)

export default router