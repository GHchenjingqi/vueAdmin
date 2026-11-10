import type { NextFunction, Request, Response } from 'express'
import { getTenantContext } from '../../tenant/context.js'
import { AppError } from '../../../middleware/errorHandler.js'
import * as membershipService from '../services/membershipService.js'

function tenantOf(): number {
  return getTenantContext()?.tenantId ?? 1
}

/** GET /shop/membership-tiers：等级列表（含三维度门槛/折扣/策略） */
export const list = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ code: 0, data: await membershipService.listTiers(tenantOf()) })
  } catch (err) {
    next(err)
  }
}

/** POST /shop/membership-tiers：新增等级（后台自定义门槛） */
export const create = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = req.body ?? {}
    const tier = await membershipService.createTier(tenantOf(), {
      name: String(b.name ?? ''),
      level: Number(b.level ?? 0),
      growthThreshold: Number(b.growthThreshold ?? 0),
      loginFrequency: Number(b.loginFrequency ?? 0),
      orderCountThreshold: Number(b.orderCountThreshold ?? 0),
      discountPct: Number(b.discountPct ?? 0),
      matchStrategy: String(b.matchStrategy ?? 'any'),
    })
    res.status(201).json({ code: 0, data: tier })
  } catch (err) {
    next(err)
  }
}

/** PUT /shop/membership-tiers/:id：修改等级 */
export const update = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = req.body ?? {}
    const patch: Record<string, unknown> = {}
    for (const k of ['name', 'level', 'growthThreshold', 'loginFrequency', 'orderCountThreshold', 'discountPct', 'matchStrategy'] as const) {
      if (b[k] !== undefined) patch[k] = k === 'name' || k === 'matchStrategy' ? String(b[k]) : Number(b[k])
    }
    if (Object.keys(patch).length === 0) throw new AppError(400, '无更新字段')
    const tier = await membershipService.updateTier(tenantOf(), Number(req.params.id), patch)
    res.json({ code: 0, data: tier })
  } catch (err) {
    next(err)
  }
}

/** DELETE /shop/membership-tiers/:id：删除等级（有顾客挂级时 400） */
export const remove = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await membershipService.deleteTier(tenantOf(), Number(req.params.id))
    res.json({ code: 0, data: { id: Number(req.params.id) } })
  } catch (err) {
    next(err)
  }
}

/** POST /shop/membership-tiers/recalculate：门槛变更后重算全体顾客等级（allowDemote=true 时严格执行新门槛含降级） */
export const recalculate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const allowDemote = req.body?.allowDemote === true
    res.json({ code: 0, data: await membershipService.recalculateAllTiers(tenantOf(), { allowDemote }) })
  } catch (err) {
    next(err)
  }
}

/** GET /shop/membership-tiers/expiry：积分有效期（天） */
export const getExpiry = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ code: 0, data: { days: await membershipService.getPointsExpiryDays(tenantOf()) } })
  } catch (err) {
    next(err)
  }
}

/** PUT /shop/membership-tiers/expiry：设置积分有效期（0=不过期） */
export const setExpiry = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await membershipService.setPointsExpiryDays(tenantOf(), Number(req.body?.days ?? 0))
    res.json({ code: 0, data: { days: await membershipService.getPointsExpiryDays(tenantOf()) } })
  } catch (err) {
    next(err)
  }
}

/** POST /shop/membership-tiers/expire-now：手动触发过期作废 */
export const expireNow = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ code: 0, data: await membershipService.expireExpiredPoints(tenantOf()) })
  } catch (err) {
    next(err)
  }
}
