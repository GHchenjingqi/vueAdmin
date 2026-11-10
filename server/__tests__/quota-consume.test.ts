import { describe, it, expect, vi, beforeEach } from 'vitest'

// 内存回退路径（redis 为 null）：用 per-key 异步锁串行化 read-modify-write
vi.mock('../config/database.js', () => ({ default: {} }))
vi.mock('../config/redis.js', () => ({ getRedis: vi.fn().mockReturnValue(null) }))
vi.mock('../modules/billing/models/Usage.js', () => ({ default: {} }))
vi.mock('../modules/billing/models/Subscription.js', () => ({
  default: { findOne: vi.fn().mockResolvedValue({ planId: 1 }) },
}))
vi.mock('../modules/billing/models/Plan.js', () => ({
  default: { findByPk: vi.fn().mockResolvedValue({ limits: { users: 5, files: 10 } }) },
}))

import { consumeQuota, releaseQuota, getUsage, resetMemoryCounters } from '../modules/billing/services/usageService.js'

describe('consumeQuota (内存回退)', () => {
  beforeEach(() => {
    resetMemoryCounters()
  })

  it('在限额内原子占用，used 递增', async () => {
    expect(await consumeQuota(1, 'users', 1)).toMatchObject({ ok: true, used: 1, limit: 5 })
    expect(await consumeQuota(1, 'users', 1)).toMatchObject({ ok: true, used: 2, limit: 5 })
    expect(await getUsage(1, 'users')).toBe(2)
  })

  it('超过上限拒绝且不计数（无 lost update）', async () => {
    for (let i = 0; i < 5; i++) expect((await consumeQuota(1, 'users', 1)).ok).toBe(true)
    const over = await consumeQuota(1, 'users', 1)
    expect(over.ok).toBe(false)
    expect(over.used).toBe(5)
    expect(await getUsage(1, 'users')).toBe(5)
  })

  it('releaseQuota 回滚后额度恢复', async () => {
    await consumeQuota(1, 'users', 1)
    await releaseQuota(1, 'users', 1)
    expect(await getUsage(1, 'users')).toBe(0)
    expect((await consumeQuota(1, 'users', 1)).ok).toBe(true)
  })

  it('并发 50 个占用（limit=5）最终恰好放行 5 个，绝不超限额', async () => {
    const results = await Promise.all(Array.from({ length: 50 }, () => consumeQuota(1, 'users', 1)))
    const okCount = results.filter((r) => r.ok).length
    const overCount = results.filter((r) => !r.ok).length
    expect(okCount).toBe(5)
    expect(overCount).toBe(45)
    expect(await getUsage(1, 'users')).toBe(5)
  })

  it('单请求批量占用（delta=3）正确扣减并在超额时回退', async () => {
    expect((await consumeQuota(1, 'files', 3)).ok).toBe(true)
    expect(await getUsage(1, 'files')).toBe(3)
    // 再占 8 → 3+8=11 > 10，应拒绝且不加计数
    const over = await consumeQuota(1, 'files', 8)
    expect(over.ok).toBe(false)
    expect(await getUsage(1, 'files')).toBe(3)
  })
})
