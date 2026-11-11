import type { NextFunction, Request, Response } from 'express'
import * as viewHistoryService from '../services/viewHistoryService.js'

/**
 * Storefront 浏览历史接口（游客 + 登录顾客共用）：
 * - GET /view-history?sessionId=&limit=  最近浏览（登录顾客按 customerId；游客按 sessionId）
 * 可选顾客身份（optionalCustomerAuth）：有 Bearer 则用 customerId，无则回退 sessionId。
 */
export const list = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = req.query as Record<string, unknown>
    const limit = Number(q.limit) > 0 ? Math.min(Number(q.limit), 50) : 20
    const customerId = req.customer?.customerId
    const sessionId = typeof q.sessionId === 'string' ? q.sessionId.slice(0, 64) : undefined

    if (!customerId && !sessionId) {
      res.json({ code: 0, data: { items: [] } })
      return
    }

    const items = await viewHistoryService.listViewHistory({ customerId, sessionId }, limit)
    res.json({ code: 0, data: { items } })
  } catch (err) {
    next(err)
  }
}

export const viewHistoryController = { list }
