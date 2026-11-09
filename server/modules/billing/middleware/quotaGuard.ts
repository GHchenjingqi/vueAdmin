import { checkQuota, QUOTA_METRICS } from '../services/usageService.js'
import type { Request, Response, NextFunction } from 'express'

/**
 * 配额守卫。
 *
 * metric 必须是 usageService 注册过的指标：写错名字过去会被 getLimit 当成「无上限」
 * 判成 402（或反向静默放行），因此在这里直接抛给下游错误处理，让开发期就暴露。
 */
export function quotaGuard(metric: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!(QUOTA_METRICS as string[]).includes(metric)) {
      next(new Error(`quotaGuard 使用了未注册的配额指标: ${metric}`))
      return
    }
    const tenantId = req.user?.tenantId
    if (!tenantId) {
      res.status(403).json({ code: 403, message: '无租户上下文' })
      return
    }
    try {
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
    } catch (err) {
      next(err)
    }
  }
}
