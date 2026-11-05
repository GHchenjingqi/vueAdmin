// @vitest-environment node
/**
 * G4 埋点对账查询测试（P4-T17 技术缺口①：analytics events admin 对账端点的 service 层）
 *
 * 覆盖：dispatchStatus 过滤、eventName 过滤、orderId 过滤 + limit 截断 + 倒序。
 * 事件 ID 使用时间戳后缀避免与既有数据/并行运行冲突；afterAll 按前缀清理。
 */
import { describe, it, expect, afterAll } from 'vitest'
import { Op } from 'sequelize'
import { listEventsForReconcile } from '../modules/shop/services/analyticsService.js'
import { ShopAnalyticsEvent } from '../modules/shop/models/index.js'
import { runInTenant } from '../modules/tenant/context.js'

const TID = 1
const RUN = Date.now().toString(36)
const PREFIX = `reconcile-test-${RUN}-`

async function seed(eventName: string, dispatchStatus: string, orderId: number | null) {
  return ShopAnalyticsEvent.create({
    tenantId: TID,
    eventId: `${PREFIX}${eventName}-${dispatchStatus}-${Math.random().toString(36).slice(2, 8)}`,
    eventName,
    consentAnalytics: dispatchStatus !== 'skipped_no_consent',
    orderId,
    currency: 'USD',
    valueCents: 12990,
    dispatchStatus,
  } as never)
}

afterAll(async () => {
  const where: Record<string | symbol, unknown> = { eventId: { [Op.like]: `${PREFIX}%` } }
  await ShopAnalyticsEvent.destroy({ where: where as never })
})

describe('G4 埋点对账查询 listEventsForReconcile', () => {
  it('按 dispatchStatus 过滤：只返回匹配派发状态的事件', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      await seed('purchase', 'sent', null)
      await seed('purchase', 'sent', null)
      await seed('add_to_cart', 'local_only', null)
      const rows = await listEventsForReconcile({ dispatchStatus: 'sent', limit: 500 })
      const mine = rows.filter((r) => r.eventId.startsWith(PREFIX))
      expect(mine.length).toBe(2)
      for (const r of mine) expect(r.dispatchStatus).toBe('sent')
    })
  })

  it('按 eventName 过滤：只返回指定事件名', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      await seed('refund', 'sent', null)
      await seed('purchase', 'sent', null)
      const rows = await listEventsForReconcile({ eventName: 'refund', limit: 500 })
      const mine = rows.filter((r) => r.eventId.startsWith(PREFIX))
      expect(mine.length).toBeGreaterThanOrEqual(1)
      for (const r of mine) expect(r.eventName).toBe('refund')
    })
  })

  it('按 orderId 过滤 + limit 截断 + createdAt 倒序', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const orderId = 990000 + (Date.now() % 100000)
      await seed('purchase', 'sent', orderId)
      await new Promise((r) => setTimeout(r, 15))
      await seed('purchase', 'failed', orderId)
      const all = await listEventsForReconcile({ orderId, limit: 500 })
      const mine = all.filter((r) => r.eventId.startsWith(PREFIX))
      expect(mine.length).toBe(2)
      expect(mine[0].dispatchStatus).toBe('failed')
      expect(mine[0].createdAt.getTime()).toBeGreaterThanOrEqual(mine[1].createdAt.getTime())
      const limited = await listEventsForReconcile({ orderId, limit: 1 })
      expect(limited.length).toBe(1)
      // limit 越界钳制：0 → 1，9999 → 500
      const clampedLow = await listEventsForReconcile({ orderId, limit: 0 })
      expect(clampedLow.length).toBe(1)
    })
  })
})
