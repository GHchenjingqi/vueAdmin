import type { NextFunction, Request, Response } from 'express'
import { AppError } from '../../../middleware/errorHandler.js'
import { getSite } from '../middleware/siteContext.js'
import { listRecommendedBundles } from '../services/bundleService.js'
import {
  crossSellForCart,
  relatedForProduct,
  homeForYou,
} from '../services/recommendationService.js'

/**
 * P5-T05 推荐位：返回指定 placement 的 active Bundle（搭配购/推荐位）。
 * GET /api/storefront/v1/recommendations?placement=<slot>&currency=<ISO4217>
 * currency 缺省取站点默认币种。
 */
export const recommendations = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const site = getSite(res)
    const placement = typeof req.query.placement === 'string' && req.query.placement ? req.query.placement : 'default'
    const currency = (typeof req.query.currency === 'string' && req.query.currency ? req.query.currency : site.defaultCurrency).toUpperCase()
    if (!/^[A-Z]{3}$/.test(currency)) throw new AppError(400, '币种格式不合法')
    if (placement.length > 50) throw new AppError(400, 'placement 过长')
    const bundles = await listRecommendedBundles(placement, currency)
    res.json({ code: 0, data: { placement, currency, bundles } })
  } catch (err) {
    next(err)
  }
}

/**
 * P6 相关商品：详情页「看了又看」。
 * GET /api/storefront/v1/recommendations/related?productId=<spuId>&limit=<1-12>&currency=&lang=
 * 行为优先（买了又买：同支付订单共现 Top N）→ 同分类兜底。
 */
export const related = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const site = getSite(res)
    const productId = Number(req.query.productId)
    if (!Number.isInteger(productId) || productId <= 0) throw new AppError(400, 'productId 不合法')
    const limitRaw = Number(req.query.limit)
    const limit = Number.isInteger(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 12) : 6
    const currency =
      typeof req.query.currency === 'string' && /^[A-Z]{3}$/.test(req.query.currency)
        ? req.query.currency
        : site.defaultCurrency
    const lang = typeof req.query.lang === 'string' && req.query.lang ? req.query.lang : site.defaultLocale

    const result = await relatedForProduct({ id: productId }, { limit, currency, lang })
    res.json({ code: 0, data: result })
  } catch (err) {
    next(err)
  }
}

/**
 * P6 买了又买：购物车交叉销售。
 * POST /api/storefront/v1/recommendations/cross-sell  body: { lines: [{ skuId, qty }], limit?, currency?, lang? }
 * 聚合购物车所有 SKU 协同 Top N；协同为空时回退首个 SKU 的同分类。
 */
export const crossSell = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const site = getSite(res)
    const body = (req.body ?? {}) as {
      lines?: { skuId?: unknown; qty?: unknown }[]
      limit?: unknown
      currency?: unknown
      lang?: unknown
    }
    const lines = Array.isArray(body.lines)
      ? body.lines
          .map((l) => ({ skuId: Number(l.skuId), qty: Number(l.qty) }))
          .filter((l) => Number.isInteger(l.skuId) && l.skuId > 0 && Number.isInteger(l.qty) && l.qty > 0)
          .slice(0, 50)
      : []
    if (!lines.length) throw new AppError(400, 'lines 不合法')

    const limitRaw = Number(body.limit)
    const limit = Number.isInteger(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 12) : 6
    const currency =
      typeof body.currency === 'string' && /^[A-Z]{3}$/.test(body.currency)
        ? body.currency
        : site.defaultCurrency
    const lang = typeof body.lang === 'string' && body.lang ? body.lang : site.defaultLocale

    const result = await crossSellForCart(lines, { limit, currency, lang })
    res.json({ code: 0, data: result })
  } catch (err) {
    next(err)
  }
}

/**
 * P6 首页「为你推荐」：游客落地页（无 productId、无购物车）。
 * GET /api/storefront/v1/recommendations/home?limit=<1-12>&currency=&lang=
 * 全站热销（已支付订单频次）→ 最新公开兜底。
 */
export const homeRecommendations = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const site = getSite(res)
    const limitRaw = Number(req.query.limit)
    const limit = Number.isInteger(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 12) : 8
    const currency =
      typeof req.query.currency === 'string' && /^[A-Z]{3}$/.test(req.query.currency)
        ? req.query.currency
        : site.defaultCurrency
    const lang = typeof req.query.lang === 'string' && req.query.lang ? req.query.lang : site.defaultLocale

    const result = await homeForYou({ limit, currency, lang })
    res.json({ code: 0, data: result })
  } catch (err) {
    next(err)
  }
}
