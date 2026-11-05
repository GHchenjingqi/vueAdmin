import type { NextFunction, Request, Response } from 'express'
import { AppError } from '../../middleware/errorHandler.js'
import { isFeatureEnabled, listFlags, setFlag } from './featureFlags.js'

function operatorOf(req: Request): { id: number | null; name: string | null } {
  const user = (req as unknown as { user?: { id?: number; username?: string } }).user
  return { id: user?.id ?? null, name: user?.username ?? null }
}

/** admin：列出所有 flag 与启用态 */
export const list = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    res.json({ code: 0, data: await listFlags() })
  } catch (err) {
    next(err)
  }
}

/** admin：设置指定 flag 启用态 */
export const update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { key } = req.params as { key: string }
    const { enabled } = req.body as { enabled: boolean }
    if (typeof enabled !== 'boolean') throw new AppError(400, 'INVALID_FLAG_VALUE')
    const result = await setFlag(key, enabled, operatorOf(req))
    res.json({ code: 0, data: result })
  } catch (err) {
    next(err)
  }
}

/** 公开（缓存）：查询某功能是否启用，供店面 UI 使用 */
export const publicCheck = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { key } = req.params as { key: string }
    res.json({ code: 0, data: { key, enabled: await isFeatureEnabled(key) } })
  } catch (err) {
    next(err)
  }
}
