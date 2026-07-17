/**
 * 密码重置 Token 管理（一次性 + Redis 优先）
 * @module resetToken
 *
 * 设计要点（对应优化方案 Phase 2 - 2.3）：
 * 1. 一次性：Token 验证后立即失效（Redis DEL / DB revoked）。
 * 2. 短时效：15 分钟有效期（Redis EX 自动过期；DB 回退同样 15 分钟）。
 * 3. Redis 优先：高并发、自动过期、不污染 RefreshToken 表；
 *    Redis 不可用（disabled / 异常）时回退到 DB RefreshToken 表，保证功能不降级。
 * 4. 限流：忘记密码邮箱限流走 Redis（5 分钟一次），重启/多实例一致。
 */

import { randomBytes } from 'crypto'
import { getRedis } from '../config/redis.js'
import RefreshToken from '../models/RefreshToken.js'

const RESET_TTL = 15 * 60 // 重置 Token 有效期（秒）
const RATE_TTL = 5 * 60 // 忘记密码限流窗口（秒）

function generateToken(): string {
  return randomBytes(32).toString('hex')
}

/**
 * 忘记密码邮箱限流。
 * @returns true = 允许发送邮件；false = 处于限流窗口内（5 分钟内已发过）。
 * Redis 不可用时放行（不阻断正常流程，由其它层兜底）。
 */
export async function checkForgotRateLimit(email: string): Promise<boolean> {
  const redis = getRedis()
  if (!redis) return true
  try {
    const key = `pwd_reset_rl:${email.toLowerCase()}`
    // NX：键不存在才写入，返回 OK 表示首次（放行）；已存在返回 null（限流）
    const result = await redis.set(key, '1', 'EX', RATE_TTL, 'NX')
    return result === 'OK'
  } catch {
    return true
  }
}

/**
 * 创建一次性密码重置 Token。
 * 优先写 Redis（SET ... EX 15min，天然过期）；Redis 异常时回退 DB。
 */
export async function createResetToken(userId: number): Promise<string> {
  const token = generateToken()
  const redis = getRedis()
  if (redis) {
    try {
      await redis.set(`pwd_reset:${token}`, String(userId), 'EX', RESET_TTL)
      return token
    } catch {
      // 落到 DB 回退
    }
  }
  await RefreshToken.create({
    userId,
    token,
    expiresAt: new Date(Date.now() + RESET_TTL * 1000),
    revoked: 0,
    rememberMe: 0,
    purpose: 'password_reset',
  })
  return token
}

/**
 * 消费一次性重置 Token。
 * @returns 成功返回 userId（并立即使 Token 失效）；失败/已用/过期返回 null。
 * Redis 路径：GET 后 DEL（一次性）。DB 回退：查找未撤销未过期记录，命中即撤销。
 */
export async function consumeResetToken(token: string): Promise<number | null> {
  if (!token) return null
  const redis = getRedis()
  if (redis) {
    try {
      const userId = await redis.get(`pwd_reset:${token}`)
      if (!userId) return null
      await redis.del(`pwd_reset:${token}`) // 一次性：立即删除
      return Number(userId)
    } catch {
      // 落到 DB 回退
    }
  }
  const record = await RefreshToken.findOne({
    where: { token, revoked: 0, purpose: 'password_reset' },
  })
  if (!record || new Date(record.expiresAt) <= new Date()) {
    if (record) await record.update({ revoked: 1, revokedAt: new Date() })
    return null
  }
  await record.update({ revoked: 1, revokedAt: new Date() })
  return record.userId
}
