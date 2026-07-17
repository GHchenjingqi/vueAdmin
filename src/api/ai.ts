/**
 * AI 助手 API
 */
import request from '@/utils/request'

export interface GeneratedCodeFile {
  path: string
  content: string
  language: string
  description: string
  isNew: boolean
}

export interface ChatResult {
  prompt: string
  explanation: string
  files: GeneratedCodeFile[]
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

export interface ApplyResult {
  success: boolean
  appliedFiles: string[]
  skippedFiles: string[]
  createdMenuIds: number[]
  createdPermissions: { roleId: number; menuId: number }[]
  message: string
}

export interface AIStatus {
  apiConfigured: boolean
  message: string
  knowledgeBase: {
    totalFiles: number
    categories: Record<string, number>
    lastUpdated: string
  }
}

/** AI 提供商 */
export interface AiProvider {
  id: number
  name: string
  apiBaseUrl: string
  apiKey?: string
  models: string
  defaultModel: string
  enabled: number
  sort: number
  description: string | null
  hasApiKey: boolean
  createdAt: string
  updatedAt: string
}

export const aiApi = {
  /** 获取 AI 服务状态 */
  getStatus() {
    return request.get<AIStatus>('/ai/status', { params: { _t: Date.now() } })
  },

  /** 生成代码 */
  chat(data: { message: string; providerId?: number; model?: string }) {
    return request.post<ChatResult>('/ai/chat', data, { timeout: 120000 })
  },

  /** 应用代码到项目 */
  apply(files: GeneratedCodeFile[]) {
    return request.post<ApplyResult>('/ai/apply', { files })
  },

  /** 回滚代码注入 */
  rollback(files: GeneratedCodeFile[]) {
    return request.post<ApplyResult>('/ai/apply', { files, rollback: true })
  },

  /** 重建知识库索引 */
  rebuildIndex() {
    return request.post<{ success: boolean; message: string }>('/ai/rebuild-index')
  },

  // ===== AI 提供商管理 =====

  /** 获取 AI 提供商列表 */
  getProviders(params?: { enabled?: number; keyword?: string }) {
    return request.get<AiProvider[]>('/ai/providers', { params })
  },

  /** 获取启用的提供商列表 */
  getEnabledProviders() {
    return request.get<AiProvider[]>('/ai/providers/enabled')
  },

  /** 获取单个提供商 */
  getProvider(id: number, includeKey?: boolean) {
    return request.get<AiProvider>(`/ai/providers/${id}`, {
      params: includeKey ? { includeKey: '1' } : undefined,
    })
  },

  /** 创建 AI 提供商 */
  createProvider(data: {
    name: string
    apiBaseUrl: string
    apiKey: string
    models: string
    defaultModel: string
    enabled?: number
    sort?: number
    description?: string | null
  }) {
    return request.post<AiProvider>('/ai/providers', data)
  },

  /** 更新 AI 提供商 */
  updateProvider(
    id: number,
    data: {
      name?: string
      apiBaseUrl?: string
      apiKey?: string
      models?: string
      defaultModel?: string
      enabled?: number
      sort?: number
      description?: string | null
    },
  ) {
    return request.put<AiProvider>(`/ai/providers/${id}`, data)
  },

  /** 删除 AI 提供商 */
  deleteProvider(id: number) {
    return request.delete(`/ai/providers/${id}`)
  },
}
