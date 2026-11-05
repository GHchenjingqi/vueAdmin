import { Router } from 'express'
import { validate } from '../../../middleware/validate.js'
import { trackEventSchema } from '../../../shared/schemas/storefront.js'
import * as analyticsController from '../controllers/analyticsController.js'

/**
 * 服务端 CAPI 埋点公开路由（免 admin 鉴权，走 siteContext）
 *   POST /track-event  GA4 九事件 + refund；purchase/refund 以订单快照为准
 */
const router = Router()

router.post('/track-event', validate(trackEventSchema, 'body'), analyticsController.trackEvent)

export default router
