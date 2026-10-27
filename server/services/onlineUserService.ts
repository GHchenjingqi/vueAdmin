import { getOnlineUsers, getOnlineCount, forceLogout, isUserOnline } from '../utils/onlineUsers.js'
import { AppError } from '../middleware/errorHandler.js'
import RefreshToken from '../models/RefreshToken.js'

export function listOnlineUsers(scope?: string, tenantId?: number) {
  if (scope === 'count') {
    const count = getOnlineCount(tenantId)
    return { count }
  }

  const users = getOnlineUsers(tenantId)
  return { users, total: users.length }
}

export async function kickUser(targetUserId: number, operatorId: number, operatorName?: string, tenantId?: number) {
  if (!targetUserId || isNaN(targetUserId)) {
    throw new AppError(400, '无效的用户 ID')
  }
  if (targetUserId === operatorId) {
    throw new AppError(400, '不能踢自己下线')
  }

  await RefreshToken.destroy({ where: { userId: targetUserId } })

  forceLogout(tenantId ?? 1, targetUserId, {
    reason: '您的账号已被管理员强制下线，请重新登录',
    operatorName: operatorName || '管理员',
  })
}
