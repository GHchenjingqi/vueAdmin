import { apiFetch } from '@shared/api/client'
import { MOCK_CATEGORIES, MOCK_PRODUCTS } from '@shared/mock/fixtures'
import type { CatalogCategory, CatalogProduct, CatalogVariant, ProductListResult } from '@shared/types/api'

/**
 * BFF catalog proxy（P2-T01）：现有后台（vue-admin server/）只读 storefront 目录接口。
 * - 真实后台优先：解包 {code:0,data} 信封并适配 C 端契约（金额 DECIMAL 元 → 整数分，C2）；
 * - 后台不可达 / 无数据 → 回退 mock fixtures（前端独立开发与演示数据源）；
 * - 不改后台代码、不改后台接口；超时 6s、不重试（目录读容忍降级）。
 * - dev 自签名证书：仅当显式设置 NUXT_API_INSECURE_TLS=1 时禁用 TLS 校验（本地联调开关）；生产不设置，校验保持开启。
 */
if (process.env.NUXT_API_INSECURE_TLS === '1') process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

interface RawEnvelope<T> {
  code: number
  data: T
}

interface RawCategory {
  id: number
  parentId: number
  name: string
  level: number
  sort: number
  children?: RawCategory[]
}

interface RawListItem {
  id: number
  slug: string
  title: string
  cover: string | null
  images: string[] | null
  categoryId: number
  price: { currency: string; min: number; max: number } | null
  inStock: boolean
}

interface RawDetail {
  id: number
  slug: string
  title: string
  description: string
  cover: string | null
  images: string[] | null
  category: { id: number; name: string } | null
  currency: string
  price: { min: number; max: number } | null
  variants: { id: number; code: string; spec: Record<string, string> | null; price: number | null; inStock: boolean }[] | null
}

const toCents = (v: number): number => Math.round(v * 100)

function adaptCategories(raw: RawCategory[]): CatalogCategory[] {
  const map = (rows: RawCategory[]): CatalogCategory[] =>
    rows.map((r) => ({ id: r.id, slug: `c-${r.id}`, name: r.name, level: r.level, kind: 'other', children: map(r.children ?? []) }))
  return map(raw)
}

function adaptList(raw: { list: RawListItem[]; total: number; page: number; pageSize: number }): ProductListResult {
  const list: CatalogProduct[] = (raw.list ?? []).map((p) => ({
    id: p.id,
    slug: p.slug,
    title: p.title,
    description: '',
    cover: p.cover,
    images: p.images ?? [],
    category: p.categoryId ? { id: p.categoryId, name: '', slug: `c-${p.categoryId}` } : null,
    price: p.price ? { amount: toCents(p.price.min), currency: p.price.currency } : null,
    inStock: !!p.inStock,
    variants: [],
  }))
  return { list, total: raw.total ?? list.length, page: raw.page ?? 1, pageSize: raw.pageSize ?? 24 }
}

function adaptDetail(raw: RawDetail): CatalogProduct {
  const variants: CatalogVariant[] = (raw.variants ?? []).map((v) => ({
    id: v.id,
    code: v.code,
    spec: v.spec ?? {},
    price: v.price != null ? { amount: toCents(v.price), currency: raw.currency } : null,
    inStock: !!v.inStock,
  }))
  return {
    id: raw.id,
    slug: raw.slug,
    title: raw.title,
    description: raw.description ?? '',
    cover: raw.cover,
    images: raw.images ?? [],
    category: raw.category ? { id: raw.category.id, name: raw.category.name, slug: `c-${raw.category.id}` } : null,
    price: raw.price ? { amount: toCents(raw.price.min), currency: raw.currency } : null,
    inStock: variants.some((v) => v.inStock),
    variants,
  }
}

/** mock 回退：与真实接口同一契约 */
function mockCatalog(path: string, query: Record<string, unknown>): unknown {
  if (path === 'categories') {
    const kw = String(query.lang ?? '')
    void kw
    return { categories: MOCK_CATEGORIES }
  }
  if (path === 'products') {
    let list = MOCK_PRODUCTS
    const cat = String(query.category ?? '')
    if (cat) list = list.filter((p) => p.category?.slug === cat)
    const kw = String(query.keyword ?? '').toLowerCase()
    if (kw) list = list.filter((p) => p.title.toLowerCase().includes(kw))
    return { list, total: list.length, page: Number(query.page ?? 1) || 1, pageSize: Number(query.pageSize ?? 24) || 24 }
  }
  if (path.startsWith('products/')) {
    const slug = path.slice('products/'.length)
    return MOCK_PRODUCTS.find((p) => p.slug === slug) ?? null
  }
  return null
}

export default defineEventHandler(async (event) => {
  const url = getRequestURL(event)
  const path = url.pathname.replace(/^\/api\/catalog\//, '')
  const query = getQuery(event)
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === '') continue
    if (k === 'category') continue // slug 由下方映射或回退处理
    qs.set(k, String(v))
  }
  const catMatch = /^c-(\d+)$/.exec(String(query.category ?? ''))
  if (catMatch) qs.set('categoryId', catMatch[1])

  setResponseHeaders(event, { 'cache-control': 'public, max-age=30, stale-while-revalidate=30' })
  const apiBase = useRuntimeConfig().apiBase as string

  try {
    const raw = await apiFetch<RawEnvelope<unknown>>(`${apiBase}/api/storefront/v1/${path}?${qs}`, { timeoutMs: 6000, retries: 0, requestId: event.context.requestId as string | undefined })
    if (raw && typeof raw === 'object' && 'code' in raw && (raw as RawEnvelope<unknown>).code === 0) {
      const data = (raw as RawEnvelope<unknown>).data
      if (path === 'categories' && Array.isArray(data) && data.length > 0) {
        return { categories: adaptCategories(data as RawCategory[]) }
      }
      if (path === 'products' && data && typeof data === 'object' && 'list' in (data as Record<string, unknown>)) {
        const list = adaptList(data as { list: RawListItem[]; total: number; page: number; pageSize: number })
        if (list.total > 0) return list
      }
      if (path.startsWith('products/') && data && typeof data === 'object' && 'id' in (data as Record<string, unknown>)) {
        return adaptDetail(data as RawDetail)
      }
    }
  } catch (err) {
    const status = (err as { status?: number }).status

    // P2-T12：slug 404 且带数字前缀 → 用纯 id 重试（后台接受纯 id），命中则返回 canonical slug 供页面 301
    if (status === 404 && path.startsWith('products/')) {
      const idGuess = /^products\/(\d+)/.exec(path)
      if (idGuess) {
        try {
          const retry = await apiFetch<RawEnvelope<unknown>>(`${apiBase}/api/storefront/v1/products/${idGuess[1]}?${qs}`, { timeoutMs: 6000, retries: 0, requestId: event.context.requestId as string | undefined })
          if (retry && typeof retry === 'object' && 'code' in retry && (retry as RawEnvelope<unknown>).code === 0) {
            const data2 = (retry as RawEnvelope<unknown>).data
            if (data2 && typeof data2 === 'object' && 'id' in (data2 as Record<string, unknown>)) {
              return adaptDetail(data2 as RawDetail)
            }
          }
        } catch {
          /* 重试仍失败 → 走下方透传/回退 */
        }
      }
    }

    // 真实 404/410 属业务语义，透传（下架商品 404；永久删除 410 由后台重定向表承接）
    if (status === 404 || status === 410) {
      setResponseStatus(event, status)
      return { code: status === 410 ? 'PRODUCT_GONE' : 'PRODUCT_NOT_FOUND', message: 'product not available' }
    }
    // 网络级失败 → mock 回退（前端独立开发模式）
  }

  const mock = mockCatalog(path, query)
  if (mock === null) {
    setResponseStatus(event, 404)
    return { code: 'PRODUCT_NOT_FOUND', message: 'product not found' }
  }
  return mock
})
