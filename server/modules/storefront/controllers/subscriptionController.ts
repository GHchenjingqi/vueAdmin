import type { NextFunction, Request, Response } from 'express'
import { getSite } from '../middleware/siteContext.js'
import * as subscriptionService from '../services/subscriptionService.js'

/**
 * 订阅与到货通知控制器（阶段 5 步骤 5）
 * 请求体已由 validate 中间件按 schema 校验并替换为解析结果，此处直接透传 req.body。
 */

/** POST /newsletter/subscribe */
export const subscribeNewsletter = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const site = getSite(res)
    const data = await subscriptionService.subscribeNewsletter(site, req.body)
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}

/** POST /newsletter/unsubscribe */
export const unsubscribeNewsletterPost = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await subscriptionService.unsubscribeNewsletter(getSite(res), req.body?.token)
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}

/** GET /newsletter/unsubscribe?token= （邮件一键退订链接） */
export const unsubscribeNewsletterGet = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = typeof req.query.token === 'string' ? req.query.token : ''
    const data = await subscriptionService.unsubscribeNewsletter(getSite(res), token)
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}

/** POST /restock/subscribe */
export const subscribeRestock = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const site = getSite(res)
    const data = await subscriptionService.subscribeRestock(site, req.body)
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}
