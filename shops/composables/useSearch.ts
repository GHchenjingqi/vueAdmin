import type { CatalogProduct } from '@shared/types/api'
import { trackEvent } from '@shared/analytics/events'

/**
 * 搜索增强（P6）：关键词搜索（复用 catalog keyword）+ 纠错建议 + 热搜词 + 无结果兜底 + search 埋点。
 * - 建议走 /api/search/suggest，热搜 /api/search/hot-keywords，兜底 /api/search/fallback（均 BFF 直通，游客可用）。
 * - search 埋点：用户提交搜索词时触发，params.search_term（GA4 search 事件），后端落库用于热搜聚合。
 */

export interface SearchSuggestResult {
  query: string
  suggestions: string[]
}

export interface SearchHotResult {
  keywords: { term: string; count: number }[]
  days: number
}

export interface SearchFallbackResult {
  items: CatalogProduct[]
  strategy: 'category' | 'hot' | 'none'
}

export interface SearchListResult {
  list: CatalogProduct[]
  total: number
  page: number
  pageSize: number
}

/** GET /api/search/suggest（纠错建议） */
export async function fetchSearchSuggest(q: string, limit = 5): Promise<SearchSuggestResult> {
  try {
    const qs = new URLSearchParams({ q: String(q ?? '').trim(), limit: String(limit) })
    const data = await $fetch<SearchSuggestResult>(`/api/search/suggest?${qs}`)
    return data
  } catch {
    return { query: String(q ?? ''), suggestions: [] }
  }
}

/** GET /api/search/hot-keywords（热搜词） */
export async function fetchHotKeywords(days = 7, limit = 10): Promise<SearchHotResult> {
  try {
    const qs = new URLSearchParams({ days: String(days), limit: String(limit) })
    const data = await $fetch<SearchHotResult>(`/api/search/hot-keywords?${qs}`)
    return data
  } catch {
    return { keywords: [], days }
  }
}

/** GET /api/search/fallback（无结果兜底商品） */
export async function fetchSearchFallback(q: string, limit = 8): Promise<SearchFallbackResult> {
  try {
    const qs = new URLSearchParams({ q: String(q ?? '').trim(), limit: String(limit) })
    const data = await $fetch<SearchFallbackResult>(`/api/search/fallback?${qs}`)
    return data
  } catch {
    return { items: [], strategy: 'none' }
  }
}

/** GA4 search 事件埋点（search_term） */
export function trackSearch(searchTerm: string): void {
  const term = String(searchTerm ?? '').trim()
  if (!term) return
  trackEvent('search', { search_term: term })
}
