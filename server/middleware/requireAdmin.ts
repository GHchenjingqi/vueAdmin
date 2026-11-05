/**
 * 管理端权限守卫（P4-T15 安全整改）
 *
 * 用途：约束「仅 admin 可写」的敏感接口（如商城币种配置切换/回滚），
 * 防止普通登录用户越权修改全局配置（越权访问控制 / broken access control）。
 *
 * 约定：须挂载在 authMiddleware 之后（依赖 req.user 就绪）。
 * 判定标准与 authService 一致：req.user.isPlatformAdmin === true。
 * 非管理员一律 403 FORBIDDEN，不做任何写操作。
 */

import type { NextFunction, Request, Response } from 'express'
import { AppError } from './errorHandler.js'

export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  const user = (req as unknown as { user?: { isPlatformAdmin?: boolean; username?: string } }).user
  if (!user) {
    next(new AppError(401, 'AUTH_REQUIRED'))
    return
  }
  if (user.isPlatformAdmin !== true) {
    next(new AppError(403, 'ADMIN_REQUIRED'))
    return
  }
  next()
}
