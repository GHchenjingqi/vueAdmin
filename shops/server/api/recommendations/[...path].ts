import { apiFetch } from '@shared/api/client'
import { MOCK_PRODUCTS } from '@shared/mock/fixtures'
import { getCommerceSource } from '../../utils/commerce'

/**
 * BFF recommendation proxy（P6 推荐 + 相关商品）：
 * - GET  /api/recommendations/home?limit=              首页「为你推荐」（热销→最新兜底）
 * - GET  /api/recommendations/related?productId=&limit=   详情页看了又看
 * - POST /api/recommendations/cross-sell   body={lines:[{skuId,qty}]}   购物车买了又买
 *
 * 真实模式：解包 {code:0,data} 信封，透传 catalogService 投影（已是 C 端字段）；
 * mock 模式：基于 MOCK_PRODUCTS 按同分类兜底返回（无订单历史可协同）。
 */

interface RawEnvelope<T> { code: number; data: T }

interface RecItem {
  id: number
  slug: string
  title: string
  cover: string | null
  price: { amount: number; currency: string } | null
  inStock: boolean
  category?: { id: number; name: string; slug: string } | null
}

interface RecResponse {
  items: RecItem[]
  strategy: 'coPurchase' | 'sameCategory' | 'mixed' | 'hot' | 'new' | 'none'
}

/** mock：同分类兜底（MOCK_PRODUCTS 已有 category.id/slug） */
function mockRecommend(productId: number | null, cartCategoryIds: number[], limit: number): RecResponse {
  const excludeIds = new Set<number>(productId ? [productId] : [])
  const pool = MOCK_PRODUCTS.filter((p) => !excludeIds.has(p.id))
  // 优先同分类（详情页：取该商品 category.id；购物车：取购物车行的 category.id 列表）
  const catIds = new Set(cartCategoryIds)
  const same = pool.filter((p) => p.category && catIds.has(p.category.id))
  const items = (same.length ? same : pool).slice(0, limit).map((p) => ({
    id: p.id,
    slug: p.slug,
    title: p.title,
    cover: p.cover,
    price: p.price,
    inStock: p.inStock,
    category: p.category ?? null,
  }))
  return { items, strategy: same.length ? 'sameCategory' : items.length ? 'sameCategory' : 'none' }
}

export default defineEventHandler(async (event) => {
  const url = getRequestURL(event)
  const method = event.method
  const query = getQuery(event)
  const isMock = getCommerceSource() === 'mock'
  const apiBase = useRuntimeConfig().apiBase as string

  if (method === 'GET' && url.pathname.endsWith('/home')) {
    const limit = Math.min(Math.max(1, Number(query.limit) || 8), 12)

    if (isMock) return mockRecommend(null, [], limit)

    const qs = new URLSearchParams({ limit: String(limit) })
    if (typeof query.currency === 'string' && query.currency) qs.set('currency', query.currency)
    if (typeof query.lang === 'string' && query.lang) qs.set('lang', query.lang)

    try {
      const raw = await apiFetch<RawEnvelope<RecResponse>>(`${apiBase}/api/storefront/v1/recommendations/home?${qs}`, {
        timeoutMs: 5000,
        retries: 0,
        requestId: event.context.requestId as string | undefined,
      })
      if (raw && typeof raw === 'object' && 'code' in raw && raw.code === 0 && raw.data) return raw.data
    } catch {
      /* 网络失败 → 空返回（推荐位静默降级，不打断主链路） */
    }
    return { items: [], strategy: 'none' } as RecResponse
  }

  if (method === 'GET' && url.pathname.endsWith('/related')) {
    const productId = Number(query.productId)
    const limit = Math.min(Math.max(1, Number(query.limit) || 6), 12)

    if (isMock) return mockRecommend(productId, [], limit)

    const qs = new URLSearchParams({ productId: String(productId), limit: String(limit) })
    if (typeof query.currency === 'string' && query.currency) qs.set('currency', query.currency)
    if (typeof query.lang === 'string' && query.lang) qs.set('lang', query.lang)

    try {
      const raw = await apiFetch<RawEnvelope<RecResponse>>(`${apiBase}/api/storefront/v1/recommendations/related?${qs}`, {
        timeoutMs: 5000,
        retries: 0,
        requestId: event.context.requestId as string | undefined,
      })
      if (raw && typeof raw === 'object' && 'code' in raw && raw.code === 0 && raw.data) return raw.data
    } catch {
      /* 网络失败 → 空返回（推荐位静默降级，不打断主链路） */
    }
    return { items: [], strategy: 'none' } as RecResponse
  }

  if (method === 'POST' && url.pathname.endsWith('/cross-sell')) {
    const body = (await readBody<{ lines?: { skuId: number; qty: number }[]; limit?: number }>(event)) ?? { lines: [] }
    const lines = Array.isArray(body.lines) ? body.lines.slice(0, 50) : []
    const limit = Math.min(Math.max(1, Number(body.limit) || 6), 12)

    if (isMock) {
      // 购物车 mock：MOCK_PRODUCTS 中按行 skuId 反查（skuId ≈ productId*100+i），回退取全部
      const cartCatIds: number[] = []
      for (const line of lines) {
        const pid = Math.floor(line.skuId / 100)
        const p = MOCK_PRODUCTS.find((x) => x.id === pid)
        if (p?.category) cartCatIds.push(p.category.id)
      }
      return mockRecommend(null, cartCatIds, limit)
    }

    try {
      const raw = await apiFetch<RawEnvelope<RecResponse>>(`${apiBase}/api/storefront/v1/recommendations/cross-sell`, {
        method: 'POST',
        body: { lines, limit },
        timeoutMs: 5000,
        retries: 0,
        requestId: event.context.requestId as string | undefined,
      })
      if (raw && typeof raw === 'object' && 'code' in raw && raw.code === 0 && raw.data) return raw.data
    } catch {
      /* 网络失败 → 空返回 */
    }
    return { items: [], strategy: 'none' } as RecResponse
  }

  setResponseStatus(event, 404)
  return { code: 'NOT_FOUND', message: 'recommendation endpoint not found' }
})
