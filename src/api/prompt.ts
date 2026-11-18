/**
 * 提示词平台后台 API
 */
import request from '@/utils/request'
import type { PaginatedData, ListQueryParams } from '@/types/response'

export type PromptStatus = 'draft' | 'pending' | 'published' | 'rejected' | 'offline'

export interface PromptCategory {
  id: number
  name: string
  description: string | null
  sort: number
  status: number
  promptCount?: number
  createdAt?: string
  updatedAt?: string
}

export interface PromptPlatform {
  id: number
  name: string
  sort: number
  status: number
  builtin?: number
  promptCount?: number
  imageCount?: number
  createdAt?: string
  updatedAt?: string
}

export interface PromptImageItem {
  id?: number
  platformId?: number
  url: string
  filePath?: string | null
  sort?: number
  /** 表单用 boolean，接口返回 1/0 */
  isCover?: boolean | number
}

export interface PromptImageGroupInput {
  platformId: number
  images: PromptImageItem[]
}

export interface PromptImageGroup {
  platformId: number
  platformName: string
  images: PromptImageItem[]
  coverImage: string
}

export interface PromptItem {
  id: number
  title: string
  content: string
  categoryId: number
  categoryName?: string
  modelName: string
  status: PromptStatus
  source: 'admin' | 'user'
  authorId: number
  rejectReason?: string | null
  viewCount?: number
  images?: PromptImageItem[]
  platformGroups?: PromptImageGroup[]
  coverImage?: string
  createdAt?: string
}

export interface PromptStats {
  total: number
  published: number
  pending: number
  offline: number
  categories: number
  favorites: number
}

export interface PromptListQuery extends ListQueryParams {
  categoryId?: number | string
  status?: string
  source?: string
}

export interface PromptPayload {
  title: string
  content: string
  categoryId: number
  modelName: string
  action?: 'publish' | 'draft'
  images?: PromptImageItem[]
  platformGroups?: PromptImageGroupInput[]
}

export interface PromptUploadResult {
  id: string
  url: string
  name: string
  size: number
  mimetype: string
}

export const promptApi = {
  /** 上传效果图：提示词模块专用通道，不经过通用上传的配额守卫 */
  uploadImage(file: File) {
    const formData = new FormData()
    formData.append('file', file)
    return request.post<PromptUploadResult>('/prompt/upload-image', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },

  /** ==================== 分类 ==================== */
  getCategories(params: ListQueryParams) {
    return request.get<PaginatedData<PromptCategory>>('/prompt/categories', { params })
  },

  getCategoryOptions() {
    return request.get<PromptCategory[]>('/prompt/categories/options')
  },

  createCategory(data: Partial<PromptCategory>) {
    return request.post<PromptCategory>('/prompt/categories', data)
  },

  updateCategory(id: number, data: Partial<PromptCategory>) {
    return request.put<PromptCategory>(`/prompt/categories/${id}`, data)
  },

  deleteCategory(id: number) {
    return request.delete<null>(`/prompt/categories/${id}`)
  },

  /** ==================== 平台字典 ==================== */
  getPlatforms(params: ListQueryParams) {
    return request.get<PaginatedData<PromptPlatform>>('/prompt/platforms', { params })
  },

  getPlatformOptions() {
    return request.get<PromptPlatform[]>('/prompt/platforms/options')
  },

  createPlatform(data: Partial<PromptPlatform>) {
    return request.post<PromptPlatform>('/prompt/platforms', data)
  },

  updatePlatform(id: number, data: Partial<PromptPlatform>) {
    return request.put<PromptPlatform>(`/prompt/platforms/${id}`, data)
  },

  deletePlatform(id: number) {
    return request.delete<null>(`/prompt/platforms/${id}`)
  },

  /** ==================== 提示词 ==================== */
  getPrompts(params: PromptListQuery) {
    return request.get<PaginatedData<PromptItem>>('/prompt/prompts', { params })
  },

  getPrompt(id: number) {
    return request.get<PromptItem>(`/prompt/prompts/${id}`)
  },

  createPrompt(data: PromptPayload) {
    return request.post<PromptItem>('/prompt/prompts', data)
  },

  updatePrompt(id: number, data: PromptPayload) {
    return request.put<PromptItem>(`/prompt/prompts/${id}`, data)
  },

  publishPrompt(id: number) {
    return request.post<PromptItem>(`/prompt/prompts/${id}/publish`, {})
  },

  offlinePrompt(id: number) {
    return request.post<PromptItem>(`/prompt/prompts/${id}/offline`, {})
  },

  deletePrompt(id: number) {
    return request.delete<null>(`/prompt/prompts/${id}`)
  },

  /** ==================== 投稿审核 ==================== */
  getReviews(params: PromptListQuery) {
    return request.get<PaginatedData<PromptItem>>('/prompt/reviews', { params })
  },

  approveReview(id: number) {
    return request.post<PromptItem>(`/prompt/reviews/${id}/approve`, {})
  },

  rejectReview(id: number, reason: string) {
    return request.post<PromptItem>(`/prompt/reviews/${id}/reject`, { reason })
  },

  /** ==================== 统计 ==================== */
  getStats() {
    return request.get<PromptStats>('/prompt/stats')
  },
}
