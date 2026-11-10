import { consumeQuota } from '../services/usageService.js'
import type { Request, Response, NextFunction } from 'express'

/**
 * 配额闸门。采用「原子占用」语义：在业务动作之前调用 consumeQuota 一次性完成
 * 检查+计数（Redis INCRBY 后校验 / 内存 per-key 锁），从根本上消除 check-then-act 的
 * TOCTOU 竞态——并发请求不再能通过各自独立的 checkQuota 读取后同时越权递增。
 * 返回 ok:false 即拒绝（402），且计数未被占用。
 */
export function quotaGuard(metric: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const tenantId = (req.user as any)?.tenantId
    if (!tenantId) {
      res.status(403).json({ code: 403, message: '无租户上下文' })
      return
    }
    const result = await consumeQuota(tenantId, metric, 1)
    if (!result.ok) {
      res.status(402).json({
        code: 402,
        message: '已达配额上限',
        data: { metric, used: result.used, limit: result.limit },
      })
      return
    }
    next()
  }
}
