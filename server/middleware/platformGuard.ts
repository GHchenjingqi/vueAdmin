import type { NextFunction, Request, Response } from 'express'
import { AppError } from './errorHandler.js'

/**
 * 平台作用域守卫：只有 JWT 带 isPlatformAdmin 的请求才能进入租户管理面。
 *
 * 与 requirePermission 是两层不同的防线：权限码回答「这个角色的按钮有没有勾」，
 * 本守卫回答「这个请求是不是平台身份」——租户管理员即便被授了 system:tenant:*
 * 也不得跨租户外操作，因此两者必须同时存在。
 */
export function platformOnly(req: Request, _res: Response, next: NextFunction): void {
  if (req.user?.isPlatformAdmin !== true) {
    next(new AppError(403, '仅平台管理员可访问该功能'))
    return
  }
  next()
}
