import { Router } from 'express'
import { validate } from '../../../middleware/validate.js'
import {
  storefrontCategoryQuerySchema,
  storefrontProductQuerySchema,
  storefrontRateQuerySchema,
  storefrontSlugParamSchema,
} from '../../../shared/schemas/storefront.js'
import * as catalogController from '../controllers/catalogController.js'
import { siteContext } from '../middleware/siteContext.js'

/**
 * Storefront 公开接口路由
 *
 * 挂载于 server/app.ts 的 /api/storefront/v1，不走 admin 鉴权。
 * health 在 siteContext 之前（不查库），其余路由统一注入站点 + 租户上下文。
 */
const router = Router()

router.get('/health', catalogController.health)

router.use(siteContext)

router.get('/categories', validate(storefrontCategoryQuerySchema, 'query'), catalogController.categories)
router.get('/products', validate(storefrontProductQuerySchema, 'query'), catalogController.products)
router.get('/products/:slug', validate(storefrontSlugParamSchema, 'params'), catalogController.productDetail)
router.get('/rates/snapshot', validate(storefrontRateQuerySchema, 'query'), catalogController.rates)

export default router
