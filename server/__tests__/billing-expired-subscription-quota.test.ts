import { describe, it, expect, vi, beforeEach } from 'vitest'

// 内存回退路径（redis 为 null）；Subscription/Plan 完全 mock。
// 关键：mock 的 findOne 真正按 getLimit 传入的 where（status + currentPeriodEnd>=now）过滤，
// 从而验证 getLimit 确实把「账期内 active」作为查询条件（生产环境由 DB 强制执行）。
const mocks = vi.hoisted(() => {
  let current: any = null
  const findOne = vi.fn((opts: any) => {
    const w = opts?.where || {}
    if (w.status && current?.status !== w.status) return Promise.resolve(null)
    if (w.currentPeriodEnd) {
      // Op.gte 的键是 Symbol，Object.values 会忽略，必须用 getOwnPropertySymbols 取日期
      const sym = Object.getOwnPropertySymbols(w.currentPeriodEnd)[0]
      const gte: unknown = sym ? w.currentPeriodEnd[sym] : undefined
      if (gte instanceof Date && current?.currentPeriodEnd && current.currentPeriodEnd < gte) {
        return Promise.resolve(null)
      }
    }
    return Promise.resolve(current)
  })
  const findByPk = vi.fn()
  return { findOne, findByPk, setCurrent: (s: any) => { current = s } }
})

vi.mock('../config/database.js', () => ({ default: {} }))
vi.mock('../config/redis.js', () => ({ getRedis: vi.fn().mockReturnValue(null) }))
vi.mock('../modules/billing/models/Usage.js', () => ({ default: {} }))
vi.mock('../modules/billing/models/Subscription.js', () => ({ default: { findOne: mocks.findOne } }))
vi.mock('../modules/billing/models/Plan.js', () => ({ default: { findByPk: mocks.findByPk } }))

import { getLimit, consumeQuota, resetMemoryCounters } from '../modules/billing/services/usageService.js'

const DAY = 86400000
const future = new Date(Date.now() + 10 * DAY)
const past = new Date(Date.now() - DAY)

describe('billing getLimit：配额仅对「账期内 active」订阅生效', () => {
  beforeEach(() => {
    resetMemoryCounters()
    mocks.findByPk.mockReset()
    mocks.findByPk.mockResolvedValue({ id: 9, limits: { users: 5 } })
  })

  it('账期内 active 订阅 → 返回套餐额度', async () => {
    mocks.setCurrent({ id: 1, tenantId: 1, status: 'active', planId: 9, currentPeriodEnd: future })
    expect(await getLimit(1, 'users')).toBe(5)
  })

  it('订阅已过期（currentPeriodEnd 在过去）即使 status=active → 返回 0（防止免费续用配额）', async () => {
    mocks.setCurrent({ id: 2, tenantId: 1, status: 'active', planId: 9, currentPeriodEnd: past })
    expect(await getLimit(1, 'users')).toBe(0)
  })

  it('订阅已取消 → 返回 0', async () => {
    mocks.setCurrent({ id: 3, tenantId: 1, status: 'cancelled', planId: 9, currentPeriodEnd: future })
    expect(await getLimit(1, 'users')).toBe(0)
  })

  it('过期订阅不再授予配额：consumeQuota 直接拒绝（limit=0）', async () => {
    mocks.setCurrent({ id: 4, tenantId: 1, status: 'active', planId: 9, currentPeriodEnd: past })
    const r = await consumeQuota(1, 'users', 1)
    expect(r.ok).toBe(false)
    expect(r.limit).toBe(0)
    expect(await getLimit(1, 'users')).toBe(0)
  })
})
