import { describe, expect, it, vi, beforeEach } from 'vitest'
import { Op } from 'sequelize'

/**
 * 推荐服务测试（mock 模型层）：
 * - relatedForProduct：有协同（买了又买）→ strategy='coPurchase'；无协同但有同分类 → 'sameCategory'；无 → 'none'
 * - crossSellForCart：cart lines 协同 → 'coPurchase'；空协同 → 回退首 SKU 同分类 → 'sameCategory'
 * - 仅取已支付订单（status in paid/fulfilled/shipped/done）；未支付订单不构成信号
 * - 公开 SPU 过滤：exclude 下架 SPU
 */

/** 从 Sequelize where 子句提取 Op.in / Op.notIn 值（Op 是 Symbol key） */
function inValues(clause: unknown): number[] | null {
  if (!clause || typeof clause !== 'object') return null
  const desc = Object.getOwnPropertyDescriptor(clause as object, Op.in)
  if (desc) return desc.value as number[]
  const notInDesc = Object.getOwnPropertyDescriptor(clause as object, Op.notIn)
  if (notInDesc) return null // notIn 单独处理
  return null
}
function notInValues(clause: unknown): number[] | null {
  if (!clause || typeof clause !== 'object') return null
  const desc = Object.getOwnPropertyDescriptor(clause as object, Op.notIn)
  if (desc) return desc.value as number[]
  return null
}
function statusValues(clause: unknown): string[] | null {
  if (!clause || typeof clause !== 'object') return null
  const desc = Object.getOwnPropertyDescriptor(clause as object, Op.in)
  if (desc) return desc.value as string[]
  return null
}

// 协同计数：spuId → count
const hoist = vi.hoisted(() => {
  const orderItems: { orderId: number; skuId: number }[] = []
  const orders: { id: number; status: string }[] = []
  const skus: { id: number; spuId: number }[] = []
  const spus: { id: number; categoryId: number; status: string }[] = []
  let orderId = 100
  return { orderItems, orders, skus, spus, orderId }
})

vi.mock('../modules/tenant/context.js', () => ({
  getTenantContext: () => ({ tenantId: 1 }),
}))

vi.mock('../modules/shop/models/index.js', () => ({
  ShopOrderItem: {
    findAll: vi.fn(async (args: { where: Record<string, unknown>; attributes?: string[] }) => {
      const where = args.where
      // Step 1: by skuId in → return orderId 列表
      const skuFilter = inValues(where.skuId)
      if (skuFilter) {
        return hoist.orderItems
          .filter((r) => skuFilter.includes(r.skuId))
          .map((r) => ({ orderId: r.orderId }))
      }
      // Step 3: by orderId in → return skuId 列表
      const orderFilter = inValues(where.orderId)
      if (orderFilter) {
        return hoist.orderItems
          .filter((r) => orderFilter.includes(r.orderId))
          .map((r) => ({ skuId: r.skuId }))
      }
      return hoist.orderItems
    }),
  },
  ShopOrder: {
    findAll: vi.fn(async (args: { where: Record<string, unknown> }) => {
      const where = args.where
      const ids = inValues(where.id) ?? []
      const paidStatuses = ['paid', 'fulfilled', 'shipped', 'done']
      return hoist.orders.filter((o) => ids.includes(o.id) && paidStatuses.includes(o.status))
    }),
  },
  ShopSku: {
    findAll: vi.fn(async (args: { where: Record<string, unknown> }) => {
      const where = args.where
      // by spuId（跨 SKU 找 SPU 下所有 SKU）
      if (where.spuId !== undefined && where.spuId !== null) {
        return hoist.skus.filter((s) => s.spuId === where.spuId)
      }
      // by id in（skuId → spuId 映射）
      const idFilter = inValues(where.id)
      if (idFilter) return hoist.skus.filter((s) => idFilter.includes(s.id))
      return hoist.skus
    }),
  },
  ShopSpu: {
    findAll: vi.fn(async (args: { where: Record<string, unknown>; attributes?: string[] }) => {
      const where = args.where
      const publicStatuses = ['listed', 'published']
      const statusFilter = statusValues(where.status)
      const idIn = inValues(where.id)
      const idNotIn = notInValues(where.id)
      const result = hoist.spus.filter((s) => {
        if (where.categoryId !== undefined && where.categoryId !== s.categoryId) return false
        if (statusFilter && !statusFilter.some((x) => publicStatuses.includes(x) && publicStatuses.includes(s.status))) return false
        if (idIn && !idNotIn && !idIn.includes(s.id)) return false
        if (idNotIn && idNotIn.includes(s.id)) return false
        return true
      })
      return args.attributes?.length === 1 && args.attributes[0] === 'id' ? result.map((s) => ({ id: s.id })) : result
    }),
    findOne: vi.fn(async (args: { where: Record<string, unknown> }) =>
      hoist.spus.find((s) => s.id === args.where.id) ?? null),
  },
  ShopProductPrice: { findAll: vi.fn(async () => []) },
  ShopInventory: { findAll: vi.fn(async () => []) },
}))

// catalogService.listProducts 真实依赖 ShopSpu/ShopSku/ShopProductPrice/ShopInventory；
// 我们替换为简单实现：按 ids 过滤 hoist.spus，返回投影（价格 null/库存 true）
vi.mock('./catalogService.js', () => ({
  listProducts: vi.fn(async (params: { ids?: string; pageSize?: number }) => {
    const ids = (params.ids ?? '').split(',').map((s) => Number(s.trim())).filter((n) => Number.isInteger(n) && n > 0)
    const items = ids
      .map((id) => hoist.spus.find((s) => s.id === id))
      .filter((s): s is { id: number; categoryId: number; status: string } => !!s)
      .map((s) => ({
        id: s.id,
        slug: `p-${s.id}`,
        title: `Product ${s.id}`,
        cover: null,
        images: [],
        categoryId: s.categoryId,
        brandId: null,
        price: null,
        inStock: true,
      }))
    return { list: items, total: items.length, page: 1, pageSize: params.pageSize ?? 20, currency: 'USD', lang: 'en-US' }
  }),
}))

import * as recommendationService from '../modules/storefront/services/recommendationService.js'

beforeEach(() => {
  hoist.orderItems.length = 0
  hoist.orders.length = 0
  hoist.skus.length = 0
  hoist.spus.length = 0
})

function seedProductSet(): void {
  // 3 个 SPU：cat=10（1,2,3）、cat=20（5）；
  // skuA(1)->spu 1；skuB(2)->spu 2；skuC(3)->spu 3
  hoist.spus.push({ id: 1, categoryId: 10, status: 'listed' })
  hoist.spus.push({ id: 2, categoryId: 10, status: 'listed' })
  hoist.spus.push({ id: 3, categoryId: 10, status: 'listed' })
  hoist.spus.push({ id: 5, categoryId: 20, status: 'listed' })
  hoist.skus.push({ id: 1, spuId: 1 })
  hoist.skus.push({ id: 2, spuId: 2 })
  hoist.skus.push({ id: 3, spuId: 3 })
}

it('relatedForProduct coPurchase: 有已支付同单 → strategy=coPurchase + 按 count 倒序', async () => {
  seedProductSet()
  // 订单 100 已支付：含 skuA(1)（原商品），协同 skuB(2)+skuC(3) 两次共现
  hoist.orders.push({ id: 100, status: 'paid' })
  hoist.orders.push({ id: 101, status: 'paid' })
  hoist.orderItems.push({ orderId: 100, skuId: 1 })
  hoist.orderItems.push({ orderId: 100, skuId: 2 })
  hoist.orderItems.push({ orderId: 101, skuId: 1 })
  hoist.orderItems.push({ orderId: 101, skuId: 2 })
  hoist.orderItems.push({ orderId: 100, skuId: 3 })

  const r = await recommendationService.relatedForProduct({ id: 1 }, { limit: 6 })
  expect(r.strategy).toBe('coPurchase')
  expect(r.items.length).toBeGreaterThan(0)
  // spu 2 出现两次，应排第一
  expect(r.items[0]?.id).toBe(2)
})

it('relatedForProduct sameCategory: 无协同 → 回退同分类', async () => {
  seedProductSet()
  // 无订单数据
  const r = await recommendationService.relatedForProduct({ id: 1 }, { limit: 6 })
  expect(r.strategy).toBe('sameCategory')
  // 同分类 cat=10：SPU 2, 3（排除自身 1）
  expect(r.items.map((x) => x.id).sort()).toEqual([2, 3])
})

it('relatedForProduct 过滤未支付订单信号', async () => {
  seedProductSet()
  // 订单 100 状态 created（未支付），不应构成协同信号
  hoist.orders.push({ id: 100, status: 'created' })
  hoist.orderItems.push({ orderId: 100, skuId: 1 })
  hoist.orderItems.push({ orderId: 100, skuId: 2 })
  const r = await recommendationService.relatedForProduct({ id: 1 }, { limit: 6 })
  expect(r.strategy).toBe('sameCategory') // 协同为空 → 兜底同分类
})

it('relatedForProduct exclude 下架 SPU', async () => {
  seedProductSet()
  // spu 2 改为 draft（不公开）：协同命中 spu 2 但被过滤 → 空 → 回退同分类（返回 spu 3）
  hoist.spus[1].status = 'draft'
  hoist.orders.push({ id: 100, status: 'paid' })
  hoist.orderItems.push({ orderId: 100, skuId: 1 })
  hoist.orderItems.push({ orderId: 100, skuId: 2 })
  const r = await recommendationService.relatedForProduct({ id: 1 }, { limit: 6 })
  // 协同被下架 SPU 消耗 → 回退同分类（strategy=sameCategory，非 coPurchase）
  expect(r.strategy).toBe('sameCategory')
  expect(r.items.map((x) => x.id)).not.toContain(2)
  expect(r.items.map((x) => x.id)).toContain(3)
})

it('crossSellForCart coPurchase: cart=[skuA] → 协同 skuB', async () => {
  seedProductSet()
  hoist.orders.push({ id: 100, status: 'paid' })
  hoist.orderItems.push({ orderId: 100, skuId: 1 })
  hoist.orderItems.push({ orderId: 100, skuId: 2 })
  const r = await recommendationService.crossSellForCart([{ skuId: 1, qty: 1 }], { limit: 6 })
  expect(r.strategy).toBe('coPurchase')
  expect(r.items.map((x) => x.id)).toContain(2)
})

it('crossSellForCart sameCategory fallback: 无协同 → 首行同分类', async () => {
  seedProductSet()
  const r = await recommendationService.crossSellForCart([{ skuId: 1, qty: 1 }], { limit: 6 })
  expect(r.strategy).toBe('sameCategory')
  expect(r.items.map((x) => x.id).sort()).toEqual([2, 3])
})

it('crossSellForCart 空购物车 → none', async () => {
  const r = await recommendationService.crossSellForCart([], { limit: 6 })
  expect(r.strategy).toBe('none')
  expect(r.items).toEqual([])
})
