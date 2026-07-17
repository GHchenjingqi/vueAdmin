// @vitest-environment node
/**
 * resetToken 单元测试
 * 覆盖：Redis 路径、限流、一次性消费
 * DB 回退路径由集成测试覆盖
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock RefreshToken 模型（DB 回退路径备用）
vi.mock('../models/RefreshToken.js', () => ({
  default: {
    create: vi.fn(),
    findOne: vi.fn(),
  },
}))

// 用内存 Map 模拟 ioredis 的关键命令
vi.mock('../config/redis.js', () => {
  const store = new Map<string, { v: string; exp: number }>()
  const now = () => Date.now()
  const fakeRedis = {
    async set(key: string, value: string, ...args: string[]): Promise<string | null> {
      const exIdx = args.indexOf('EX')
      const ttl = exIdx >= 0 ? Number(args[exIdx + 1]) : -1
      const nx = args.includes('NX')
      if (nx && store.has(key)) return null
      store.set(key, { v: value, exp: ttl > 0 ? now() + ttl * 1000 : Infinity })
      return 'OK'
    },
    async get(key: string): Promise<string | null> {
      const e = store.get(key)
      if (!e) return null
      if (e.exp <= now()) {
        store.delete(key)
        return null
      }
      return e.v
    },
    async del(key: string): Promise<number> {
      const had = store.has(key)
      store.delete(key)
      return had ? 1 : 0
    },
  }
  return { getRedis: () => fakeRedis as any }
})

import { createResetToken, consumeResetToken, checkForgotRateLimit } from '../utils/resetToken.js'
import RefreshToken from '../models/RefreshToken.js'

describe('resetToken - Redis 路径', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('创建 Token 成功（Redis 路径）', async () => {
    const token = await createResetToken(42)
    expect(typeof token).toBe('string')
    expect(token.length).toBe(64) // randomBytes(32).toString('hex')
    expect(RefreshToken.create).not.toHaveBeenCalled() // Redis 路径不走 DB
  })

  it('消费 Token 成功并返回 userId（Redis 路径）', async () => {
    const token = await createResetToken(100)
    const userId = await consumeResetToken(token)
    expect(userId).toBe(100)
  })

  it('Token 一次性：第二次消费返回 null', async () => {
    const token = await createResetToken(200)
    await consumeResetToken(token)
    const userId2 = await consumeResetToken(token)
    expect(userId2).toBeNull()
  })

  it('消费不存在的 Token 返回 null', async () => {
    const userId = await consumeResetToken('nonexistent-token')
    expect(userId).toBeNull()
  })

  it('消费空 Token 返回 null', async () => {
    const userId = await consumeResetToken('')
    expect(userId).toBeNull()
  })
})

describe('resetToken - 忘记密码限流', () => {
  it('同一邮箱首次放行', async () => {
    const result = await checkForgotRateLimit('user@example.com')
    expect(result).toBe(true)
  })

  it('同一邮箱二次限流（5 分钟内）', async () => {
    await checkForgotRateLimit('test@example.com')
    const result = await checkForgotRateLimit('test@example.com')
    expect(result).toBe(false)
  })

  it('不同邮箱互不影响', async () => {
    expect(await checkForgotRateLimit('a@example.com')).toBe(true)
    expect(await checkForgotRateLimit('b@example.com')).toBe(true)
  })

  it('邮箱大小写不敏感', async () => {
    await checkForgotRateLimit('UPPER@EXAMPLE.COM')
    const result = await checkForgotRateLimit('upper@example.com')
    expect(result).toBe(false)
  })
})
