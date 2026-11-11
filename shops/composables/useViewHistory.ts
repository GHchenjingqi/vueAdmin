import type { CatalogProduct } from '@shared/types/api'
import { getToken, getStoredCustomer } from '@shared/customer/auth'
import { getSessionId } from '@shared/analytics/capi'

/**
 * 浏览历史组合式 useViewHistory()。
 *
 * 数据源：复用前端 trackViewItem 埋点（落库 shop_analytics_events.view_item），
 * 查询走 /api/view-history（登录按 customerId，游客按 sessionId，BFF 直通）。
 * 零新表、零额外写入——浏览即记录。
 *
 * item_id=skuId → productId 映射在后端完成，前端直接拿 productId 列表复用 catalog ids 批量取。
 */

export interface ViewHistoryItemView {
  product: CatalogProduct
  lastViewedAt: string
}

/** 带顾客 JWT 的 fetch（游客靠 sessionId 兜底） */
async function api<T>(path: string, opts: { method?: string } = {}): Promise<T> {
  const token = getToken()
  const sessionId = getSessionId()
  const sep = path.includes('?') ? '&' : '?'
  const url = sessionId && !getToken() ? `${path}${sep}sessionId=${encodeURIComponent(sessionId)}` : path
  const res = await fetch(url, {
    method: opts.method || 'GET',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  })
  const body = (await res.json()) as { code: number; data: T; message?: string }
  if (!res.ok || body.code !== 0) throw new Error(body.message || 'request failed')
  return body.data
}

export function useViewHistory() {
  const isLoggedIn = () => !!getToken() && !!getStoredCustomer()

  /** 取最近浏览 productId 列表（去重到 SPU，倒序） */
  async function listIds(limit = 20): Promise<{ productId: number; lastViewedAt: string }[]> {
    try {
      const qs = new URLSearchParams({ limit: String(limit) })
      if (!isLoggedIn()) {
        const sid = getSessionId()
        if (!sid) return []
        qs.set('sessionId', sid)
      }
      const data = await api<{ items: { productId: number; lastViewedAt: string }[] }>(`/api/view-history?${qs}`)
      return data.items ?? []
    } catch {
      return []
    }
  }

  /** 取最近浏览详情（复用 catalog ids 批量取，ProductCard 单位=SPU） */
  async function listDetail(
    fetcher: (ids: number[]) => Promise<CatalogProduct[]>,
    limit = 20,
  ): Promise<ViewHistoryItemView[]> {
    const items = await listIds(limit)
    if (!items.length) return []
    const products = await fetcher(items.map((i) => i.productId))
    const byId = new Map(items.map((i) => [i.productId, i.lastViewedAt]))
    return products.map((p) => ({ product: p, lastViewedAt: byId.get(p.id) ?? '' }))
  }

  return { listIds, listDetail, isLoggedIn }
}
