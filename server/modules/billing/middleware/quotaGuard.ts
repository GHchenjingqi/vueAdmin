import { checkQuota } from '../services/usageService.js'
import type { Request, Response, NextFunction } from 'express'

export function quotaGuard(metric: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const tenantId = (req.user as any)?.tenantId
    if (!tenantId) {
      res.status(403).json({ code: 403, message: '无租户上下文' })
      return
    }
    const { allowed, used, limit } = await checkQuota(tenantId, metric)
    if (!allowed) {
      res.status(402).json({
        code: 402,
        message: '已达配额上限',
        data: { metric, used, limit },
      })
      return
    }
    next()
  }
}