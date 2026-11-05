import { Router } from 'express'
import { validate } from '../../../middleware/validate.js'
import { cmsListQuerySchema, cmsSlugParamSchema } from '../../../shared/schemas/storefront.js'
import * as cmsController from '../controllers/cmsController.js'

/**
 * 内容管理（CMS）公开路由（免 admin 鉴权，站点上下文由 router 外层注入）
 * 挂载于 /api/storefront/v1：
 *   GET /cms/articles          公开文章列表（仅 published + 分页 + tag/keyword 过滤）
 *   GET /cms/articles/:slug    文章详情（仅 published；不存在/未发布 → 404）
 */
const router = Router()

router.get('/cms/articles', validate(cmsListQuerySchema, 'query'), cmsController.listArticles)
router.get('/cms/articles/:slug', validate(cmsSlugParamSchema, 'params'), cmsController.getArticle)

export default router
