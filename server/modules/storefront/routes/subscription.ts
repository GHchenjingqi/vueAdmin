import { Router } from 'express'
import { validate } from '../../../middleware/validate.js'
import {
  newsletterSubscribeSchema,
  newsletterUnsubscribeSchema,
  restockSubscribeSchema,
} from '../../../shared/schemas/storefront.js'
import * as subscriptionController from '../controllers/subscriptionController.js'

/**
 * 订阅与到货通知公开路由（免 admin 鉴权，站点上下文由 router 外层注入）
 * 挂载于 /api/storefront/v1：
 *   POST /newsletter/subscribe
 *   POST /newsletter/unsubscribe
 *   GET  /newsletter/unsubscribe?token=   （邮件一键退订链接）
 *   POST /restock/subscribe
 */
const router = Router()

router.post('/newsletter/subscribe', validate(newsletterSubscribeSchema, 'body'), subscriptionController.subscribeNewsletter)
router.post('/newsletter/unsubscribe', validate(newsletterUnsubscribeSchema, 'body'), subscriptionController.unsubscribeNewsletterPost)
router.get('/newsletter/unsubscribe', validate(newsletterUnsubscribeSchema, 'query'), subscriptionController.unsubscribeNewsletterGet)
router.post('/restock/subscribe', validate(restockSubscribeSchema, 'body'), subscriptionController.subscribeRestock)

export default router
