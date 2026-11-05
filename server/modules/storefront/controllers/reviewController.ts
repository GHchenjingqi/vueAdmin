import type { NextFunction, Request, Response } from 'express'
import { getSite } from '../middleware/siteContext.js'
import * as reviewService from '../services/reviewService.js'
import type { ReviewAuth } from '../services/reviewService.js'

/** 从请求中抽取登录顾客身份（游客为空） */
function authOf(req: Request): ReviewAuth | undefined {
  if (!req.customer) return undefined
  return { customerId: req.customer.customerId, email: req.customer.email }
}

/** GET /reviews —— 公开评价列表（仅 approved + 评分汇总） */
export const listReviews = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const site = getSite(res)
    const q = req.query as Record<string, unknown>
    const data = await reviewService.listReviews(site, {
      spuId: Number(q.spuId),
      page: q.page != null ? Number(q.page) : undefined,
      pageSize: q.pageSize != null ? Number(q.pageSize) : undefined,
    })
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}

/** POST /reviews —— 提交评价（游客/登录顾客，进入 pending 审核态） */
export const submitReview = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const site = getSite(res)
    const data = await reviewService.submitReview(site, req.body, authOf(req))
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}

/** POST /reviews/:id/helpful —— 标记有用 */
export const markHelpful = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const site = getSite(res)
    const id = Number((req.params as Record<string, unknown>).id)
    const data = await reviewService.markHelpful(site, id)
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}

/** GET /qa —— 公开问答列表（仅 answered） */
export const listQuestions = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const site = getSite(res)
    const q = req.query as Record<string, unknown>
    const data = await reviewService.listQuestions(site, { spuId: Number(q.spuId) })
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}

/** POST /qa —— 提交问题（进入 pending 待回答） */
export const submitQuestion = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const site = getSite(res)
    const data = await reviewService.submitQuestion(site, req.body, authOf(req))
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}
