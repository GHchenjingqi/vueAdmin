import type { NextFunction, Request, Response } from 'express'
import * as membershipService from '../../shop/services/membershipService.js'
import { queryInt } from '../../shop/utils/query.js'

/**
 * Storefront 会员接口（顾客 JWT）：
 * - GET /membership：我的会员（等级/积分/成长值/下一级进度）
 * - GET /membership/points-logs：我的积分流水（分页）
 */
export const getMyMembership = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tenantId, customerId } = req.customer!
    const data = await membershipService.getMembership(tenantId, customerId)
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}

export const getMyPointsLogs = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tenantId, customerId } = req.customer!
    const page = req.query.page ? queryInt(req.query.page) : undefined
    const pageSize = req.query.pageSize ? queryInt(req.query.pageSize) : undefined
    const data = await membershipService.listPointsLogs(tenantId, customerId, page ?? 1, pageSize ?? 20)
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}
