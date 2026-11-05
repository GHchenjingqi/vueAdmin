import { Router } from 'express'
import { validate } from '../../../middleware/validate.js'
import { customerAuth } from '../middleware/customerAuth.js'
import { rmaSubmitSchema, rmaIdParamSchema, rmaTrackSchema } from '../../../shared/schemas/storefront.js'
import * as rmaController from '../controllers/rmaController.js'

/**
 * 退货/售后公开路由（需顾客登录，挂载于 /api/storefront/v1/rma）
 *   POST   /rma             提交退货申请（校验订单归属 + 可退状态 + 服务端重算退款）
 *   GET    /rma             当前顾客的退货申请列表
 *   GET    /rma/:id        单条详情（非本人 → 404）
 *   POST   /rma/:id/cancel 取消申请（仅 pending）
 *   POST   /rma/:id/track  提交回寄物流单号（仅 approved → returned）
 */
const router = Router()

router.post('/', customerAuth, validate(rmaSubmitSchema, 'body'), rmaController.submitRma)
router.get('/', customerAuth, rmaController.listMyRmas)
router.get('/:id', customerAuth, validate(rmaIdParamSchema, 'params'), rmaController.getMyRma)
router.post('/:id/cancel', customerAuth, validate(rmaIdParamSchema, 'params'), rmaController.cancelRma)
router.post(
  '/:id/track',
  customerAuth,
  validate(rmaIdParamSchema, 'params'),
  validate(rmaTrackSchema, 'body'),
  rmaController.submitTracking,
)

export default router
