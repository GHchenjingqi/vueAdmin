/**
 * JWT 认证中间件
 * @module authMiddleware
 */

import { Request, Response, NextFunction } from 'express'
import jwt, { JwtPayload } from 'jsonwebtoken'
import config from '../config/index.js'
import { updateUserActivity, isUserKicked, removeOnlineUser } from '../utils/onlineUsers.js'

/**
 * JWT 认证中间件
 * 验证 Bearer Token 并将用户信息注入 req.user
 * 同时检查用户是否已被强制下线（基于 token iat 与被踢时间比较）
 */
export const authMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ code: 401, message: '未提供认证令牌' })
    return
  }

  const token = authHeader.split(' ')[1]

  try {
    const decoded = jwt.verify(token, config.jwt.secret) as JwtPayload & { id: number; username: string; nickname?: string }
    req.user = decoded

    // 检查该用户是否已被管理员强制下线
    if (isUserKicked(decoded.id, decoded.iat)) {
      removeOnlineUser(decoded.id)
      res.status(401).json({ code: 401, message: '您的账号已被管理员强制下线，请重新登录', kicked: true })
      return
    }

    const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || ''
    updateUserActivity(decoded.id, ip, req.headers['user-agent'] as string, {
      username: decoded.username,
      nickname: decoded.nickname,
    })
    next()
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      res.status(401).json({ code: 401, message: '认证令牌已过期，请重新登录', expired: true })
      return
    }
    res.status(401).json({ code: 401, message: '无效的认证令牌' })
  }
}