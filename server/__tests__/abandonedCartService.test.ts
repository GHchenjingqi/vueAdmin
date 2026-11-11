import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Op } from 'sequelize'

/**
 * 弃购召回服务测试（mock 模型层）：
 * - 1h / 24h 两档触发；idle 时间不足不触发
 * - 幂等：同 (cartId, tier, cartVersion) 只入队一次
 * - 已支付订单晚于 cart.updatedAt → 跳过（视为已下单）
 * - 顾客 unsubscribed → 跳过
 * - 游客购物车（customerId null）/ 顾客 blocked / 无 email → 跳过
 * - 空购物车 → 跳过
 */

const hoist = vi.hoisted(() => {
  const carts: Record<string, unknown>[] = []
  const cartItems: Record<string, unknown>[] = []
  const customers: Record<string, unknown>[] = []
  const orders: Record<string, unknown>[] = []
  const newsletters: Record<string, unknown>[] = []
  const outbox: Record<string, unknown>[] = []
  let idSeq = 1
  return { carts, cartItems, customers, orders, newsletters, outbox, idSeq }
})

vi.mock('../../modules/tenant/context.js', () => ({
  getTenantContext: () => ({ tenantId: 1 }),
  runInTenant: async (_ctx: unknown, fn: () => unknown) => fn(),
}))

function resetAll(): void {
  hoist.carts.length = 0
  hoist.cartItems.length = 0
  hoist.customers.length = 0
  hoist.orders.length = 0
  hoist.newsletters.length = 0
  hoist.outbox.length = 0
}

vi.mock('../modules/shop/models/index.js', () => ({
  ShopCart: {
    findAll: vi.fn(async (args: { where: Record<string, unknown> }) => {
      const where = args.where
      const upd = (where.updatedAt as { [Op.lt]?: Date })?.[Op.lt]
      return hoist.carts.filter((c) => {
        if (c.tenantId !== 1) return false
        if (where.customerId && typeof where.customerId === 'object' && Op.ne in (where.customerId as object)) {
          const ne = (where.customerId as { [Op.ne]?: number | null })[Op.ne]
          if (c.customerId === ne) return false
        }
        if (upd && new Date(String(c.updatedAt)) >= upd) return false
        return true
      })
    }),
  },
  ShopCartItem: {
    findAll: vi.fn(async (args: { where: Record<string, unknown> }) =>
      hoist.cartItems.filter((it) => it.tenantId === 1 && it.cartId === args.where.cartId)),
  },
  ShopCustomer: {
    findOne: vi.fn(async (args: { where: Record<string, unknown> }) =>
      hoist.customers.find((c) => c.id === args.where.id && c.tenantId === 1) ?? null),
  },
  ShopOrder: {
    findOne: vi.fn(async (args: { where: Record<string, unknown> }) => {
      const where = args.where
      const statusFilter = (where.status as { [Op.in]?: string[] })?.[Op.in]
      const createdAfter = (where.createdAt as { [Op.gt]?: Date })?.[Op.gt]
      return hoist.orders.find((o) => {
        if (o.tenantId !== 1 || o.email !== where.email) return false
        if (statusFilter && !statusFilter.includes(String(o.status))) return false
        if (createdAfter && new Date(String(o.createdAt)) <= createdAfter) return false
        return true
      }) ?? null
    }),
  },
  ShopNewsletter: {
    findOne: vi.fn(async (args: { where: Record<string, unknown> }) =>
      hoist.newsletters.find((n) => n.tenantId === 1 && n.email === args.where.email) ?? null),
  },
  ShopMailOutbox: {
    findOne: vi.fn(async (args: { where: Record<string, unknown> }) =>
      hoist.outbox.find((o) => o.tenantId === 1 && o.type === args.where.type && o.dedupeKey === args.where.dedupeKey) ?? null),
    create: vi.fn(async (rec: Record<string, unknown>) => {
      hoist.outbox.push({ ...rec, id: hoist.idSeq++ })
      return rec
    }),
    count: vi.fn(async () => hoist.outbox.length),
  },
}))

import * as svc from '../modules/storefront/services/abandonedCartService.js'

beforeEach(resetAll)

function seedCart(opts: {
  cartId?: number
  customerId?: number | null
  idleMs: number
  version?: number
  items?: { skuId: number; title?: string; qty?: number; unitAmountCents?: number }[]
  paidOrderAfterCart?: boolean
  unsubscribed?: boolean
  customerStatus?: string
}): void {
  const cartId = opts.cartId ?? hoist.carts.length + 1
  const customerId = opts.customerId === undefined ? 100 + cartId : opts.customerId
  const now = Date.now()
  const updatedAt = new Date(now - opts.idleMs).toISOString()
  const email = customerId ? `c${customerId}@test.com` : null
  hoist.carts.push({
    id: cartId, tenantId: 1, token: `tok-${cartId}`, customerId, currency: 'USD', locale: 'en-US',
    version: opts.version ?? 0, updatedAt,
  })
  if (email && customerId) {
    const exists = hoist.customers.find((c) => c.id === customerId)
    if (!exists) hoist.customers.push({ id: customerId, tenantId: 1, email, status: opts.customerStatus ?? 'active' })
  }
  if (opts.unsubscribed && email) hoist.newsletters.push({ tenantId: 1, email, status: 'unsubscribed' })
  for (const it of opts.items ?? []) {
    hoist.cartItems.push({
      tenantId: 1, cartId, skuId: it.skuId, spuId: it.skuId, qty: it.qty ?? 1,
      unitAmountCents: it.unitAmountCents ?? 1000, currency: 'USD', titleSnapshot: it.title ?? `Item ${it.skuId}`,
    })
  }
  if (opts.paidOrderAfterCart && email) {
    hoist.orders.push({ id: 9000 + cartId, tenantId: 1, email, status: 'paid', createdAt: new Date().toISOString() })
  }
}

const NOW = () => new Date()

it('1h 档：idle ≥1h 触发入队', async () => {
  seedCart({ cartId: 1, idleMs: 90 * 60 * 1000, items: [{ skuId: 11, qty: 2, unitAmountCents: 2000 }] })
  const r = await svc.scanAndNotify({ now: NOW(), tiers: ['1h'] })
  expect(r.queued).toBe(1)
  expect(r.skipped).toEqual({ paid: 0, unsubscribed: 0, noEmail: 0 })
  expect(hoist.outbox).toHaveLength(1)
  expect(hoist.outbox[0].type).toBe('abandoned_cart')
  expect(String(hoist.outbox[0].dedupeKey)).toContain(':1h:')
})

it('idle 不足 1h 不触发', async () => {
  seedCart({ cartId: 2, idleMs: 30 * 60 * 1000, items: [{ skuId: 11 }] })
  const r = await svc.scanAndNotify({ now: NOW(), tiers: ['1h'] })
  expect(r.queued).toBe(0)
  expect(hoist.outbox).toHaveLength(0)
})

it('24h 档：idle ≥24h 触发', async () => {
  seedCart({ cartId: 3, idleMs: 25 * 60 * 60 * 1000, items: [{ skuId: 11 }] })
  const r = await svc.scanAndNotify({ now: NOW(), tiers: ['24h'] })
  expect(r.queued).toBe(1)
  expect(String(hoist.outbox[0].dedupeKey)).toContain(':24h:')
})

it('幂等：同 cart 同档重复扫描只入队一次', async () => {
  seedCart({ cartId: 4, idleMs: 2 * 60 * 60 * 1000, items: [{ skuId: 11 }] })
  await svc.scanAndNotify({ now: NOW(), tiers: ['1h'] })
  const r2 = await svc.scanAndNotify({ now: NOW(), tiers: ['1h'] })
  expect(r2.queued).toBe(0)
  expect(hoist.outbox).toHaveLength(1)
})

it('cartVersion 变化（再次加购）可再次触发', async () => {
  seedCart({ cartId: 5, idleMs: 2 * 60 * 60 * 1000, version: 0, items: [{ skuId: 11 }] })
  await svc.scanAndNotify({ now: NOW(), tiers: ['1h'] })
  // 模拟顾客再次加购：version+1，updatedAt 刷新为 2h 前
  const c = hoist.carts.find((x) => x.id === 5)!
  c.version = 1
  c.updatedAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
  const r2 = await svc.scanAndNotify({ now: NOW(), tiers: ['1h'] })
  expect(r2.queued).toBe(1)
  expect(hoist.outbox).toHaveLength(2)
})

it('已支付订单晚于 cart.updatedAt → 跳过（已下单）', async () => {
  seedCart({ cartId: 6, idleMs: 2 * 60 * 60 * 1000, items: [{ skuId: 11 }], paidOrderAfterCart: true })
  const r = await svc.scanAndNotify({ now: NOW(), tiers: ['1h'] })
  expect(r.queued).toBe(0)
  expect(r.skipped.paid).toBe(1)
})

it('顾客 unsubscribed → 跳过', async () => {
  seedCart({ cartId: 7, idleMs: 2 * 60 * 60 * 1000, items: [{ skuId: 11 }], unsubscribed: true })
  const r = await svc.scanAndNotify({ now: NOW(), tiers: ['1h'] })
  expect(r.queued).toBe(0)
  expect(r.skipped.unsubscribed).toBe(1)
})

it('游客购物车（customerId null）→ DB 层过滤，不进入扫描', async () => {
  seedCart({ cartId: 8, customerId: null, idleMs: 2 * 60 * 60 * 1000, items: [{ skuId: 11 }] })
  const r = await svc.scanAndNotify({ now: NOW(), tiers: ['1h'] })
  expect(r.queued).toBe(0)
  // 游客购物车被 Op.ne: null 过滤，scanned=0（不入循环，不消耗 noEmail 计数）
  expect(r.scanned).toBe(0)
})

it('顾客 blocked → 跳过', async () => {
  seedCart({ cartId: 9, idleMs: 2 * 60 * 60 * 1000, items: [{ skuId: 11 }], customerStatus: 'blocked' })
  const r = await svc.scanAndNotify({ now: NOW(), tiers: ['1h'] })
  expect(r.queued).toBe(0)
  expect(r.skipped.noEmail).toBe(1)
})

it('空购物车（无明细）→ 跳过且不入队', async () => {
  seedCart({ cartId: 10, idleMs: 2 * 60 * 60 * 1000, items: [] })
  const r = await svc.scanAndNotify({ now: NOW(), tiers: ['1h'] })
  expect(r.queued).toBe(0)
  expect(hoist.outbox).toHaveLength(0)
})

it('正文含金额与明细（1h 与 24h 文案区分）', async () => {
  seedCart({ cartId: 11, idleMs: 25 * 60 * 60 * 1000, items: [{ skuId: 11, qty: 2, unitAmountCents: 12900, title: 'HD Lace Wig' }] })
  await svc.scanAndNotify({ now: NOW(), tiers: ['24h'] })
  expect(hoist.outbox).toHaveLength(1)
  const body = String(hoist.outbox[0].bodyText)
  expect(body).toContain('HD Lace Wig')
  expect(body).toContain('$258.00')
  expect(String(hoist.outbox[0].subject)).toMatch(/waiting|thinking/i)
})
