import type { NextFunction, Request, Response } from 'express'
import { getSite } from '../middleware/siteContext.js'
import * as trackingService from '../services/trackingService.js'

/** GET /track/:orderNo?accessToken= —— 凭双要素查物流轨迹（防枚举，不匹配 404） */
export const getTracking = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const site = getSite(res)
    const orderNo = String((req.params as Record<string, unknown>).orderNo ?? '')
    const q = req.query as Record<string, unknown>
    const accessToken = typeof q.accessToken === 'string' ? q.accessToken : ''
    const data = await trackingService.getOrderTracking(site, orderNo, accessToken)
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}
