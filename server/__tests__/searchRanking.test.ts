// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * 搜索排序加权单测（搜索增强二期，mock 模型层）：
 * - 标题含完整关键词 > 标题含同义变体 > 有货加权
 * - 仅 keyword 非空且非 ids 精确取时启用（纯浏览/分类路径不重排）
 *
 * 内存 mock 模拟 JSON_SEARCH 子串语义：ShopSpu.findAll 读当前用例注入的 variants 做 LIKE 匹配。
 */

const hoist = vi.hoisted(() => {
  const state = {
    spus: [] as Record<string, unknown>[],
    skus: [] as Record<string, unknown>[],
    prices: [] as Record<string, unknown>[],
    inventories: [] as Record<string, unknown>[],
    variants: [] as string[], // 当前用例注入的同义变体（模拟 expandTerm 产物）
  }
  return state
})

vi.mock('../modules/tenant/context.js', () => ({
  getTenantContext: () => ({ tenantId: 1 }),
  runInTenant: async (_c: unknown, fn: () => unknown) => fn(),
}))

vi.mock('../modules/shop/models/index.js', () => ({
  ShopSpu: {
    findAll: vi.fn(async () =>
      hoist.spus.filter((s) => {
        if (s.tenantId !== 1) return false
        if (!['listed', 'published'].includes(String(s.status))) return false
        if (hoist.variants.length) {
          const raw = typeof s.name === 'string' ? s.name : JSON.stringify(s.name ?? '')
          const low = raw.toLowerCase()
          if (!hoist.variants.some((v) => low.includes(v.toLowerCase()))) return false
        }
        return true
      }),
    ),
  },
  ShopSku: { findAll: vi.fn(async () => hoist.skus) },
  ShopProductPrice: { findAll: vi.fn(async () => hoist.prices) },
  ShopInventory: { findAll: vi.fn(async () => hoist.inventories) },
}))

beforeEach(() => {
  hoist.spus = []
  hoist.skus = []
  hoist.prices = []
  hoist.inventories = []
  hoist.variants = []
})

describe('搜索排序加权', () => {
  it('标题完整命中 > 同义变体命中；同等命中下有货靠前', async () => {
    hoist.spus = [
      { id: 1, tenantId: 1, status: 'published', name: { 'en-US': 'Silky Bodywave Wig' }, categoryId: 1, cover: null, images: [] },
      { id: 2, tenantId: 1, status: 'published', name: { 'en-US': 'HD Body Wave Wig' }, categoryId: 1, cover: null, images: [] },
      { id: 3, tenantId: 1, status: 'published', name: { 'en-US': 'Deep Body Wave Wig' }, categoryId: 1, cover: null, images: [] },
    ]
    hoist.skus = [
      { id: 11, spuId: 1, tenantId: 1 },
      { id: 22, spuId: 2, tenantId: 1 },
      { id: 33, spuId: 3, tenantId: 1 },
    ]
    hoist.prices = [100, 100, 100].map((amount, i) => ({
      skuId: [11, 22, 33][i], tenantId: 1, currency: 'USD', amount,
    }))
    // 3 无货；1/2 有货
    hoist.inventories = [
      { skuId: 11, tenantId: 1, quantity: 5, locked: 0 },
      { skuId: 22, tenantId: 1, quantity: 5, locked: 0 },
      { skuId: 33, tenantId: 1, quantity: 0, locked: 0 },
    ]
    hoist.variants = ['body wave', 'bodywave', 'body wavy']

    const { listProducts } = await import('../modules/storefront/services/catalogService.js')
    const { list } = await listProducts({ keyword: 'body wave', pageSize: 10 })
    // B(2,完整+有货) > C(3,完整+无货) > A(1,变体+有货)
    expect(list.map((p) => p.id)).toEqual([2, 3, 1])
  })
})
