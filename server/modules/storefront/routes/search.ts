import { Router } from 'express'
import { validate } from '../../../middleware/validate.js'
import * as searchService from '../services/searchService.js'
import { storefrontSearchQuerySchema, storefrontSearchHotQuerySchema, storefrontSearchFallbackQuerySchema } from '../../../shared/schemas/storefront.js'

/**
 * Storefront 搜索增强路由（挂在 /api/storefront/v1/search）
 * 全部公开（游客可访问）。纯读、零写、零新表。
 * - GET /suggest   纠错建议（Levenshtein 距离）
 * - GET /hot-keywords  热搜词（聚合 search 埋点）
 * - GET /fallback  无结果兜底（同分类/全站热门）
 */
const router = Router()

router.get('/suggest', validate(storefrontSearchQuerySchema, 'query'), searchService.suggest)
router.get('/hot-keywords', validate(storefrontSearchHotQuerySchema, 'query'), searchService.hotKeywords)
router.get('/fallback', validate(storefrontSearchFallbackQuerySchema, 'query'), searchService.fallbackForNoResults)

export default router
