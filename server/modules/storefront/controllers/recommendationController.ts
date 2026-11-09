import type { NextFunction, Request, Response } from 'express'
import { AppError } from '../../../middleware/errorHandler.js'
import { getSite } from '../middleware/siteContext.js'
import { listRecommendedBundles } from '../services/bundleService.js'

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
