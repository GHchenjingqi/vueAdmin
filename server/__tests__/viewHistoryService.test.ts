import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * viewHistoryService 单测：
 * - 复用 shop_analytics_events 的 view_item 事件（登录按 customerId / 游客按 sessionId）
 * - skuId → productId（spuId）映射，去重到 SPU 保留最近一次，按最近浏览倒序
 * - 无身份 / 无 item_id / 上限截断
 */

const hoist: { events: Record<string, unknown>[]; skus: { id: number; spuId: number }[] } = {
  events: [],
  skus: [],
}

vi.mock('../modules/tenant/context.js', () => ({
  getTenantContext: () => ({ tenantId: 1 }),
}))

vi.mock('../modules/shop/models/index.js', () => ({
  ShopAnalyticsEvent: {
    findAll: vi.fn(async (args: { where: Record<string, unknown>; limit?: number }) => {
      let rows = hoist.events.filter((e) => e.tenantId === args.where.tenantId && e.eventName === args.where.eventName)
      if (args.where.customerId !== undefined) {
        if (args.where.customerId === null) rows = rows.filter((e) => e.customerId === null)
        else rows = rows.filter((e) => e.customerId === args.where.customerId)
      }
      if (args.where.sessionId !== undefined) rows = rows.filter((e) => e.sessionId === args.where.sessionId)
      // 真实 findAll 按 createdAt DESC 排序，mock 显式排序以匹配
      rows = [...rows].sort((a, b) => new Date(b.createdAt as string).getTime() - new Date(a.createdAt as string).getTime())
      return rows.slice(0, args.limit ?? 200).map((e) => ({ params: e.params, createdAt: new Date(e.createdAt as string) }))
    }),
  },
  ShopSku: {
    findAll: vi.fn(async (args: { where: { id: { [Op: symbol]: number[] } } }) => {
      const ids = args.where.id[Object.getOwnPropertySymbols(args.where.id)[0]] as number[]
      return hoist.skus.filter((s) => ids.includes(s.id))
    }),
  },
}))

const viewHistoryService = await import('../modules/storefront/services/viewHistoryService.js')

const at = (iso: string) => new Date(iso)
const viewEvent = (over: Record<string, unknown>) => ({
  tenantId: 1,
  eventName: 'view_item',
  ...over,
})

beforeEach(() => {
  hoist.events.length = 0
  hoist.skus.length = 0
  vi.clearAllMocks()
})

describe('viewHistoryService.listViewHistory', () => {
  it('无身份返回空数组', async () => {
    expect(await viewHistoryService.listViewHistory({})).toEqual([])
  })

  it('登录顾客按 customerId 取浏览历史并映射到 productId', async () => {
    hoist.skus.push({ id: 11, spuId: 100 })
    // 倒序排列：最新在前
    hoist.events.push(
      viewEvent({ customerId: 1, sessionId: null, params: { items: [{ item_id: '11' }] }, createdAt: at('2026-01-02T00:00:00Z') }),
    )
    const items = await viewHistoryService.listViewHistory({ customerId: 1 })
    expect(items).toHaveLength(1)
    expect(items[0].productId).toBe(100)
  })

  it('去重到 SPU：多次浏览同 SPU 只保留最近一次', async () => {
    hoist.skus.push({ id: 11, spuId: 100 }, { id: 12, spuId: 100 })
    hoist.events.push(
      // sku 12 更早，sku 11 更新——同一 SPU 100
      viewEvent({ customerId: 1, sessionId: null, params: { items: [{ item_id: '12' }] }, createdAt: at('2026-01-01T00:00:00Z') }),
      viewEvent({ customerId: 1, sessionId: null, params: { items: [{ item_id: '11' }] }, createdAt: at('2026-01-03T00:00:00Z') }),
    )
    const items = await viewHistoryService.listViewHistory({ customerId: 1 })
    expect(items).toHaveLength(1)
    expect(items[0].productId).toBe(100)
    expect(items[0].lastViewedAt).toEqual(at('2026-01-03T00:00:00Z')) // 最近一次
  })

  it('多个 SPU 按最近浏览倒序排列', async () => {
    hoist.skus.push({ id: 11, spuId: 100 }, { id: 21, spuId: 200 }, { id: 31, spuId: 300 })
    hoist.events.push(
      viewEvent({ customerId: 1, sessionId: null, params: { items: [{ item_id: '21' }] }, createdAt: at('2026-01-02T00:00:00Z') }),
      viewEvent({ customerId: 1, sessionId: null, params: { items: [{ item_id: '31' }] }, createdAt: at('2026-01-03T00:00:00Z') }),
      viewEvent({ customerId: 1, sessionId: null, params: { items: [{ item_id: '11' }] }, createdAt: at('2026-01-01T00:00:00Z') }),
    )
    const items = await viewHistoryService.listViewHistory({ customerId: 1 })
    expect(items.map((i) => i.productId)).toEqual([300, 200, 100])
  })

  it('游客按 sessionId 查（customerId 为 null）', async () => {
    hoist.skus.push({ id: 11, spuId: 100 })
    hoist.events.push(
      viewEvent({ customerId: null, sessionId: 'anon-abc', params: { items: [{ item_id: '11' }] }, createdAt: at('2026-01-02T00:00:00Z') }),
    )
    const items = await viewHistoryService.listViewHistory({ sessionId: 'anon-abc' })
    expect(items).toHaveLength(1)
    expect(items[0].productId).toBe(100)
  })

  it('无有效 item_id 返回空数组', async () => {
    hoist.events.push(
      viewEvent({ customerId: 1, sessionId: null, params: { items: [{ item_id: 'bad' }] }, createdAt: at('2026-01-02T00:00:00Z') }),
    )
    expect(await viewHistoryService.listViewHistory({ customerId: 1 })).toEqual([])
  })

  it('limit 截断到上限 50', async () => {
    hoist.skus.push({ id: 11, spuId: 100 })
    hoist.events.push(
      viewEvent({ customerId: 1, sessionId: null, params: { items: [{ item_id: '11' }] }, createdAt: at('2026-01-02T00:00:00Z') }),
    )
    const items = await viewHistoryService.listViewHistory({ customerId: 1 }, 999)
    expect(items.length).toBeLessThanOrEqual(50)
  })
})
