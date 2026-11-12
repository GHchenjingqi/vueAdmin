import type { NextFunction, Request, Response } from 'express'
import * as profileService from '../services/profileService.js'
import { AppError } from '../middleware/errorHandler.js'

/** 个人中心增强控制器（P2-10），所有数据强制限定为当前登录用户 */
function currentUser(req: Request): { id: number } {
  const id = Number((req as unknown as { user?: { id?: number } }).user?.id)
  if (!Number.isInteger(id) || id <= 0) throw new AppError(401, '无效的登录身份')
  return { id }
}

/** 当前用户的登录安全历史（时间 / IP / 设备 / 动作） */
export const loginHistory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = currentUser(req)
    const limit = Number(req.query.limit) || 20
    res.json({ code: 0, data: await profileService.getLoginHistory(id, limit) })
  } catch (err) {
    next(err)
  }
}

/** 当前用户的通知偏好（已启用渠道 + 被关闭的渠道 ID） */
export const getPreferences = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = currentUser(req)
    res.json({ code: 0, data: await profileService.getNotificationPreferences(id) })
  } catch (err) {
    next(err)
  }
}

/** 保存当前用户的通知偏好 */
export const savePreferences = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = currentUser(req)
    const disabledIds = (req.body as { disabledIds?: unknown } | undefined)?.disabledIds
    if (!Array.isArray(disabledIds)) throw new AppError(400, 'disabledIds 必须是数组')
    res.json({ code: 0, data: await profileService.saveNotificationPreferences(id, disabledIds as number[]) })
  } catch (err) {
    next(err)
  }
}
