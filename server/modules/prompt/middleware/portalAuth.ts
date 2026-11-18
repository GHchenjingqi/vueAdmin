/**
 * 提示词前台可选认证
 *
 * 前台读接口允许游客访问，但需要在已登录时识别用户（用于 isFavorited）；
 * 写接口再由 requirePortalUser 强制要求登录。
 * 不复用 authMiddleware：后者会强制 401 且建立租户上下文，
 * 而前台的提示词数据是平台级共享内容，不做租户过滤。
 */
import type { Request, Response, NextFunction } from 'express'
import jwt, { type JwtPayload } from 'jsonwebtoken'
import config from '../../../config/index.js'

export interface PortalUser {
  id: number
  username: string
  nickname?: string
  tenantId?: number
}

/** 解析 Bearer Token；无效或缺失时按游客放行 */
export const optionalAuth = (req: Request, _res: Response, next: NextFunction): void => {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    next()
    return
  }
  try {
    const decoded = jwt.verify(header.slice(7), config.jwt.secret) as JwtPayload & PortalUser
    if (decoded.id) (req as any).user = decoded
  } catch {
    // 过期/无效令牌按游客处理，读接口仍可用
  }
  next()
}

/** 写操作必须登录 */
export const requirePortalUser = (req: Request, res: Response, next: NextFunction): void => {
  const user = (req as any).user as PortalUser | undefined
  if (!user?.id) {
    res.status(401).json({ code: 401, message: '请先登录' })
    return
  }
  next()
}

export function portalUserId(req: Request): number {
  return Number((req as any).user?.id)
}
