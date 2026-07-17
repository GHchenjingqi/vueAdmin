import jwt, { JwtPayload } from 'jsonwebtoken'
import config from '../config/index.js'
import { sendToUser } from './sseManager.js'

const onlineUsers = new Map<number, { userId: number; username: string; nickname: string; socketId: string; loginTime: string; lastActiveTime: Date; ip: string; userAgent: string }>()
// 记录被踢下线的用户：userId -> 被踢时间戳（用于使旧 token 失效）
const kickedUsers = new Map<number, number>()
// 踢下线后，token 宽限时间（避免时钟偏差），设为 0 表示立即失效
const KICK_GRACE_PERIOD = 0

export function addOnlineUser(token, socketId) {
  try {
    const decoded = jwt.verify(token, config.jwt.secret) as JwtPayload
    if (isUserKicked(decoded.id, decoded.iat)) {
      return
    }
    onlineUsers.set(decoded.id, {
      userId: decoded.id,
      username: decoded.username,
      nickname: decoded.nickname || decoded.username,
      socketId,
      loginTime: new Date().toISOString(),
      lastActiveTime: new Date(),
      ip: '',
      userAgent: '',
    })
  } catch {
    // token 无效，忽略
  }
}

export function removeOnlineUser(userId) {
  onlineUsers.delete(userId)
}

export function removeOnlineUserBySocket(socketId) {
  for (const [userId, user] of onlineUsers.entries()) {
    if (user.socketId === socketId) {
      onlineUsers.delete(userId)
      return
    }
  }
}

export function updateUserActivity(userId, ip, userAgent, extra: { username?: string; nickname?: string } = {}) {
  let user = onlineUsers.get(userId)
  if (user) {
    user.lastActiveTime = new Date()
    user.ip = ip || user.ip
    user.userAgent = userAgent || user.userAgent
    if (extra.username) user.username = extra.username
    if (extra.nickname) user.nickname = extra.nickname
  } else {
    onlineUsers.set(userId, {
      userId,
      username: extra.username || '',
      nickname: extra.nickname || '',
      socketId: '',
      loginTime: new Date().toISOString(),
      lastActiveTime: new Date(),
      ip: ip || '',
      userAgent: userAgent || '',
    })
  }
}

export function getOnlineUsers() {
  const users = []
  for (const [, user] of onlineUsers) {
    users.push({
      userId: user.userId,
      username: user.username,
      nickname: user.nickname,
      loginTime: user.loginTime,
      lastActiveTime: new Date(user.lastActiveTime).toISOString(),
      ip: user.ip,
      userAgent: user.userAgent,
    })
  }
  return users
}

export function getOnlineCount() {
  return onlineUsers.size
}

export function isUserOnline(userId) {
  return onlineUsers.has(userId)
}

/**
 * 检查用户是否已被踢下线（基于 token 签发时间与被踢时间的比较）
 * @param {number} userId 用户 ID
 * @param {number} iat token 的签发时间（秒级时间戳）
 * @returns {boolean} true 表示该 token 已失效（用户已被踢）
 */
export function isUserKicked(userId, iat) {
  const kickTime = kickedUsers.get(userId)
  if (!kickTime) return false
  // iat 是秒级时间戳（jwt 默认），kickTime 是毫秒级
  // 如果 token 签发时间早于被踢时间（考虑宽限期），则失效
  if (!iat) return true // 没有 iat 的 token 在用户被踢后一律失效
  return (iat * 1000) <= (kickTime - KICK_GRACE_PERIOD)
}

/**
 * 强制用户下线
 * - 从在线列表移除
 * - 记录被踢时间，使该用户在此之前签发的所有 token 失效
 * - 通过 SSE 实时向该用户的所有浏览器会话推送被踢通知
 * @param {number} userId
 * @param {object} [extra]
 * @param {string} [extra.reason] 踢下线原因
 * @param {string} [extra.operatorName] 操作者名
 */
export function forceLogout(userId: number, extra: { reason?: string; operatorName?: string } = {}) {
  onlineUsers.delete(userId)
  kickedUsers.set(userId, Date.now())
  // 通过 SSE 向该用户的所有连接推送被踢通知（无需依赖 HTTP 请求返回值）
  try {
    sendToUser(userId, 'kicked', {
      userId,
      kickedAt: new Date().toISOString(),
      reason: extra.reason || '您的账号已被管理员强制下线，请重新登录',
      operatorName: extra.operatorName || null,
    })
  } catch { /* ignore */ }
  // 限制 kickedUsers 大小，避免内存泄漏（只保留最近 7 天的记录）
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000
  for (const [uid, time] of kickedUsers.entries()) {
    if (time < cutoff) {
      kickedUsers.delete(uid)
    }
  }
}

/**
 * 清除用户的被踢记录（用户重新登录时调用）
 * @param {number} userId
 */
export function clearKickRecord(userId) {
  kickedUsers.delete(userId)
}