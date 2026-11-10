export interface CmsArticleSummary {
  id: number
  title: string
  slug: string
  summary: string | null
  coverImage: string | null
  authorName: string | null
  tags: string[] | null
  publishedAt: string | null
}

export interface CmsArticleDetail extends CmsArticleSummary {
  content: string | null
  updatedAt: string | null
  structuredData: Record<string, unknown> | null
}

export interface CmsArticleListResult {
  items: CmsArticleSummary[]
  total: number
  page: number
  pageSize: number
}

/**
 * 博客 CMS 组合式（P5-T06）：/api/cms/articles（BFF 直通真实后台 /storefront/v1/cms/articles；
 * 网络级失败或 mock 模式下由 BFF 返回 mock 列表）。公开接口仅 published。
 */
export function useCms() {
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function listArticles(params: { page?: number; pageSize?: number; tag?: string; keyword?: string } = {}): Promise<CmsArticleListResult> {
    loading.value = true
    error.value = null
    const qs = new URLSearchParams()
    qs.set('page', String(params.page ?? 1))
    qs.set('pageSize', String(params.pageSize ?? 10))
    if (params.tag) qs.set('tag', params.tag)
    if (params.keyword) qs.set('keyword', params.keyword)
    try {
      return await $fetch<CmsArticleListResult>(`/api/cms/articles?${qs}`)
    } catch (err: unknown) {
      error.value = (err as { data?: { message?: string } }).data?.message ?? 'cms unavailable'
      return { items: [], total: 0, page: params.page ?? 1, pageSize: params.pageSize ?? 10 }
    } finally {
      loading.value = false
    }
  }

  async function getArticle(slug: string): Promise<CmsArticleDetail | null> {
    loading.value = true
    error.value = null
    try {
      return await $fetch<CmsArticleDetail>(`/api/cms/articles/${encodeURIComponent(slug)}`)
    } catch (err: unknown) {
      const status = (err as { status?: number; statusCode?: number }).status ?? (err as { statusCode?: number }).statusCode
      if (status === 404) {
        error.value = null
        return null
      }
      error.value = (err as { data?: { message?: string } }).data?.message ?? 'cms unavailable'
      return null
    } finally {
      loading.value = false
    }
  }

  return { loading, error, listArticles, getArticle, listBanners }
}

export interface CmsBanner {
  id: number
  position: 'hero' | 'secondary'
  title: string
  subtitle: string | null
  linkUrl: string | null
  buttonLabel: string | null
  image: string
  sortOrder: number
}

/** 首页 Banner 列表（营销首屏）：/api/cms/banners（BFF → 真实后台；空数组 = 无 banner，回退静态 hero） */
export async function listBanners(position?: 'hero' | 'secondary'): Promise<CmsBanner[]> {
  const qs = new URLSearchParams()
  if (position) qs.set('position', position)
  try {
    const res = await $fetch<CmsBanner[]>(`/api/cms/banners${qs.size ? `?${qs}` : ''}`)
    return Array.isArray(res) ? res : []
  } catch {
    return []
  }
}
