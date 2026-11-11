import type { CatalogProduct } from '@shared/types/api'
import { getToken, getStoredCustomer } from '@shared/customer/auth'

/**
 * 收藏夹组合式 useWishlist()。
 *
 * 双模式：
 * - 游客：收藏 id 存 localStorage（sb_wishlist_guest），无后端调用
 * - 登录：走 /api/wishlist/*（顾客 JWT，BFF 直通透传 authorization），登录后合并游客 id 到云端
 *
 * 列表渲染复用 catalog ids 批量取（ProductCard 单位=SPU）。
 */

const GUEST_KEY = 'sb_wishlist_guest'
const NOTIFY_KEY = 'sb_wishlist_notify' // 游客降价提醒开关（productId → bool）

export interface WishlistItemView {
  product: CatalogProduct
  notifyOnSale: boolean
}

function readGuestIds(): number[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(GUEST_KEY)
    const arr = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(arr) ? arr.filter((n): n is number => typeof n === 'number' && Number.isInteger(n) && n > 0) : []
  } catch {
    return []
  }
}

function writeGuestIds(ids: number[]): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(GUEST_KEY, JSON.stringify([...new Set(ids)]))
}

function readGuestNotify(): Record<string, boolean> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem(NOTIFY_KEY)
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {}
  } catch {
    return {}
  }
}

function writeGuestNotify(map: Record<string, boolean>): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(NOTIFY_KEY, JSON.stringify(map))
}

/** 带顾客 JWT 的 fetch（登录态）；游客调用会 401，由调用方 catch 隔离 */
async function api<T>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = getToken()
  const res = await fetch(path, {
    method: opts.method || 'GET',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  })
  const body = (await res.json()) as { code: number; data: T; message?: string }
  if (!res.ok || body.code !== 0) throw new Error(body.message || 'request failed')
  return body.data
}

export function useWishlist() {
  // 全局共享：详情页心形、收藏页、导航角标同步
  const ids = useState<number[]>('wishlist-ids', () => [])
  const loading = useState<boolean>('wishlist-loading', () => false)

  const isLoggedIn = () => !!getToken() && !!getStoredCustomer()

  /** 初始化：游客读本地；登录读云端并合并游客 id */
  async function load(): Promise<void> {
    loading.value = true
    try {
      if (isLoggedIn()) {
        const cloud = await api<{ productIds: number[] }>('/api/wishlist/ids').catch(() => ({ productIds: [] as number[] }))
        const guest = readGuestIds()
        const merged = [...new Set([...(cloud.productIds ?? []), ...guest])]
        // 游客 id 迁移到云端（幂等），成功后清本地
        for (const pid of guest) {
          await api('/api/wishlist', { method: 'POST', body: { productId: pid } }).catch(() => undefined)
        }
        if (guest.length) writeGuestIds([])
        ids.value = merged
      } else {
        ids.value = readGuestIds()
      }
    } finally {
      loading.value = false
    }
  }

  function isWishlisted(productId: number): boolean {
    return ids.value.includes(productId)
  }

  /** 收藏（幂等）。游客写本地，登录调云端 */
  async function add(productId: number, notifyOnSale = true): Promise<void> {
    if (isLoggedIn()) {
      await api('/api/wishlist', { method: 'POST', body: { productId, notifyOnSale } })
    } else {
      const cur = readGuestIds()
      if (!cur.includes(productId)) writeGuestIds([...cur, productId])
      const n = readGuestNotify()
      n[String(productId)] = notifyOnSale
      writeGuestNotify(n)
    }
    if (!ids.value.includes(productId)) ids.value = [...ids.value, productId]
  }

  /** 取消收藏 */
  async function remove(productId: number): Promise<void> {
    if (isLoggedIn()) {
      await api(`/api/wishlist/${productId}`, { method: 'DELETE' })
    } else {
      writeGuestIds(readGuestIds().filter((id) => id !== productId))
    }
    ids.value = ids.value.filter((id) => id !== productId)
  }

  /** 清空收藏 */
  async function clear(): Promise<void> {
    if (isLoggedIn()) {
      await api('/api/wishlist', { method: 'DELETE' })
    } else {
      writeGuestIds([])
    }
    ids.value = []
  }

  /** 开关降价提醒 */
  async function setNotifyOnSale(productId: number, notifyOnSale: boolean): Promise<void> {
    if (isLoggedIn()) {
      await api(`/api/wishlist/${productId}/notify`, { method: 'PATCH', body: { notifyOnSale } })
    } else {
      const n = readGuestNotify()
      n[String(productId)] = notifyOnSale
      writeGuestNotify(n)
    }
  }

  /**
   * 取收藏详情（复用 catalog ids 批量取，ProductCard 单位=SPU）。
   * 游客降价提醒开关从本地读；登录态列表接口返回 notifyOnSale（此处简化：默认 true，列表页可覆盖）。
   */
  async function listDetail(productIds: number[], fetcher: (ids: number[]) => Promise<CatalogProduct[]>): Promise<WishlistItemView[]> {
    if (!productIds.length) return []
    const products = await fetcher(productIds)
    const notify = readGuestNotify()
    return products.map((p) => ({ product: p, notifyOnSale: isLoggedIn() ? true : notify[String(p.id)] !== false }))
  }

  return { ids, loading, load, isWishlisted, add, remove, clear, setNotifyOnSale, listDetail, isLoggedIn }
}
