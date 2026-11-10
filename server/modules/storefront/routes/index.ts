import { Router } from 'express'
import { validate } from '../../../middleware/validate.js'
import {
  storefrontCategoryQuerySchema,
  storefrontProductQuerySchema,
  storefrontRateQuerySchema,
  storefrontSlugParamSchema,
} from '../../../shared/schemas/storefront.js'
import * as catalogController from '../controllers/catalogController.js'
import * as storeConfigController from '../controllers/storeConfigController.js'
import { siteContext } from '../middleware/siteContext.js'
import authRouter from './auth.js'
import cartRouter from './cart.js'
import checkoutRouter from './checkout.js'
import paymentRouter from './payment.js'
import subscriptionRouter from './subscription.js'
import reviewRouter from './review.js'
import cmsRouter from './cms.js'
import rmaRouter from './rma.js'
import trackingRouter from './tracking.js'
import analyticsRouter from './analytics.js'
import addressRouter from './address.js'
import referralRouter from './referral.js'
import membershipRouter from './membership.js'
import monitoringRouter from './monitoring.js'
import * as flagsController from '../../featureflags/flagsController.js'
import { publicRouter as experimentsPublicRouter } from '../../experiments/routes.js'
import * as recommendationController from '../controllers/recommendationController.js'

/**
 * Storefront 公开接口路由
 *
 * 挂载于 server/app.ts 的 /api/storefront/v1，不走 admin 鉴权。
 * health 在 siteContext 之前（不查库），其余路由统一注入站点 + 租户上下文。
 * /auth 子路由继承此处建立的 siteContext，其自身再叠加 customerAuth。
 */
const router = Router()

router.get('/health', catalogController.health)

router.use(siteContext)

router.get('/categories', validate(storefrontCategoryQuerySchema, 'query'), catalogController.categories)
router.get('/products', validate(storefrontProductQuerySchema, 'query'), catalogController.products)
router.get('/products/:slug', validate(storefrontSlugParamSchema, 'params'), catalogController.productDetail)
router.get('/rates/snapshot', validate(storefrontRateQuerySchema, 'query'), catalogController.rates)

// ==================== Store Config（P1-T06：单一启用币种下发，settings 唯一数据源） ====================
router.get('/store-config', storeConfigController.config)

router.use('/auth', authRouter)
router.use('/cart', cartRouter)
router.use('/checkout', checkoutRouter)
router.use('/payments', paymentRouter)
router.use('/', subscriptionRouter)
router.use('/', reviewRouter)
router.use('/', cmsRouter)
router.use('/rma', rmaRouter)
router.use('/', trackingRouter)
router.use('/', analyticsRouter)
router.use('/addresses', addressRouter)
router.use('/referrals', referralRouter)
router.use('/membership', membershipRouter)
router.use('/monitoring', monitoringRouter)
router.get('/flags/:key', flagsController.publicCheck)
router.use('/experiments', experimentsPublicRouter)
router.get('/recommendations', recommendationController.recommendations)

export default router
