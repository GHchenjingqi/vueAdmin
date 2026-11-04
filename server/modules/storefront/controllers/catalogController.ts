import type { NextFunction, Request, Response } from 'express'
import type { StorefrontProductQuery } from '../../../shared/schemas/storefront.js'
import { getSite } from '../middleware/siteContext.js'
import * as catalogService from '../services/catalogService.js'

/** 健康检查：不查库、不依赖站点上下文 */
export const health = (_req: Request, res: Response) => {
  res.json({ code: 0, data: { ok: true, service: 'storefront', time: new Date().toISOString() } })
}

export const categories = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const site = getSite(res)
    const lang = typeof req.query.lang === 'string' && req.query.lang ? req.query.lang : site.defaultLocale
    const data = await catalogService.listCategories(lang)
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}

export const products = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const site = getSite(res)
    const data = await catalogService.listProducts(req.query as never as StorefrontProductQuery, {
      currency: site.defaultCurrency,
      lang: site.defaultLocale,
    })
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}

export const productDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const site = getSite(res)
    const data = await catalogService.getProductBySlug(String(req.params.slug ?? ''), {
      currency: site.defaultCurrency,
      lang: site.defaultLocale,
    })
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}

export const rates = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const base = typeof req.query.base === 'string' && req.query.base ? req.query.base : getSite(res).defaultCurrency
    const data = await catalogService.getRateSnapshot(base)
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}
