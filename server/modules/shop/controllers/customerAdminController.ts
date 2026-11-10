import type { NextFunction, Request, Response } from 'express'
import { Op } from 'sequelize'
import { AppError } from '../../../middleware/errorHandler.js'
import { getTenantContext } from '../../tenant/context.js'
import { ShopCustomer } from '../models/index.js'
import * as membershipService from '../services/membershipService.js'
import { queryInt } from '../utils/query.js'

/** admin JWT 上下文（与 currencyConfigController.adminOf 同法） */
function adminOf(req: Request): { tenantId: number; userId: number } {
  const user = (req as unknown as { user?: { id?: number } }).user
  return { tenantId: getTenantContext()?.tenantId ?? 1, userId: user?.id ?? 0 }
}

/**
 * 后台会员管理（admin JWT）——管理 C 端顾客（customers 体系），与后台用户管理（users 体系）无关：
 * - GET /customers：顾客列表（email/nickname/status/tier/points/growthValue，关键字搜索，分页）
 * - GET /customers/:id：详情 + 会员视图 + 积分流水
 * - PATCH /customers/:id/status：启用/禁用（blocked 顾客无法登录）
 * - POST /customers/:id/points：手工调积分（正负，流水可溯）
 */
export const list = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tenantId } = adminOf(req)
    const page = req.query.page ? queryInt(req.query.page) ?? 1 : 1
    const pageSize = req.query.pageSize ? queryInt(req.query.pageSize) ?? 20 : 20
    const keyword = typeof req.query.keyword === 'string' ? req.query.keyword.trim() : ''
    const status = typeof req.query.status === 'string' ? req.query.status : ''
    const where: Record<string, unknown> = { tenantId }
    if (keyword) {
      Object.assign(where, {
        [Op.or]: [
          { email: { [Op.like]: `%${keyword}%` } },
          { nickname: { [Op.like]: `%${keyword}%` } },
        ],
      })
    }
    if (status === 'active' || status === 'blocked') Object.assign(where, { status })
    const { rows, count } = await ShopCustomer.findAndCountAll({
      where,
      attributes: { exclude: ['passwordHash'] },
      order: [['createdAt', 'DESC']],
      offset: (page - 1) * pageSize,
      limit: pageSize,
    })
    res.json({ code: 0, data: { list: rows, total: count, page, pageSize } })
  } catch (err) {
    next(err)
  }
}

export const getById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tenantId } = adminOf(req)
    const id = Number(req.params.id)
    const customer = await ShopCustomer.findOne({ where: { tenantId, id }, attributes: { exclude: ['passwordHash'] } })
    if (!customer) throw new AppError(404, '顾客不存在')
    const logsPage = req.query.logsPage ? queryInt(req.query.logsPage) ?? 1 : 1
    const logs = await membershipService.listPointsLogs(tenantId, id, logsPage, 10)
    const membership = await membershipService.getMembership(tenantId, id)
    res.json({ code: 0, data: { customer, membership, pointsLogs: logs } })
  } catch (err) {
    next(err)
  }
}

export const updateStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tenantId } = adminOf(req)
    const id = Number(req.params.id)
    const status = req.body?.status
    if (status !== 'active' && status !== 'blocked') throw new AppError(400, 'status 必须为 active/blocked')
    const customer = await ShopCustomer.findOne({ where: { tenantId, id } })
    if (!customer) throw new AppError(404, '顾客不存在')
    await customer.update({ status })
    res.json({ code: 0, data: { id, status } })
  } catch (err) {
    next(err)
  }
}

export const adjustPoints = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tenantId, userId } = adminOf(req)
    const id = Number(req.params.id)
    const change = Number(req.body?.change)
    const note = typeof req.body?.note === 'string' ? req.body.note.slice(0, 255) : undefined
    const result = await membershipService.adjustPoints(tenantId, id, change, { type: 'admin', id: userId }, note)
    res.json({ code: 0, data: { id, points: result.points } })
  } catch (err) {
    next(err)
  }
}
