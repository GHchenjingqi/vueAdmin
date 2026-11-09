// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

const usageUpsert = vi.fn()
const usageFindOne = vi.fn()
const userCount = vi.fn()
const subscriptionFindOne = vi.fn()
const planFindByPk = vi.fn()

vi.mock('../config/database.js', () => ({ default: {} }))
vi.mock('../config/redis.js', () => ({ getRedis: vi.fn().mockReturnValue(null) }))
vi.mock('../modules/billing/models/Usage.js', () => ({
  default: { upsert: (...args: unknown[]) => usageUpsert(...args), findOne: (...args: unknown[]) => usageFindOne(...args) },
}))
vi.mock('../modules/billing/models/Subscription.js', () => ({
  default: { findOne: (...args: unknown[]) => subscriptionFindOne(...args) },
}))
vi.mock('../modules/billing/models/Plan.js', () => ({
  default: { findByPk: (...args: unknown[]) => planFindByPk(...args) },
}))
vi.mock('../models/User.js', () => ({
  default: { count: (...args: unknown[]) => userCount(...args) },
}))

import { incrUsage, getUsage, checkQuota, getQuotaSnapshot, getLimit, resetMemoryCounters } from '../modules/billing/services/usageService.js'

describe('usageService', () => {
  beforeEach(() => {
    resetMemoryCounters()
    vi.clearAllMocks()
    usageUpsert.mockResolvedValue({})
    usageFindOne.mockResolvedValue(null)
    subscriptionFindOne.mockResolvedValue(null)
    planFindByPk.mockResolvedValue(null)
    userCount.mockResolvedValue(0)
  })

  describe('指标注册', () => {
    it('未注册的指标直接抛错，避免静默放行或误判 402', async () => {
      await expect(incrUsage(1, 'nonexistent')).rejects.toThrow(/未注册的配额指标/)
      expect(await getUsage(1, 'nonexistent')).toBe(0)
      expect(await getLimit(1, 'nonexistent')).toBe(0)
    })
  })

  describe('累计指标（files/storage）', () => {
    it('递增后同时落库，进程重启不会把计数清零', async () => {
      expect(await incrUsage(1, 'files', 2)).toBe(2)
      expect(await incrUsage(1, 'files')).toBe(3)
      expect(usageUpsert).toHaveBeenLastCalledWith({ tenantId: 1, metric: 'files', period: 'total', value: 3 })
    })

    it('内存计数器为空时回落到 usages 表（模拟重启）', async () => {
      usageFindOne.mockResolvedValue({ value: 17 })
      expect(await getUsage(1, 'files')).toBe(17)
      // 重启后的第一次递增必须接在 17 之后
      expect(await incrUsage(1, 'files')).toBe(18)
    })

    it('租户与指标各自独立计数', async () => {
      await incrUsage(1, 'files')
      await incrUsage(2, 'files')
      await incrUsage(1, 'storage')
      expect(await getUsage(1, 'files')).toBe(1)
      expect(await getUsage(2, 'files')).toBe(1)
      expect(await getUsage(1, 'storage')).toBe(1)
    })
  })

  describe('存量指标（users）', () => {
    it('实时统计业务表，不写计数器', async () => {
      userCount.mockResolvedValue(4)
      expect(await getUsage(1, 'users')).toBe(4)
      expect(userCount).toHaveBeenCalledWith({ where: { tenantId: 1 } })

      expect(await incrUsage(1, 'users')).toBe(4)
      expect(usageUpsert).not.toHaveBeenCalled()
    })

    it('用户被删除后用量随之下降', async () => {
      userCount.mockResolvedValue(4)
      expect(await getUsage(1, 'users')).toBe(4)
      userCount.mockResolvedValue(3)
      expect(await getUsage(1, 'users')).toBe(3)
    })
  })

  describe('checkQuota', () => {
    it('无订阅时视为不限额而不是 402', async () => {
      const result = await checkQuota(1, 'users')
      expect(result).toEqual({ allowed: true, used: 0, limit: 0 })
    })

    it('套餐未配置该维度（limit 缺省为 0）同样不限额', async () => {
      subscriptionFindOne.mockResolvedValue({ planId: 9 })
      planFindByPk.mockResolvedValue({ limits: { maxUsers: 5, maxFiles: -1 } })
      expect((await checkQuota(1, 'files')).allowed).toBe(true)
      expect((await checkQuota(1, 'files')).limit).toBe(0)
    })

    it('达到上限时拒绝，未到上限时放行', async () => {
      subscriptionFindOne.mockResolvedValue({ planId: 9 })
      planFindByPk.mockResolvedValue({ limits: { maxUsers: 2 } })
      userCount.mockResolvedValue(2)
      expect(await checkQuota(1, 'users')).toEqual({ allowed: false, used: 2, limit: 2 })
      userCount.mockResolvedValue(1)
      expect((await checkQuota(1, 'users')).allowed).toBe(true)
    })
  })

  describe('getQuotaSnapshot', () => {
    it('返回套餐码与全部已注册指标的已用/上限', async () => {
      subscriptionFindOne.mockResolvedValue({ planId: 9, currentPeriodEnd: new Date('2026-12-01T00:00:00Z') })
      planFindByPk.mockResolvedValue({ code: 'pro', limits: { maxUsers: 10, maxApiCallsPerDay: 100 } })
      userCount.mockResolvedValue(3)

      const snapshot = await getQuotaSnapshot(1)
      expect(snapshot.planCode).toBe('pro')
      expect(snapshot.periodEnd).toEqual(new Date('2026-12-01T00:00:00Z'))
      expect(snapshot.metrics.map((m) => m.metric)).toEqual(['users', 'files', 'storage', 'apiCalls', 'workflowRuns'])

      const users = snapshot.metrics.find((m) => m.metric === 'users')
      expect(users).toEqual({ metric: 'users', period: 'total', used: 3, limit: 10 })
      const apiCalls = snapshot.metrics.find((m) => m.metric === 'apiCalls')
      expect(apiCalls).toMatchObject({ period: 'day', used: 0, limit: 100 })
    })

    it('无订阅套餐时 planCode 为 null 且各项不限额', async () => {
      const snapshot = await getQuotaSnapshot(2)
      expect(snapshot.planCode).toBeNull()
      expect(snapshot.periodEnd).toBeNull()
      expect(snapshot.metrics.every((m) => m.limit === 0)).toBe(true)
    })
  })
})
