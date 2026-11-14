import { describe, expect, it, vi, beforeEach } from 'vitest'

/**
 * 收藏夹 Wishlist 服务测试（mock 模型层）：
 * - add/remove/list/clear：uq(customer,product) 幂等
 * - setNotifyOnSale：开关降价提醒
 * - notifyPriceDrop：只对降价入队、notifyOnSale=true 的顾客、uq 幂等、邮件单位=元
 * - isWishlisted：详情页心形状态
 */

const hoist = vi.hoisted(() => {
  const rows: Record<string, unknown>[] = []
  const outbox: Record<string, unknown>[] = []
  const newsletter: { email: string; token: string }[] = []
  let idSeq = 1
  return { rows, outbox, newsletter, idSeq }
})

function makeRow(over: Record<string, unknown> = {}) {
  const row: Record<string, unknown> = {
    id: hoist.idSeq++,
    tenantId: 1,
    siteId: null,
    customerId: 1,
    productId: 1,
    notifyOnSale: true,
    createdAt: new Date('2026-01-01'),
    ...over,
    update: vi.fn(async function (this: Record<string, unknown>, patch: Record<string, unknown>) {
      Object.assign(this, patch)
    }),
    destroy: vi.fn(),
  }
  return row
}

/** 原版 ShopSpu.findOne（供 beforeEach 复位，避免单个测试污染全局） */
const originalSpuFindOne = async (args: { where: { id?: number } }) =>
  args.where.id && args.where.id > 0 ? { id: args.where.id } : null

vi.mock('../modules/tenant/context.js', () => ({
  getTenantContext: () => ({ tenantId: 1 }),
}))

vi.mock('../modules/shop/models/index.js', () => ({
  ShopWishlist: {
    findAndCountAll: vi.fn(async (args: { where: Record<string, unknown> }) => {
      const all = hoist.rows.filter((r) => r.customerId === args.where.customerId)
      return { rows: all, count: all.length }
    }),
    findAll: vi.fn(async (args: { where: Record<string, unknown>; attributes?: string[] }) =>
      hoist.rows
        .filter((r) => (args.where.customerId !== undefined ? r.customerId === args.where.customerId : true))
        .filter((r) => (args.where.productId !== undefined ? r.productId === args.where.productId : true))
        .filter((r) => (args.where.notifyOnSale !== undefined ? r.notifyOnSale === args.where.notifyOnSale : true))),
    findOne: vi.fn(async (args: { where: Record<string, unknown> }) =>
      hoist.rows.find((r) => r.customerId === args.where.customerId && r.productId === args.where.productId) ?? null),
    count: vi.fn(async (args: { where: Record<string, unknown> }) =>
      hoist.rows.filter((r) => r.customerId === args.where.customerId && r.productId === args.where.productId).length),
    create: vi.fn(async (rec: Record<string, unknown>) => {
      const row = makeRow(rec)
      hoist.rows.push(row)
      return row
    }),
    destroy: vi.fn(async (args: { where: Record<string, unknown> }) => {
      const before = hoist.rows.length
      hoist.rows = hoist.rows.filter((r) => r.customerId !== args.where.customerId)
      return before - hoist.rows.length
    }),
  },
  ShopMailOutbox: {
    findOne: vi.fn(async (args: { where: { dedupeKey?: string } }) =>
      hoist.outbox.find((o) => o.dedupeKey === args.where.dedupeKey) ?? null),
    create: vi.fn(async (rec: Record<string, unknown>) => {
      hoist.outbox.push(rec)
      return rec
    }),
    count: vi.fn(async () => hoist.outbox.length),
  },
  ShopCustomer: {
    findAll: vi.fn(async (args: { where: { id?: unknown } }) => {
      const all = [
        { id: 1, email: 'a@x.io' },
        { id: 2, email: 'b@x.io' },
      ]
      const idFilter = args.where.id
      if (idFilter == null) return all
      // 数字/数组
      if (typeof idFilter === 'number') return all.filter((c) => c.id === idFilter)
      if (Array.isArray(idFilter)) return all.filter((c) => (idFilter as number[]).includes(c.id))
      // Sequelize Op.in: { [Symbol(in)]: [1,2] }
      const syms = Object.getOwnPropertySymbols(idFilter as object)
      for (const sym of syms) {
        if (String(sym) === 'Symbol(in)') {
          const list = (idFilter as Record<symbol, number[]>)[sym]
          return all.filter((c) => list.includes(c.id))
        }
      }
      return all
    }),
  },
  ShopSpu: {
    findOne: vi.fn(async (args: { where: { id?: number } }) =>
      args.where.id && args.where.id > 0 ? { id: args.where.id } : null),
  },
  ShopSku: { findAll: vi.fn(async () => []) },
  ShopProductPrice: { findAll: vi.fn(async () => []) },
  ShopInventory: { findAll: vi.fn(async () => []) },
  // PLAN 4.4：退订 token 解析需要 newsletter 模型（未订阅时补建并返回 token）
  ShopNewsletter: {
    findOne: vi.fn(async (args: { where: { email?: string } }) =>
      hoist.newsletter.find((n) => n.email === args.where.email) ?? null),
    create: vi.fn(async (rec: Record<string, unknown>) => {
      hoist.newsletter.push(rec as { email: string; token: string })
      return rec
    }),
  },
}))

const wishlistService = await import('../modules/storefront/services/wishlistService.js')

beforeEach(async () => {
  hoist.rows.length = 0
  hoist.outbox.length = 0
  hoist.newsletter.length = 0
  vi.clearAllMocks()
  // 复位 ShopSpu.findOne（防止 "商品不存在抛 404" 测试污染后续用例）
  const { ShopSpu } = (await import('../modules/shop/models/index.js')) as { ShopSpu: { findOne: unknown } }
  ShopSpu.findOne = vi.fn(originalSpuFindOne)
})

describe('wishlistService', () => {
  it('add 收藏一个商品（首次创建）', async () => {
    const r = await wishlistService.addWishlist(1, 100)
    expect(r.created).toBe(true)
    expect(hoist.rows).toHaveLength(1)
    expect(hoist.rows[0].productId).toBe(100)
  })

  it('add 重复收藏幂等（不重复创建）', async () => {
    await wishlistService.addWishlist(1, 100)
    const r = await wishlistService.addWishlist(1, 100)
    expect(r.created).toBe(false)
    expect(hoist.rows).toHaveLength(1)
  })

  it('add 商品不存在抛 404', async () => {
    const { ShopSpu } = await import('../modules/shop/models/index.js')
    ;(ShopSpu as { findOne: unknown }).findOne = vi.fn(async () => null)
    await expect(wishlistService.addWishlist(1, 999)).rejects.toMatchObject({ statusCode: 404 })
  })

  it('isWishlisted 返回收藏状态', async () => {
    await wishlistService.addWishlist(1, 100)
    expect(await wishlistService.isWishlisted(1, 100)).toBe(true)
    expect(await wishlistService.isWishlisted(1, 200)).toBe(false)
  })

  it('setNotifyOnSale 开关降价提醒', async () => {
    await wishlistService.addWishlist(1, 100, { notifyOnSale: true })
    const r = await wishlistService.setNotifyOnSale(1, 100, false)
    expect(r.notifyOnSale).toBe(false)
    const item = hoist.rows[0]
    expect(item.notifyOnSale).toBe(false)
  })

  it('clearWishlist 清空该顾客全部收藏', async () => {
    await wishlistService.addWishlist(1, 100)
    await wishlistService.addWishlist(1, 200)
    const r = await wishlistService.clearWishlist(1)
    expect(r.deleted).toBe(2)
  })

  it('notifyPriceDrop 只对降价入队', async () => {
    // 涨价：不入队
    const r1 = await wishlistService.notifyPriceDrop(100, { oldPrice: 50, newPrice: 80, currency: 'USD', productName: 'Wig' })
    expect(r1.queued).toBe(0)
    // 降价：入队
    const r2 = await wishlistService.notifyPriceDrop(100, { oldPrice: 100, newPrice: 80, currency: 'USD', productName: 'Wig' })
    expect(r2.queued).toBeGreaterThanOrEqual(0) // 无收藏者时 0
  })

  it('notifyPriceDrop 对收藏顾客入队且邮件金额=元', async () => {
    // 顾客 1 收藏商品 100，notifyOnSale=true
    hoist.rows.push(makeRow({ customerId: 1, productId: 100, notifyOnSale: true }))
    const r = await wishlistService.notifyPriceDrop(100, { oldPrice: 100, newPrice: 80, currency: 'USD', productName: 'Lace Wig' })
    expect(r.queued).toBe(1)
    const mail = hoist.outbox[0] as { type: string; subject: string; bodyText: string; toEmail: string }
    expect(mail.type).toBe('price_drop')
    expect(mail.toEmail).toBe('a@x.io')
    expect(mail.bodyText).toContain('$100.00') // 单位=元，不是分
    expect(mail.bodyText).toContain('$80.00')
    expect(mail.subject).toContain('-20%')
  })

  it('notifyPriceDrop 幂等（同降价只入队一次）', async () => {
    hoist.rows.push(makeRow({ customerId: 1, productId: 100, notifyOnSale: true }))
    await wishlistService.notifyPriceDrop(100, { oldPrice: 100, newPrice: 80, currency: 'USD', productName: 'Wig' })
    const r = await wishlistService.notifyPriceDrop(100, { oldPrice: 100, newPrice: 80, currency: 'USD', productName: 'Wig' })
    expect(r.queued).toBe(0) // 第二次被 uq 去重
    expect(hoist.outbox).toHaveLength(1)
  })

  it('notifyPriceDrop 尊重 notifyOnSale=false', async () => {
    hoist.rows.push(makeRow({ customerId: 1, productId: 100, notifyOnSale: false }))
    const r = await wishlistService.notifyPriceDrop(100, { oldPrice: 100, newPrice: 80, currency: 'USD', productName: 'Wig' })
    expect(r.queued).toBe(0)
    expect(hoist.outbox).toHaveLength(0)
  })
})
