import { Router } from 'express'
import { validate } from '../../../middleware/validate.js'
import { cmsListQuerySchema, cmsSlugParamSchema, bannerListQuerySchema, faqListQuerySchema } from '../../../shared/schemas/storefront.js'
import * as cmsController from '../controllers/cmsController.js'

/**
 * 内容管理（CMS）公开路由（免 admin 鉴权，站点上下文由 router 外层注入）
 * 挂载于 /api/storefront/v1：
 *   GET /cms/articles          公开文章列表（仅 published + 分页 + tag/keyword 过滤）
 *   GET /cms/articles/:slug    文章详情（仅 published；不存在/未发布 → 404）
 *   GET /cms/banners           公开首页 Banner（仅启用 + 时段内，按 sortOrder）
 *   GET /cms/faqs              公开 FAQ 列表（tags 含 'faq' + published；复用 articles 表）
 *   GET /cms/faqs/:slug        FAQ 详情（仅 published + 含 'faq' 标记）
 */
const router = Router()

router.get('/cms/articles', validate(cmsListQuerySchema, 'query'), cmsController.listArticles)
router.get('/cms/articles/:slug', validate(cmsSlugParamSchema, 'params'), cmsController.getArticle)
router.get('/cms/banners', validate(bannerListQuerySchema, 'query'), cmsController.listBanners)
router.get('/cms/faqs', validate(faqListQuerySchema, 'query'), cmsController.listFaqs)
router.get('/cms/faqs/:slug', validate(cmsSlugParamSchema, 'params'), cmsController.getFaq)

export default router
