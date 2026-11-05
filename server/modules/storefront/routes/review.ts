import { Router } from 'express'
import { validate } from '../../../middleware/validate.js'
import {
  reviewListQuerySchema,
  reviewSubmitSchema,
  reviewHelpfulParamSchema,
  qaListQuerySchema,
  qaSubmitSchema,
} from '../../../shared/schemas/storefront.js'
import * as reviewController from '../controllers/reviewController.js'
import * as reviewImageController from '../controllers/reviewImageController.js'

/**
 * 商品评价与问答公开路由（免 admin 鉴权，站点上下文由 router 外层注入）
 * 挂载于 /api/storefront/v1：
 *   GET  /reviews?spuId=&page=&pageSize=   公开评价列表（approved + 汇总）
 *   POST /reviews                          提交评价（游客/登录，pending 审核）
 *   POST /reviews/:id/helpful              标记有用
 *   GET  /qa?spuId=                       公开问答列表（answered）
 *   POST /qa                              提交问题（pending 待回答）
 *   POST /reviews/images                  上传评价图片（图片专用，含魔数 + 分辨率校验）
 *   DELETE /reviews/images/:id            删除评价图片（防遍历）
 */
const router = Router()

router.get('/reviews', validate(reviewListQuerySchema, 'query'), reviewController.listReviews)
router.post('/reviews', validate(reviewSubmitSchema, 'body'), reviewController.submitReview)
router.post('/reviews/:id/helpful', validate(reviewHelpfulParamSchema, 'params'), reviewController.markHelpful)
router.get('/qa', validate(qaListQuerySchema, 'query'), reviewController.listQuestions)
router.post('/qa', validate(qaSubmitSchema, 'body'), reviewController.submitQuestion)
router.post('/reviews/images', reviewImageController.uploadReviewImages)
router.delete('/reviews/images/:id', reviewImageController.removeReviewImage)

export default router
