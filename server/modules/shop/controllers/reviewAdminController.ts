import type { NextFunction, Request, Response } from 'express'
import * as reviewAdminService from '../services/reviewAdminService.js'
import type { QaAnswerInput } from '../../../shared/schemas/shop.js'
import { queryInt, queryStr } from '../utils/query.js'

/**
 * 商品评价 / 问答后台审核控制器
 *
 * 与 RMA 后台审批端点保持同一权限口径：authMiddleware（管理端 JWT + 租户上下文）。
 * 是否进一步约束为 requireAdmin / 客服角色，取决于 G4-S2 权限矩阵业务决策，不代改。
 */

/** 回答者标识只取 JWT，不接受请求体伪造 */
function answeredByOf(req: Request): string {
  const user = (req as unknown as { user?: { username?: string } }).user
  return user?.username?.slice(0, 64) || 'admin'
}

/** GET /shop/reviews —— 后台评价列表（status / spuId 过滤，分页） */
export const listReviews = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await reviewAdminService.listReviews({
      status: queryStr(req.query.status),
      spuId: queryInt(req.query.spuId),
      limit: queryInt(req.query.limit),
      offset: queryInt(req.query.offset),
    })
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}

/** GET /shop/qa —— 后台问答列表（status / spuId 过滤，分页） */
export const listQuestions = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await reviewAdminService.listQuestions({
      status: queryStr(req.query.status),
      spuId: queryInt(req.query.spuId),
      limit: queryInt(req.query.limit),
      offset: queryInt(req.query.offset),
    })
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}

/** POST /shop/reviews/:id/approve —— 审核通过（仅 pending，CAS） */
export const approveReview = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ code: 0, data: await reviewAdminService.approveReview(Number(req.params.id)) })
  } catch (err) {
    next(err)
  }
}

/** POST /shop/reviews/:id/reject —— 驳回（仅 pending，CAS） */
export const rejectReview = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ code: 0, data: await reviewAdminService.rejectReview(Number(req.params.id)) })
  } catch (err) {
    next(err)
  }
}

/** POST /shop/qa/:id/answer —— 回答提问（仅 pending，CAS，答案与时间一并固化） */
export const answerQuestion = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = req.body as QaAnswerInput
    const data = await reviewAdminService.answerQuestion(Number(req.params.id), body.answer, answeredByOf(req))
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}

/** POST /shop/qa/:id/hide —— 隐藏问答（pending / answered，CAS） */
export const hideQuestion = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ code: 0, data: await reviewAdminService.hideQuestion(Number(req.params.id)) })
  } catch (err) {
    next(err)
  }
}
