/**
 * 提示词平台前台 API
 *
 * 与后台管理共用同一份数据：公开接口只读已发布内容，
 * 用户投稿进入后台「投稿审核」流程。
 */
import request from '@/utils/request'
import type { PaginatedData, ListQueryParams } from '@/types/response'
import type {
  PromptCategory,
  PromptCharacterLibraryInput,
  PromptCharacterPoseInput,
  PromptImageGroupInput,
  PromptItem,
  PromptPlatform,
  PromptRelatedBrief,
  PromptScope,
  PromptStatus,
  PromptStepInput,
  PromptType,
} from './prompt'

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
  /** pose/collection/character=只读对应板块数据；默认排除全部特殊板块 */
  scope?: PromptScope
}

export interface PortalMineQuery extends ListQueryParams {
  status?: PromptStatus
}

export interface PortalParentOption {
  id: number
  title: string
}

export interface PortalPayload {
  title: string
  content: string
  /** 负面（反向/约束）提示词 */
  negativePrompt?: string | null
  categoryId: number
  modelName: string
  /** 关联的原提示词 ID；派生提示词只填写本次追问正文 */
  parentId?: number | null
  /** 内容形态：single=单条，sequence=有序步骤套组，character-pose=角色姿势，collection=提示词专题，character=角色库 */
  type?: PromptType
  /** 角色锚定提示词，仅套组使用 */
  characterAnchor?: string | null
  /** 套组步骤，仅套组使用 */
  steps?: PromptStepInput[]
  /** true=提交审核，false=存草稿 */
  submit?: boolean
  /** 按平台分组的效果图；每组最多 20 张 */
  platformGroups?: PromptImageGroupInput[]
  /** 角色 + 姿势组合，仅 type=character-pose 使用 */
  characterPose?: PromptCharacterPoseInput
  /** 角色库资产分组，仅 type=character 使用 */
  characterLibrary?: PromptCharacterLibraryInput
  /** 专题关联提示词 ID 集合，仅 type=collection 使用 */
  relatedIds?: number[]
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
  getCategories(params: { scope?: PromptScope } = {}) {
    return request.get<PortalCategory[]>('/portal/categories', { params })
  },

  getPlatforms() {
    return request.get<PromptPlatform[]>('/portal/platforms')
  },

  /** 投稿表单用：库里已有的模型名，可下拉选择或手动录入新值 */
  getModelOptions() {
    return request.get<string[]>('/portal/model-options')
  },

  /** 投稿表单用：可关联的已发布提示词（远程搜索），编辑时排除自身防环 */
  getParentOptions(params: { keyword?: string; excludeId?: number | string } = {}) {
    return request.get<PortalParentOption[]>('/portal/parent-options', { params })
  },

  /** 专题发布用：可关联提示词选择器（含封面摘要） */
  getRelatedOptions(params: { keyword?: string; excludeId?: number | string } = {}) {
    return request.get<PromptRelatedBrief[]>('/portal/related-options', { params })
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
