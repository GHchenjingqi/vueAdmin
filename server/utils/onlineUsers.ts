import jwt, { JwtPayload } from 'jsonwebtoken'
import config from '../config/index.js'
import { sendToUser } from './sseManager.js'
import { getRedis } from '../config/redis.js'
import { logInfo } from './fileLogger.js'

function onlineKey(tenantId: number, userId: number): string {
  return `${tenantId}:${userId}`
}

interface OnlineUser {
  userId: number
  tenantId: number
  username: string
  nickname: string
  socketId: string
  loginTime: string
  lastActiveTime: Date
  ip: string
  userAgent: string
}

const onlineUsers = new Map<string, OnlineUser>()
const kickedUsers = new Map<string, number>()
const KICK_GRACE_PERIOD = 0

const KICK_CHANNEL = 'vue-admin:kick'
const KICK_TTL_MS = 7 * 24 * 60 * 60 * 1000
let subscriber: ReturnType<typeof getRedis> = null
let subscriberReady = false

export function addOnlineUser(token, socketId) {
  try {
    const decoded = jwt.verify(token, config.jwt.secret) as JwtPayload & { tenantId?: number }
    const tenantId = decoded.tenantId ?? 1
    if (isUserKicked(tenantId, decoded.id, decoded.iat)) {
      return
    }
    const key = onlineKey(tenantId, decoded.id)
    onlineUsers.set(key, {
      userId: decoded.id,
      tenantId,
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

export function removeOnlineUser(tenantId: number, userId: number) {
  onlineUsers.delete(onlineKey(tenantId, userId))
}

export function removeOnlineUserBySocket(socketId) {
  for (const [key, user] of onlineUsers.entries()) {
    if (user.socketId === socketId) {
      onlineUsers.delete(key)
      return
    }
  }
}

export function updateUserActivity(userId, ip, userAgent, extra: { username?: string; nickname?: string; tenantId?: number } = {}) {
  const tenantId = extra.tenantId ?? 1
  const key = onlineKey(tenantId, userId)
  let user = onlineUsers.get(key)
  if (user) {
    user.lastActiveTime = new Date()
    user.ip = ip || user.ip
    user.userAgent = userAgent || user.userAgent
    if (extra.username) user.username = extra.username
    if (extra.nickname) user.nickname = extra.nickname
  } else {
    onlineUsers.set(key, {
      userId,
      tenantId,
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

export function getOnlineUsers(tenantId?: number) {
  const users = []
  for (const [, user] of onlineUsers) {
    if (tenantId != null && user.tenantId !== tenantId) continue
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

export function getOnlineCount(tenantId?: number) {
  if (tenantId != null) {
    let count = 0
    for (const [, user] of onlineUsers) {
      if (user.tenantId === tenantId) count++
    }
    return count
  }
  return onlineUsers.size
}

export function isUserOnline(tenantId: number, userId: number) {
  return onlineUsers.has(onlineKey(tenantId, userId))
}

export function isUserKicked(tenantId: number, userId: number, iat?: number) {
  const kickTime = kickedUsers.get(onlineKey(tenantId, userId))
  if (!kickTime) return false
  if (!iat) return true
  return iat * 1000 <= kickTime - KICK_GRACE_PERIOD
}

export function forceLogout(tenantId: number, userId: number, extra: { reason?: string; operatorName?: string } = {}) {
  const key = onlineKey(tenantId, userId)
  onlineUsers.delete(key)
  kickedUsers.set(key, Date.now())
  try {
    sendToUser(userId, 'kicked', {
      userId,
      tenantId,
      kickedAt: new Date().toISOString(),
      reason: extra.reason || '您的账号已被管理员强制下线，请重新登录',
      operatorName: extra.operatorName || null,
    })
  } catch {
    /* ignore */
  }

  const redis = getRedis()
  if (redis) {
    try {
      const payload = JSON.stringify({
        tenantId,
        userId,
        reason: extra.reason || '您的账号已被管理员强制下线，请重新登录',
        operatorName: extra.operatorName || null,
        kickedAt: new Date().toISOString(),
      })
      redis.set(`kick:${key}`, String(Date.now()), 'PX', KICK_TTL_MS).catch(() => {})
      redis.publish(KICK_CHANNEL, payload).catch(() => {})
    } catch {
      /* ignore */
    }
  }

  const cutoff = Date.now() - KICK_TTL_MS
  for (const [k, time] of kickedUsers.entries()) {
    if (time < cutoff) {
      kickedUsers.delete(k)
    }
  }
}

export async function initKickSubscriber(): Promise<void> {
  if (subscriberReady) return
  const redis = getRedis()
  if (!redis) {
    logInfo('Redis 不可用，跳过跨副本踢下线订阅（单副本模式）')
    return
  }
  try {
    const sub = redis.duplicate()
    await sub.subscribe(KICK_CHANNEL)
    sub.on('message', (_channel: string, message: string) => {
      try {
        const { tenantId, userId, reason, operatorName, kickedAt } = JSON.parse(message)
        const tid = Number(tenantId)
        const uid = Number(userId)
        if (!Number.isFinite(tid) || !Number.isFinite(uid)) return
        const key = onlineKey(tid, uid)
        kickedUsers.set(key, Date.now())
        try {
          sendToUser(uid, 'kicked', {
            userId: uid,
            tenantId: tid,
            kickedAt: kickedAt || new Date().toISOString(),
            reason: reason || '您的账号已被管理员强制下线，请重新登录',
            operatorName: operatorName || null,
          })
        } catch {
          /* ignore */
        }
      } catch {
        /* ignore malformed message */
      }
    })
    subscriber = sub
    subscriberReady = true
    logInfo('跨副本踢下线订阅已启动')
  } catch (err) {
    logInfo('跨副本踢下线订阅启动失败（降级为单副本）: ' + (err as Error).message)
  }
}

export async function closeKickSubscriber(): Promise<void> {
  if (subscriber) {
    try {
      await subscriber.quit()
    } catch {
      /* ignore */
    }
    subscriber = null
    subscriberReady = false
  }
}

export function clearKickRecord(tenantId: number, userId: number) {
  kickedUsers.delete(onlineKey(tenantId, userId))
}

export function clearAllOnlineUsers() {
  onlineUsers.clear()
}
