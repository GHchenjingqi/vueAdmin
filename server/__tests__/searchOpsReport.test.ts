// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * 搜索运营聚合单测（admin 运营增强，mock 模型层）：
 * - searchHotReport：search 事件按 canonicalTerm 归并词频；results=0 计零结果；无 results 信号时 rate=null
 * - searchFunnelReport：按 sessionId 串联 search→view_item→add_to_cart→purchase（时序归因）
 */

const hoist = vi.hoisted(() => {
  const state = { events: [] as Record<string, unknown>[] }
  return state
})

vi.mock('../modules/tenant/context.js', () => ({
  getTenantContext: () => ({ tenantId: 1 }),
}))

vi.mock('../modules/shop/models/index.js', () => ({
  ShopAnalyticsEvent: {
    findAll: vi.fn(async () => hoist.events),
  },
  // analyticsService 顶部还 import 了这些，仅用于 import 成功；本用例不触达
  ShopOrder: {}, ShopOrderItem: {}, ShopRateSnapshot: {}, ShopSku: {}, ShopSpu: {}, ShopInventory: {}, ShopInventoryLog: {},
}))

beforeEach(() => {
  hoist.events = []
})

describe('searchHotReport · 搜索热词聚合', () => {
  it('别名归并到 canonical 计数', async () => {
    const now = new Date().toISOString()
    hoist.events = [
      { eventName: 'search', params: { search_term: 'body wave', results: 5 }, createdAt: now, sessionId: 's1' },
      { eventName: 'search', params: { search_term: 'bodywave', results: 3 }, createdAt: now, sessionId: 's1' },
      { eventName: 'search', params: { search_term: 'wig', results: 10 }, createdAt: now, sessionId: 's2' },
      { eventName: 'search', params: { search_term: 'hairpiece', results: 2 }, createdAt: now, sessionId: 's2' },
    ]
    const svc = await import('../modules/shop/services/analyticsService.js')
    const r = await svc.searchHotReport({})
    const by = Object.fromEntries(r.keywords.map((k) => [k.term, k.count]))
    expect(by['body wave']).toBe(2)
    expect(by.wig).toBe(2)
    // 零结果：无 results=0 的事件 → rate 为 0（hasResultSignal=true 因为有 results 字段）
    expect(r.zeroResultSearches).toBe(0)
    expect(r.totalSearches).toBe(4)
  })

  it('results=0 计入零结果；无 results 字段时 rate 为 null', async () => {
    const now = new Date().toISOString()
    hoist.events = [
      { eventName: 'search', params: { search_term: 'zzz', results: 0 }, createdAt: now, sessionId: 's1' },
      { eventName: 'search', params: { search_term: 'yyy', results: 0 }, createdAt: now, sessionId: 's1' },
    ]
    const svc = await import('../modules/shop/services/analyticsService.js')
    const r = await svc.searchHotReport({})
    expect(r.zeroResultSearches).toBe(2)
    expect(r.zeroResultRate).toBe(1)

    hoist.events = [{ eventName: 'search', params: { search_term: 'noresultfield' }, createdAt: now, sessionId: 's1' }]
    const svc2 = await import('../modules/shop/services/analyticsService.js')
    const r2 = await svc2.searchHotReport({})
    expect(r2.zeroResultRate).toBeNull()
  })
})

describe('searchFunnelReport · 搜索转化漏斗', () => {
  it('按 sessionId 时序串联 search→view→add→purchase', async () => {
    const t0 = new Date('2026-11-11T10:00:00Z').getTime()
    const step = (offset: number) => new Date(t0 + offset).toISOString()
    hoist.events = [
      // 会话 A：完整走完漏斗
      { eventName: 'search', sessionId: 'A', createdAt: step(0) },
      { eventName: 'view_item', sessionId: 'A', createdAt: step(1000) },
      { eventName: 'add_to_cart', sessionId: 'A', createdAt: step(2000) },
      { eventName: 'purchase', sessionId: 'A', createdAt: step(3000) },
      // 会话 B：只搜索+浏览
      { eventName: 'search', sessionId: 'B', createdAt: step(0) },
      { eventName: 'view_item', sessionId: 'B', createdAt: step(500) },
      // 会话 C：view_item 早于 search（不计入漏斗）
      { eventName: 'view_item', sessionId: 'C', createdAt: step(0) },
      { eventName: 'search', sessionId: 'C', createdAt: step(1000) },
    ]
    const svc = await import('../modules/shop/services/analyticsService.js')
    const r = await svc.searchFunnelReport({})
    expect(r.searched).toBe(3) // A/B/C 都搜索过
    expect(r.viewed).toBe(2) // A、B（C 的 view 早于 search）
    expect(r.added).toBe(1) // A
    expect(r.purchased).toBe(1) // A
    expect(r.viewRate).toBeCloseTo(2 / 3, 2)
  })

  it('无 sessionId 事件不计入漏斗，仅计入 noSessionEvents', async () => {
    const now = new Date().toISOString()
    hoist.events = [
      { eventName: 'search', sessionId: null, createdAt: now },
      { eventName: 'view_item', sessionId: null, createdAt: now },
    ]
    const svc = await import('../modules/shop/services/analyticsService.js')
    const r = await svc.searchFunnelReport({})
    expect(r.searched).toBe(0)
    expect(r.noSessionEvents).toBe(2)
  })
})
