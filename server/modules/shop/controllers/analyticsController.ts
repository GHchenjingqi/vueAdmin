import type { Request, Response, NextFunction } from 'express'
import * as analyticsService from '../services/analyticsService.js'
import type { AnalyticsQuery } from '../../../shared/schemas/shop.js'
import { queryInt, queryStr } from '../utils/query.js'

function parseQuery(req: Request): AnalyticsQuery {
  const dim = queryStr(req.query.dimension)
  const allowed = ['day', 'month', 'channel', 'category', 'country', 'utm'] as const
  const dimension = dim && (allowed as readonly string[]).includes(dim) ? (dim as AnalyticsQuery['dimension']) : 'day'
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

/** P6 推荐效果看板：CTR 聚合（曝光/点击/CTR，按 placement+strategy 分组） */
export const recoCtr = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({
      code: 0,
      data: await analyticsService.recommendationCtrReport({
        startAt: queryStr(req.query.startAt),
        endAt: queryStr(req.query.endAt),
      }),
    })
  } catch (err) {
    next(err)
  }
}

/** 搜索热词看板（admin 运营增强）：复用 search 事件，别名归并到 canonical */
export const searchHot = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({
      code: 0,
      data: await analyticsService.searchHotReport({
        startAt: queryStr(req.query.startAt),
        endAt: queryStr(req.query.endAt),
        limit: queryInt(req.query.limit),
      }),
    })
  } catch (err) {
    next(err)
  }
}

/** 搜索转化漏斗看板（admin 运营增强）：search→view_item→add_to_cart→purchase，按 sessionId 串联 */
export const searchFunnel = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({
      code: 0,
      data: await analyticsService.searchFunnelReport({
        startAt: queryStr(req.query.startAt),
        endAt: queryStr(req.query.endAt),
      }),
    })
  } catch (err) {
    next(err)
  }
}
