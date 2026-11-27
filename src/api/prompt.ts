/**
 * 提示词平台后台 API
 */
import request from '@/utils/request'
import type { PaginatedData, ListQueryParams } from '@/types/response'

export type PromptStatus = 'draft' | 'pending' | 'published' | 'rejected' | 'offline'
export type PromptType = 'single' | 'sequence' | 'character-pose' | 'collection' | 'character'
/** 数据范围：pose=姿势库，collection=提示词专题，character=角色库；缺省为普通提示词 */
export type PromptScope = 'pose' | 'collection' | 'character'

/** 角色 + 姿势组合：一个角色图，多个姿势，每个姿势需对应生成图 */
export interface PromptPoseInput {
  key?: string
  poseImage: PromptImageItem | null
  platformGroups: PromptImageGroupInput[]
}

export interface PromptCharacterPoseInput {
  characterImage: PromptImageItem | null
  poses: PromptPoseInput[]
}

export interface PromptPose extends PromptPoseInput {
  key: string
  poseImage: PromptImageItem
  platformGroups: PromptImageGroup[]
}

export interface PromptCharacterPose {
  characterImage: PromptImageItem | null
  poses: PromptPose[]
}

/** 角色库资产：五组图片（角色三视图 / 服装三视图 / 发型特写 / 道具图 / 面部表情） */
export interface PromptCharacterLibrary {
  turnarounds: PromptLibraryImage[]
  costumes: PromptLibraryImage[]
  hairstyles: PromptLibraryImage[]
  props: PromptLibraryImage[]
  expressions: PromptLibraryImage[]
}

export interface PromptLibraryImage {
  url: string
  filePath?: string | null
  sort?: number
}

export type PromptCharacterLibraryInput = {
  [K in keyof PromptCharacterLibrary]: Array<{ url: string; filePath?: string | null }>
}

/** 专题关联的提示词摘要（含封面，用于合集展示与选择器回显） */
export interface PromptRelatedBrief {
  id: number
  title: string
  coverImage: string
  modelName: string
  categoryName: string
  type: PromptType
}

export interface PromptCategory {
  id: number
  name: string
  description: string | null
  sort: number
  status: number
  /** 父分类 ID；null/缺省为一级分类，最多两级 */
  parentId?: number | null
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

/** 套组中的一步 */
export interface PromptStepInput {
  id?: number
  stepOrder?: number
  name: string
  actionPrompt: string
  camera?: string | null
  seconds?: number | null
  transition?: string | null
  platformGroups: PromptImageGroupInput[]
}

export interface PromptStep extends PromptStepInput {
  id: number
  stepOrder: number
  platformGroups: PromptImageGroup[]
  coverImage: string
}

/** 关联链中的一个节点，按根 → 当前顺序排列 */
export interface PromptChainNode {
  id: number
  title: string
  content: string
}

export interface PromptChild {
  id: number
  title: string
  status: PromptStatus
  coverImage: string
}

export interface PromptItem {
  id: number
  title: string
  content: string
  categoryId: number
  categoryIds?: number[]
  categoryName?: string
  categoryNames?: string[]
  /** 派生自的提示词 ID；顶层为 null */
  parentId?: number | null
  parentTitle?: string | null
  /** 祖先层级数，顶层为 0 */
  depth?: number
  /** 根 → 当前的正文链，详情页用于展示完整上下文 */
  chain?: PromptChainNode[]
  /** 直接追问衍生的提示词摘要 */
  children?: PromptChild[]
  modelName: string
  type?: PromptType
  characterAnchor?: string | null
  steps?: PromptStep[]
  characterPose?: PromptCharacterPose | null
  characterLibrary?: PromptCharacterLibrary | null
  /** 专题：关联的提示词 ID 与摘要 */
  relatedIds?: number[]
  relatedPrompts?: PromptRelatedBrief[]
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

export interface IntegrationKeyInfo {
  id: number
  name: string
  key: string
  prefix: string
  status: number
  createdAt: string
  lastUsedAt: string | null
}

export interface PromptListQuery extends ListQueryParams {
  categoryId?: number | string
  status?: string
  source?: string
  /** pose/collection/character=只读对应板块数据；默认排除全部特殊板块 */
  scope?: PromptScope
}

export interface PromptPayload {
  title: string
  content: string
  categoryId: number
  categoryIds?: number[]
  parentId?: number | null
  modelName: string
  type?: PromptType
  characterAnchor?: string | null
  steps?: PromptStepInput[]
  characterPose?: PromptCharacterPoseInput
  characterLibrary?: PromptCharacterLibraryInput
  /** 专题：关联的提示词 ID 集合 */
  relatedIds?: number[]
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

  getCategoryOptions(params: { scope?: PromptScope } = {}) {
    return request.get<PromptCategory[]>('/prompt/categories/options', { params })
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
  /** 库里已有的模型名（去重），后台表单可下拉选择或手动录入新值 */
  getModelOptions() {
    return request.get<string[]>('/prompt/prompts/model-options')
  },

  /** 关联原提示词：搜索可关联的已发布提示词 */
  getParentOptions(params: { keyword?: string; excludeId?: number; scope?: PromptScope } = {}) {
    return request.get<Array<{ id: number; title: string }>>('/prompt/prompts/parent-options', { params })
  },

  /** 专题关联提示词选择器：搜索已发布提示词（含封面摘要） */
  getRelatedOptions(params: { keyword?: string; excludeId?: number } = {}) {
    return request.get<PromptRelatedBrief[]>('/prompt/prompts/related-options', { params })
  },

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

  batchDeletePrompts(ids: number[]) {
    return request.post<{ deleted: number }>('/prompt/prompts/batch-delete', { ids })
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

  /** ==================== AI 推送密钥 ==================== */
  getIntegrationKey() {
    return request.get<IntegrationKeyInfo>('/prompt/integrations/key')
  },

  rotateIntegrationKey() {
    return request.post<IntegrationKeyInfo>('/prompt/integrations/key/rotate', {})
  },

  setIntegrationKeyStatus(status: 0 | 1) {
    return request.put<IntegrationKeyInfo>('/prompt/integrations/key/status', { status })
  },

  /** ==================== 统计 ==================== */
  getStats(params: { scope?: PromptScope } = {}) {
    return request.get<PromptStats>('/prompt/stats', { params })
  },
}
