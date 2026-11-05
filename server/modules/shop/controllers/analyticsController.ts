import type { Request, Response, NextFunction } from 'express'
import * as analyticsService from '../services/analyticsService.js'
import type { AnalyticsQuery } from '../../../shared/schemas/shop.js'
import { queryInt, queryStr } from '../utils/query.js'

function parseQuery(req: Request): AnalyticsQuery {
  const dim = queryStr(req.query.dimension)
  const dimension = dim && ['day', 'month', 'channel', 'category'].includes(dim) ? (dim as AnalyticsQuery['dimension']) : 'day'
  return {
    startAt: queryStr(req.query.startAt),
    endAt: queryStr(req.query.endAt),
    dimension,
    channelId: queryInt(req.query.channelId),
  }
}

export const sales = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ code: 0, data: await analyticsService.salesReport(parseQuery(req)) })
  } catch (err) {
    next(err)
  }
}

export const profit = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ code: 0, data: await analyticsService.profitReport(parseQuery(req)) })
  } catch (err) {
    next(err)
  }
}

export const turnover = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ code: 0, data: await analyticsService.inventoryTurnover(parseQuery(req)) })
  } catch (err) {
    next(err)
  }
}

/** G4 埋点对账：查询原始埋点事件（eventName/dispatchStatus/orderId 过滤，limit 1..500） */
export const listEvents = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({
      code: 0,
      data: await analyticsService.listEventsForReconcile({
        eventName: queryStr(req.query.eventName),
        dispatchStatus: queryStr(req.query.dispatchStatus),
        orderId: queryInt(req.query.orderId),
        limit: queryInt(req.query.limit),
      }),
    })
  } catch (err) {
    next(err)
  }
}
