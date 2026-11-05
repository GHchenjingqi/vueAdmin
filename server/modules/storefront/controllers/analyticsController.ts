import type { NextFunction, Request, Response } from 'express'
import { getSite } from '../middleware/siteContext.js'
import * as analyticsService from '../services/analyticsService.js'

/** POST /track-event —— 服务端 CAPI 埋点上报（幂等 + 同意门控 + 服务端事实校准） */
export const trackEvent = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const site = getSite(res)
    // body 已由 Zod 校验，.params 为开放字典；透传给 service 做白名单与事实校验
    const data = await analyticsService.recordEvent(site, req.body)
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}
