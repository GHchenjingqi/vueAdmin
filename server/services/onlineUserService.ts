/**
 * 在线用户 Service 层
 *
 * 职责：封装在线用户管理的所有业务逻辑
 */

import { getOnlineUsers, getOnlineCount, forceLogout, isUserOnline } from '../utils/onlineUsers.js'
import { AppError } from '../middleware/errorHandler.js'
import RefreshToken from '../models/RefreshToken.js'

/**
 * 获取在线用户列表
 */
export function listOnlineUsers(scope?: string) {
  if (scope === 'count') {
    const count = getOnlineCount()
    return { count }
  }

  const users = getOnlineUsers()
  return { users, total: users.length }
}

/**
 * 踢用户下线
 */
export async function kickUser(targetUserId: number, operatorId: number, operatorName?: string) {
  if (!targetUserId || isNaN(targetUserId)) {
    throw new AppError(400, '无效的用户 ID')
  }
  if (targetUserId === operatorId) {
    throw new AppError(400, '不能踢自己下线')
  }

  await RefreshToken.destroy({ where: { userId: targetUserId } })

  forceLogout(targetUserId, {
    reason: '您的账号已被管理员强制下线，请重新登录',
    operatorName: operatorName || '管理员',
  })
}