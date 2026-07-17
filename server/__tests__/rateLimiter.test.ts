// @vitest-environment node
/**
 * rateLimiter 单元测试
 *
 * 注入 MemoryRateLimitStore 以隔离 Redis 依赖
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { checkRateLimit, recordAttempt, clearAttempts, setStore } from '../middleware/rateLimiter'
import { MemoryRateLimitStore } from '../middleware/rateLimitStore'

const ip = '127.0.0.1'
const username = 'testuser'

beforeEach(async () => {
  // 注入内存 Store，确保测试不依赖 Redis
  setStore(new MemoryRateLimitStore())
  await clearAttempts(ip, username)
})

describe('rateLimiter', () => {
  it('should allow first attempt', async () => {
    const result = await checkRateLimit(ip, username)
    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(5)
  })

  it('should allow up to 5 attempts', async () => {
    for (let i = 0; i < 4; i++) {
      await recordAttempt(ip, username)
      const result = await checkRateLimit(ip, username)
      expect(result.allowed).toBe(true)
    }

    await recordAttempt(ip, username)
    const result = await checkRateLimit(ip, username)
    expect(result.allowed).toBe(false)
    expect(result.retryAfter).toBeGreaterThan(0)
    expect(result.remaining).toBe(0)
  })

  it('should clear attempts on successful login', async () => {
    for (let i = 0; i < 3; i++) {
      await recordAttempt(ip, username)
    }
    await clearAttempts(ip, username)
    const result = await checkRateLimit(ip, username)
    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(5)
  })
})