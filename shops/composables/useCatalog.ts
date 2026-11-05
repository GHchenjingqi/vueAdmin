import type { CatalogCategory, CatalogProduct, CatalogVariant, ProductListResult } from '@shared/types/api'

/**
 * Catalog 组合式（P2-T01）：useCatalog()。
 * 数据源：/api/catalog/*（BFF 直连现有后台 storefront 目录接口；后端冻结期不可用时由 BFF 返回 503）。
 */
export function useCatalog() {
  const categories = ref<CatalogCategory[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function loadCategories(): Promise<CatalogCategory[]> {
    loading.value = true
    error.value = null
    try {
      const res = await $fetch<{ categories: CatalogCategory[] }>('/api/catalog/categories')
      categories.value = res.categories
    } catch {
      categories.value = []
      error.value = 'catalog unavailable'
    } finally {
      loading.value = false
    }
    return categories.value
  }

  async function listProducts(params: { category?: string; sort?: string; page?: number; pageSize?: number; attr?: Record<string, string> } = {}): Promise<ProductListResult> {
    const qs = new URLSearchParams()
    if (params.category) qs.set('category', params.category)
    if (params.sort) qs.set('sort', params.sort)
    qs.set('page', String(params.page ?? 1))
    qs.set('pageSize', String(params.pageSize ?? 24))
    for (const [k, v] of Object.entries(params.attr ?? {})) qs.set(`attr.${k}`, v)
    return await $fetch<ProductListResult>(`/api/catalog/products?${qs}`)
  }

  async function getProduct(slug: string): Promise<CatalogProduct | null> {
    try {
      return await $fetch<CatalogProduct>(`/api/catalog/products/${slug}`, { redirect: 'manual' })
    } catch (err: unknown) {
      // P2-T12：BFF 301（slug 规范化）→ 手动跟随，页面层再发 301 到 canonical
      const status = (err as { status?: number; statusCode?: number }).status ?? (err as { statusCode?: number }).statusCode
      const location = (err as { data?: { location?: string } }).data?.location
      if ((status === 301 || status === 302) && location) {
        try {
          return await $fetch<CatalogProduct>(location, { redirect: 'manual' })
        } catch {
          return null
        }
      }
      return null
    }
  }

  function variantOf(product: CatalogProduct, spec: Record<string, string>): CatalogVariant | undefined {
    return product.variants.find((variant) => Object.entries(spec).every(([key, val]) => variant.spec[key] === val))
  }

  return { categories, loading, error, loadCategories, listProducts, getProduct, variantOf }
}
