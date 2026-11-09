import { Router } from 'express'
import { authMiddleware } from '../../../middleware/auth.js'
import { platformOnly } from '../../../middleware/platformGuard.js'
import { requirePermission } from '../../../middleware/permissionGuard.js'
import { validate } from '../../../middleware/validate.js'
import { provisionTenantSchema, updateTenantSchema, tenantQuerySchema, tenantStatusSchema } from '../../../shared/schemas/tenant.js'
import * as tenantController from '../controllers/tenantController.js'

const router = Router()

router.get('/tenants', authMiddleware, platformOnly, validate(tenantQuerySchema, 'query'), tenantController.list)

// 自助接口：任何登录用户读取自己所在租户的品牌，不需要平台身份
router.get('/tenants/current', authMiddleware, tenantController.current)

router.get('/tenants/:id', authMiddleware, platformOnly, tenantController.detail)

router.post('/tenants', authMiddleware, platformOnly, requirePermission('system:tenant:provision'), validate(provisionTenantSchema), tenantController.provision)

router.put('/tenants/:id', authMiddleware, platformOnly, requirePermission('system:tenant:edit'), validate(updateTenantSchema), tenantController.update)

router.patch(
  '/tenants/:id/status',
  authMiddleware,
  platformOnly,
  requirePermission('system:tenant:disable'),
  validate(tenantStatusSchema),
  tenantController.setStatus,
)

export default router
