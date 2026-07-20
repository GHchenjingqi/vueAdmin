import jwt, { JwtPayload } from 'jsonwebtoken'
import config from '../config/index.js'
import { sendToUser } from './sseManager.js'
import { getRedis } from '../config/redis.js'
import { logInfo } from './fileLogger.js'

const onlineUsers = new Map<number, { userId: number; username: string; nickname: string; socketId: string; loginTime: string; lastActiveTime: Date; ip: string; userAgent: string }>()
// 记录被踢下线的用户：userId -> 被踢时间戳（用于使旧 token 失效）
const kickedUsers = new Map<number, number>()
// 踢下线后，token 宽限时间（避免时钟偏差），设为 0 表示立即失效
const KICK_GRACE_PERIOD = 0

// 跨副本踢下线：被踢记录同时写入 Redis（TTL 7 天），并通过 pub/sub 广播，
// 保证多副本部署下任意副本的 SSE 连接都能收到踢下线通知。
const KICK_CHANNEL = 'vue-admin:kick'
const KICK_TTL_MS = 7 * 24 * 60 * 60 * 1000
let subscriber: ReturnType<typeof getRedis> = null
let subscriberReady = false

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
  // 通过 SSE 向本副本该用户的所有连接推送被踢通知
  try {
    sendToUser(userId, 'kicked', {
      userId,
      kickedAt: new Date().toISOString(),
      reason: extra.reason || '您的账号已被管理员强制下线，请重新登录',
      operatorName: extra.operatorName || null,
    })
  } catch { /* ignore */ }

  // 跨副本：写入 Redis（TTL 7 天）并广播，使其它副本也能失效该用户 token 并推送 SSE。
  // 若 Redis 不可用，则退化为仅本副本生效（与改造前行为一致）。
  const redis = getRedis()
  if (redis) {
    try {
      const payload = JSON.stringify({
        userId,
        reason: extra.reason || '您的账号已被管理员强制下线，请重新登录',
        operatorName: extra.operatorName || null,
        kickedAt: new Date().toISOString(),
      })
      redis.set(`kick:${userId}`, String(Date.now()), 'PX', KICK_TTL_MS).catch(() => {})
      redis.publish(KICK_CHANNEL, payload).catch(() => {})
    } catch { /* ignore */ }
  }

  // 限制 kickedUsers 大小，避免内存泄漏（只保留最近 7 天的记录）
  const cutoff = Date.now() - KICK_TTL_MS
  for (const [uid, time] of kickedUsers.entries()) {
    if (time < cutoff) {
      kickedUsers.delete(uid)
    }
  }
}

/**
 * 初始化跨副本踢下线订阅。
 * 订阅 Redis 频道，收到踢下线事件后在本副本落地被踢记录并推送 SSE，
 * 从而让多副本部署下任意副本持有的连接都能被正确踢下线。
 * Redis 不可用时直接返回，退化为单副本内存模式。
 */
export async function initKickSubscriber(): Promise<void> {
  if (subscriberReady) return
  const redis = getRedis()
  if (!redis) {
    logInfo('Redis 不可用，跳过跨副本踢下线订阅（单副本模式）')
    return
  }
  try {
    // 使用独立的订阅连接（ioredis 的普通连接调用 subscribe 后会进入订阅态，
    // 不能再执行普通命令，因此复制一个专用连接）。
    const sub = redis.duplicate()
    await sub.subscribe(KICK_CHANNEL)
    sub.on('message', (_channel: string, message: string) => {
      try {
        const { userId, reason, operatorName, kickedAt } = JSON.parse(message)
        const id = Number(userId)
        if (!Number.isFinite(id)) return
        kickedUsers.set(id, Date.now())
        try {
          sendToUser(id, 'kicked', {
            userId: id,
            kickedAt: kickedAt || new Date().toISOString(),
            reason: reason || '您的账号已被管理员强制下线，请重新登录',
            operatorName: operatorName || null,
          })
        } catch { /* ignore */ }
      } catch { /* ignore malformed message */ }
    })
    subscriber = sub
    subscriberReady = true
    logInfo('跨副本踢下线订阅已启动')
  } catch (err) {
    logInfo('跨副本踢下线订阅启动失败（降级为单副本）: ' + (err as Error).message)
  }
}

/**
 * 关闭跨副本踢下线订阅连接（优雅关闭时调用）
 */
export async function closeKickSubscriber(): Promise<void> {
  if (subscriber) {
    try {
      await subscriber.quit()
    } catch { /* ignore */ }
    subscriber = null
    subscriberReady = false
  }
}

/**
 * 清除用户的被踢记录（用户重新登录时调用）
 * @param {number} userId
 */
export function clearKickRecord(userId) {
  kickedUsers.delete(userId)
}