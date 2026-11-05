import { Router } from 'express'
import { validate } from '../../../middleware/validate.js'
import { trackOrderParamSchema, trackOrderQuerySchema } from '../../../shared/schemas/storefront.js'
import * as trackingController from '../controllers/trackingController.js'

/**
 * 物流轨迹公开路由（免 admin 鉴权，走 siteContext）
 *   GET /track/:orderNo?accessToken= —— 订单号 + 访问凭证双要素，防枚举
 */
const router = Router()

router.get(
  '/track/:orderNo',
  validate(trackOrderParamSchema, 'params'),
  validate(trackOrderQuerySchema, 'query'),
  trackingController.getTracking,
)

export default router
