import type { Request, Response, NextFunction } from 'express'
import { AppError } from '../../../middleware/errorHandler.js'
import * as orderMailService from '../services/orderMailService.js'

/** GET /shop/order-mails?orderId= —— 某订单的邮件流水（租户隔离） */
export const list = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orderId = Number((req.query as Record<string, unknown>).orderId)
    if (!Number.isInteger(orderId) || orderId <= 0) throw new AppError(400, 'orderId 必须为正整数')
    res.json({ code: 0, data: await orderMailService.listOrderMails(orderId) })
  } catch (err) {
    next(err)
  }
}

/** POST /shop/order-mails/drain —— 触发一次到期邮件投递（可挂定时任务） */
export const drain = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = Number((req.body as Record<string, unknown> | undefined)?.limit)
    res.json({ code: 0, data: await orderMailService.drainOutbox({ limit: Number.isInteger(limit) ? limit : undefined }) })
  } catch (err) {
    next(err)
  }
}

/** POST /shop/order-mails/:id/retry —— 终态 / 失败邮件重新入队 */
export const retry = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = Number((req.params as Record<string, unknown>).id)
    const row = await orderMailService.retryMail(id)
    if (!row) throw new AppError(404, '邮件记录不存在')
    res.json({ code: 0, data: row })
  } catch (err) {
    next(err)
  }
}
