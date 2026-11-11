import request from '@/utils/request'

export type ArticleStatus = 'draft' | 'published'

export interface ArticleItem {
  id: number
  title: string
  slug: string
  status: ArticleStatus
  publishedAt: string | null
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface ArticleDetail extends ArticleItem {
  summary: string | null
  content: string
  coverImage: string | null
  authorName: string | null
  tags: string[] | null
}

export interface ArticleListResult {
  rows: ArticleItem[]
  total: number
  page: number
  pageSize: number
}

export interface ArticlePayload {
  title: string
  slug: string
  content: string
  summary?: string | null
  coverImage?: string | null
  authorName?: string | null
  tags?: string[] | null
  sortOrder?: number
  status?: ArticleStatus
}

export type ArticleUpdatePayload = Omit<Partial<ArticlePayload>, 'status'>

export const shopArticleApi = {
  list(params: { siteId?: number; status?: ArticleStatus | ''; page?: number; pageSize?: number } = {}) {
    return request.get<ArticleListResult>('/shop/articles', { params })
  },
  detail(id: number) {
    return request.get<ArticleDetail>(`/shop/articles/${id}`)
  },
  create(payload: ArticlePayload) {
    return request.post<{ id: number; slug: string }>('/shop/articles', payload)
  },
  update(id: number, payload: ArticleUpdatePayload) {
    return request.put<{ id: number; slug: string }>(`/shop/articles/${id}`, payload)
  },
  publish(id: number) {
    return request.post<{ id: number; slug: string }>(`/shop/articles/${id}/publish`)
  },
  unpublish(id: number) {
    return request.post<{ id: number; slug: string }>(`/shop/articles/${id}/unpublish`)
  },
}
