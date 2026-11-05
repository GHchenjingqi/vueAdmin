import type { NextFunction, Request, Response } from 'express'
import { getSite } from '../middleware/siteContext.js'
import { getActiveCurrency } from '../services/currencyConfig.js'

/**
 * GET /api/storefront/v1/store-config（P1-T06）
 * 单一启用币种下发：{currency, market, version}；缓存 30s（C8：≤60s 前台生效）。
 * 配置缺失/非法 → 503 fail-closed（C7，禁止默认 USD）。
 */
export const config = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const site = getSite(res)
    const currency = await getActiveCurrency()
    res.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=30')
    res.json({
      code: 0,
      data: {
        currency,
        market: { country: 'US', language: site.defaultLocale },
        version: new Date().toISOString(),
      },
    })
  } catch (err) {
    next(err)
  }
}
