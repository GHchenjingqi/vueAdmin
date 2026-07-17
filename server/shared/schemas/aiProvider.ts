import { z } from 'zod'

// 创建 AI 提供商
export const createAiProviderSchema = z.object({
  name: z.string().min(1, '名称不能为空').max(100, '名称不能超过100个字符'),
  apiBaseUrl: z.string().url('请输入有效的 API 地址').max(255),
  apiKey: z.string().min(1, 'API Key 不能为空').max(500),
  models: z.string().min(1, '模型列表不能为空').max(500),
  defaultModel: z.string().min(1, '默认模型不能为空').max(100),
  enabled: z.number().int().min(0).max(1).default(1),
  sort: z.number().int().min(0).default(0),
  description: z.string().max(255).nullable().optional(),
})

// 更新 AI 提供商
export const updateAiProviderSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  apiBaseUrl: z.string().url('请输入有效的 API 地址').max(255).optional(),
  apiKey: z.string().min(1).max(500).optional(),
  models: z.string().min(1).max(500).optional(),
  defaultModel: z.string().min(1).max(100).optional(),
  enabled: z.number().int().min(0).max(1).optional(),
  sort: z.number().int().min(0).optional(),
  description: z.string().max(255).nullable().optional(),
})

// 查询参数
export const aiProviderQuerySchema = z.object({
  enabled: z.coerce.number().int().min(0).max(1).optional(),
  keyword: z.string().max(100).optional(),
})

// ID 参数
export const aiProviderIdSchema = z.object({
  id: z.coerce.number().int().positive('ID 必须为正整数'),
})

export type CreateAiProviderInput = z.infer<typeof createAiProviderSchema>
export type UpdateAiProviderInput = z.infer<typeof updateAiProviderSchema>
export type AiProviderQueryInput = z.infer<typeof aiProviderQuerySchema>