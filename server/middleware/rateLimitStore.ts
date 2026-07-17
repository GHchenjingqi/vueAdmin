/**
 * 限流存储抽象层（策略模式）
 *
 * 设计目的：
 * - 支持多种后端存储（内存/Redis/Memcached）
 * - 通过 setStore() 注入，方便测试（MockStore）
 * - Redis 不可用时自动降级到内存模式
 */

// ---- 类型定义 ----
export interface CheckResult {
  allowed: boolean
  remaining: number
  retryAfter?: number
}

export interface RateLimitStore {
  check(key: string, windowMs: number, maxAttempts: number): CheckResult | Promise<CheckResult>
  record(key: string, windowMs: number): void | Promise<void>
  clear(key: string): void | Promise<void>
}

// ---- 内存实现（单实例 / fallback） ----
export class MemoryRateLimitStore implements RateLimitStore {
  private store = new Map<string, { count: number; windowStart: number }>()

  check(key: string, windowMs: number, maxAttempts: number): CheckResult {
    const now = Date.now()
    const record = this.store.get(key)

    if (!record) {
      return { allowed: true, remaining: maxAttempts }
    }

    if (now - record.windowStart > windowMs) {
      this.store.delete(key)
      return { allowed: true, remaining: maxAttempts }
    }

    const remaining = Math.max(0, maxAttempts - record.count)
    if (record.count >= maxAttempts) {
      return {
        allowed: false,
        remaining: 0,
        retryAfter: Math.ceil((windowMs - (now - record.windowStart)) / 1000),
      }
    }
    return { allowed: true, remaining }
  }

  record(key: string, windowMs: number): void {
    const now = Date.now()
    const record = this.store.get(key)
    if (!record || now - record.windowStart > windowMs) {
      this.store.set(key, { count: 1, windowStart: now })
    } else {
      record.count++
    }
  }

  clear(key: string): void {
    this.store.delete(key)
  }
}

// ---- Redis 实现（多实例共享） ----
import type Redis from 'ioredis'

export class RedisRateLimitStore implements RateLimitStore {
  constructor(private redis: Redis) {}

  async check(key: string, windowMs: number, maxAttempts: number): Promise<CheckResult> {
    try {
      const count = await this.redis.get(key)
      if (!count) return { allowed: true, remaining: maxAttempts }

      const currentCount = parseInt(count, 10)
      const ttl = await this.redis.ttl(key)
      const remaining = Math.max(0, maxAttempts - currentCount)

      if (currentCount >= maxAttempts) {
        return { allowed: false, remaining: 0, retryAfter: ttl > 0 ? ttl : 0 }
      }
      return { allowed: true, remaining }
    } catch (err) {
      // Redis 异常时放行（防止限流故障导致服务不可用）
      console.error('[RedisRateLimitStore] check error:', err)
      return { allowed: true, remaining: maxAttempts }
    }
  }

  async record(key: string, windowMs: number): Promise<void> {
    try {
      const multi = this.redis.multi()
      multi.incr(key)
      multi.pexpire(key, windowMs)
      await multi.exec()
    } catch (err) {
      console.error('[RedisRateLimitStore] record error:', err)
    }
  }

  async clear(key: string): Promise<void> {
    try {
      await this.redis.del(key)
    } catch (err) {
      console.error('[RedisRateLimitStore] clear error:', err)
    }
  }
}