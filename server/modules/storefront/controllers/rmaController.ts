import type { NextFunction, Request, Response } from 'express'
import { getSite } from '../middleware/siteContext.js'
import * as rmaService from '../services/rmaService.js'
import type { RmaAuth } from '../services/rmaService.js'

/** 从请求中抽取登录顾客身份（RMA 强制登录，auth 必存在） */
function authOf(req: Request): RmaAuth {
  const c = req.customer!
  return { customerId: c.customerId, email: c.email }
}

/** POST /rma —— 提交退货申请（登录顾客） */
export const submitRma = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const site = getSite(res)
    const data = await rmaService.submitRma(site, req.body, authOf(req))
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}

/** GET /rma —— 当前顾客的退货申请列表 */
export const listMyRmas = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const site = getSite(res)
    const auth = authOf(_req)
    const data = await rmaService.listMyRmas(site, auth.customerId)
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}

/** GET /rma/:id —— 单条退货申请详情（非本人 → 404） */
export const getMyRma = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const site = getSite(res)
    const auth = authOf(req)
    const id = Number((req.params as Record<string, unknown>).id)
    const data = await rmaService.getMyRma(site, id, auth.customerId)
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}

/** POST /rma/:id/cancel —— 取消申请（仅 pending） */
export const cancelRma = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const site = getSite(res)
    const auth = authOf(req)
    const id = Number((req.params as Record<string, unknown>).id)
    const data = await rmaService.cancelRma(site, id, auth.customerId)
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}

/** POST /rma/:id/track —— 提交回寄物流单号（仅 approved） */
export const submitTracking = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const site = getSite(res)
    const auth = authOf(req)
    const id = Number((req.params as Record<string, unknown>).id)
    const trackingNo = ((req.body as Record<string, unknown>).trackingNo as string) ?? ''
    const data = await rmaService.submitReturnTracking(site, id, trackingNo, auth.customerId)
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}
