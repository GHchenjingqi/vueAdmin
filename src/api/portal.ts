/**
 * 提示词平台前台 API
 *
 * 与后台管理共用同一份数据：公开接口只读已发布内容，
 * 用户投稿进入后台「投稿审核」流程。
 */
import request from '@/utils/request'
import type { PaginatedData, ListQueryParams } from '@/types/response'
import type { PromptCategory, PromptImageGroupInput, PromptItem, PromptPlatform, PromptStatus, PromptStepInput, PromptType } from './prompt'

export interface PortalCategory extends PromptCategory {
  promptCount: number
}

export interface PortalPrompt extends PromptItem {
  authorName?: string
  favoriteCount?: number
  isFavorited?: boolean
}

export interface PortalListQuery extends ListQueryParams {
  categoryId?: number | string
  sort?: 'latest' | 'popular'
}

export interface PortalMineQuery extends ListQueryParams {
  status?: PromptStatus
}

export interface PortalPayload {
  title: string
  content: string
  categoryId: number
  modelName: string
  /** 内容形态：single=单条，sequence=有序步骤套组 */
  type?: PromptType
  /** 角色锚定提示词，仅套组使用 */
  characterAnchor?: string | null
  /** 套组步骤，仅套组使用 */
  steps?: PromptStepInput[]
  /** true=提交审核，false=存草稿 */
  submit?: boolean
  /** 按平台分组的效果图；每组最多 20 张 */
  platformGroups?: PromptImageGroupInput[]
}

export interface PortalRegisterParams {
  username: string
  password: string
  nickname?: string
  email?: string
}

export interface PortalUploadResult {
  id: string
  url: string
  name: string
  size: number
  mimetype: string
}

export const portalApi = {
  /** 上传投稿效果图：提示词模块专用通道，不经过通用上传的配额守卫 */
  uploadImage(file: File) {
    const formData = new FormData()
    formData.append('file', file)
    return request.post<PortalUploadResult>('/portal/upload-image', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },

  /** ==================== 公开浏览 ==================== */
  getCategories() {
    return request.get<PortalCategory[]>('/portal/categories')
  },

  getPlatforms() {
    return request.get<PromptPlatform[]>('/portal/platforms')
  },

  getPrompts(params: PortalListQuery) {
    return request.get<PaginatedData<PortalPrompt>>('/portal/prompts', { params })
  },

  getPrompt(id: number | string) {
    return request.get<PortalPrompt>(`/portal/prompts/${id}`)
  },

  getRelated(id: number | string) {
    return request.get<PortalPrompt[]>(`/portal/prompts/${id}/related`)
  },

  /** ==================== 注册 ==================== */
  register(data: PortalRegisterParams) {
    return request.post<{ id: number; username: string; nickname: string }>('/portal/auth/register', data)
  },

  /** ==================== 我的投稿 ==================== */
  getMine(params: PortalMineQuery) {
    return request.get<PaginatedData<PromptItem>>('/portal/mine', { params })
  },

  getMinePrompt(id: number | string) {
    return request.get<PromptItem>(`/portal/mine/${id}`)
  },

  createMine(data: PortalPayload) {
    return request.post<PromptItem>('/portal/mine', data)
  },

  updateMine(id: number | string, data: PortalPayload) {
    return request.put<PromptItem>(`/portal/mine/${id}`, data)
  },

  submitMine(id: number | string) {
    return request.post<PromptItem>(`/portal/mine/${id}/submit`, {})
  },

  deleteMine(id: number | string) {
    return request.delete<null>(`/portal/mine/${id}`)
  },

  /** ==================== 收藏 ==================== */
  getFavorites(params: ListQueryParams) {
    return request.get<PaginatedData<PortalPrompt>>('/portal/favorites', { params })
  },

  addFavorite(promptId: number | string) {
    return request.post<{ favorited: boolean }>(`/portal/favorites/${promptId}`, {})
  },

  removeFavorite(promptId: number | string) {
    return request.delete<{ favorited: boolean }>(`/portal/favorites/${promptId}`)
  },
}
