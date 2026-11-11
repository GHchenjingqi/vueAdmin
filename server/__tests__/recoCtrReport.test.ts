import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Op } from 'sequelize'

/**
 * 推荐效果 CTR 聚合测试（mock 模型层）：
 * - 曝光 = view_item_list + params.placement 非空
 * - 点击 = select_item + params.placement 非空
 * - 按 (placement, strategy) 分组统计 impressions/clicks/ctr
 * - 无 placement 的事件不纳入
 * - 空窗口 → items=[], summary=[]
 */

const hoist = vi.hoisted(() => {
  const events: Record<string, unknown>[] = []
  return { events }
})

vi.mock('../modules/tenant/context.js', () => ({
  getTenantContext: () => ({ tenantId: 1 }),
}))

vi.mock('../modules/shop/models/index.js', () => ({
  ShopAnalyticsEvent: {
    findAll: vi.fn(async (args: { where?: Record<string, unknown> } = {}) => {
      const eventNameFilter = args.where?.eventName as { [Op.in]?: string[] }
      if (eventNameFilter?.[Op.in]) {
        return hoist.events.filter((e) => (eventNameFilter[Op.in] as string[]).includes(String(e.eventName)))
      }
      return hoist.events
    }),
  },
}))

import * as svc from '../modules/shop/services/analyticsService.js'

beforeEach(() => {
  hoist.events.length = 0
})

function pushEvent(eventName: string, params: Record<string, unknown>): void {
  hoist.events.push({ eventName, params, createdAt: new Date() })
}

it('曝光+点击聚合：按 placement+strategy 正确计算 ctr', async () => {
  // related + coPurchase：5 曝光 2 点击 → ctr=0.4
  pushEvent('view_item_list', { placement: 'related', strategy: 'coPurchase' })
  pushEvent('view_item_list', { placement: 'related', strategy: 'coPurchase' })
  pushEvent('view_item_list', { placement: 'related', strategy: 'coPurchase' })
  pushEvent('view_item_list', { placement: 'related', strategy: 'coPurchase' })
  pushEvent('view_item_list', { placement: 'related', strategy: 'coPurchase' })
  pushEvent('select_item', { placement: 'related', strategy: 'coPurchase' })
  pushEvent('select_item', { placement: 'related', strategy: 'coPurchase' })
  // related + sameCategory：3 曝光 1 点击 → ctr≈0.3333
  pushEvent('view_item_list', { placement: 'related', strategy: 'sameCategory' })
  pushEvent('view_item_list', { placement: 'related', strategy: 'sameCategory' })
  pushEvent('view_item_list', { placement: 'related', strategy: 'sameCategory' })
  pushEvent('select_item', { placement: 'related', strategy: 'sameCategory' })
  // cross_sell + coPurchase：4 曝光 0 点击 → ctr=0
  pushEvent('view_item_list', { placement: 'cross_sell', strategy: 'coPurchase' })
  pushEvent('view_item_list', { placement: 'cross_sell', strategy: 'coPurchase' })
  pushEvent('view_item_list', { placement: 'cross_sell', strategy: 'coPurchase' })
  pushEvent('view_item_list', { placement: 'cross_sell', strategy: 'coPurchase' })

  const r = await svc.recommendationCtrReport()
  expect(r.items).toHaveLength(3)

  const byKey = new Map(r.items.map((x) => [`${x.placement}|${x.strategy}`, x]))

  const relCo = byKey.get('related|coPurchase')!
  expect(relCo.impressions).toBe(5)
  expect(relCo.clicks).toBe(2)
  expect(relCo.ctr).toBeCloseTo(0.4, 2)

  const relCat = byKey.get('related|sameCategory')!
  expect(relCat.impressions).toBe(3)
  expect(relCat.clicks).toBe(1)
  expect(relCat.ctr).toBeCloseTo(0.3333, 3)

  const csCo = byKey.get('cross_sell|coPurchase')!
  expect(csCo.impressions).toBe(4)
  expect(csCo.clicks).toBe(0)
  expect(csCo.ctr).toBe(0)

  // summary：related 汇总 (5+3)=8 曝光，(2+1)=3 点击 → ctr≈0.375
  expect(r.summary).toHaveLength(2)
  const relSum = r.summary.find((s) => s.placement === 'related')!
  expect(relSum.impressions).toBe(8)
  expect(relSum.clicks).toBe(3)
  expect(relSum.ctr).toBeCloseTo(0.375, 3)
  const csSum = r.summary.find((s) => s.placement === 'cross_sell')!
  expect(csSum.impressions).toBe(4)
  expect(csSum.clicks).toBe(0)
  expect(csSum.ctr).toBe(0)
})

it('无 placement 字段的事件不纳入', async () => {
  pushEvent('view_item_list', {}) // 无 placement
  pushEvent('select_item', { strategy: 'coPurchase' }) // 无 placement
  const r = await svc.recommendationCtrReport()
  expect(r.items).toHaveLength(0)
})

it('非推荐事件（view_item / add_to_cart）不纳入', async () => {
  pushEvent('view_item', { placement: 'related', strategy: 'coPurchase' })
  pushEvent('add_to_cart', { placement: 'related', strategy: 'coPurchase' })
  const r = await svc.recommendationCtrReport()
  expect(r.items).toHaveLength(0)
})

it('空窗口 → items=[], summary=[]', async () => {
  const r = await svc.recommendationCtrReport()
  expect(r.items).toEqual([])
  expect(r.summary).toEqual([])
  expect(r.startAt).toBeTruthy()
  expect(r.endAt).toBeTruthy()
})

it('strategy 缺失时默认 unknown', async () => {
  pushEvent('view_item_list', { placement: 'related' })
  pushEvent('select_item', { placement: 'related' })
  const r = await svc.recommendationCtrReport()
  expect(r.items).toHaveLength(1)
  expect(r.items[0].strategy).toBe('unknown')
  expect(r.items[0].impressions).toBe(1)
  expect(r.items[0].clicks).toBe(1)
  expect(r.items[0].ctr).toBe(1)
})
