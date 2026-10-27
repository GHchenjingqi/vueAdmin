import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../config/database.js', () => ({ default: {} }))
vi.mock('../config/redis.js', () => ({ getRedis: vi.fn().mockReturnValue(null) }))
vi.mock('../modules/billing/models/Usage.js', () => ({ default: {} }))
vi.mock('../modules/billing/models/Subscription.js', () => ({ default: { findOne: vi.fn().mockResolvedValue(null) } }))
vi.mock('../modules/billing/models/Plan.js', () => ({ default: { findByPk: vi.fn().mockResolvedValue(null) } }))

import { incrUsage, getUsage, checkQuota, resetMemoryCounters } from '../modules/billing/services/usageService.js'

describe('usageService', () => {
  beforeEach(() => {
    resetMemoryCounters()
  })

  describe('incrUsage / getUsage (memory fallback)', () => {
    it('incrUsage 返回递增后的值', async () => {
      const v1 = await incrUsage(1, 'users')
      expect(v1).toBe(1)
      const v2 = await incrUsage(1, 'users')
      expect(v2).toBe(2)
    })

    it('不同租户独立计数', async () => {
      await incrUsage(1, 'users')
      await incrUsage(2, 'users')
      expect(await getUsage(1, 'users')).toBe(1)
      expect(await getUsage(2, 'users')).toBe(1)
    })

    it('不同指标独立计数', async () => {
      await incrUsage(1, 'users')
      await incrUsage(1, 'files')
      expect(await getUsage(1, 'users')).toBe(1)
      expect(await getUsage(1, 'files')).toBe(1)
    })

    it('未计数的指标返回 0', async () => {
      expect(await getUsage(1, 'nonexistent')).toBe(0)
    })
  })

  describe('checkQuota', () => {
    it('无订阅时 limit 为 0, allowed 为 false', async () => {
      const result = await checkQuota(1, 'users')
      expect(result.limit).toBe(0)
      expect(result.allowed).toBe(false)
    })
  })
})