import type { Request, Response, NextFunction } from 'express'
import { resolveAssignment, listExperiments } from './experimentService.js'
import { isFeatureEnabled } from '../featureflags/featureFlags.js'

/** admin：实验定义清单 + 当前 ab_test 开关状态 */
export const list = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    res.json({ code: 0, data: { enabled: await isFeatureEnabled('ab_test'), experiments: listExperiments() } })
  } catch (err) {
    next(err)
  }
}

/**
 * 公开：查询某 subject 的实验分派。
 * flag 关闭 → control（200，不报错），前端可无脑调用；响应禁止共享缓存。
 */
export const assign = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const key = String(req.params.key ?? '')
    const subjectId = typeof req.query.subjectId === 'string' ? req.query.subjectId : undefined
    res.set('Cache-Control', 'private, no-store')
    res.json({ code: 0, data: await resolveAssignment(key, subjectId) })
  } catch (err) {
    next(err)
  }
}
