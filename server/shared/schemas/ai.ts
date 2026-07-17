import { z } from 'zod'

// 生成代码请求
export const chatSchema = z.object({
  message: z.string().min(1, '需求描述不能为空').max(5000, '需求描述不能超过5000个字符'),
  providerId: z.number().int().positive().optional(),
  model: z.string().optional(),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
  })).optional(),
})

// 应用代码到项目
export const applySchema = z.object({
  files: z.array(z.object({
    path: z.string().min(1, '文件路径不能为空'),
    content: z.string(),
    language: z.string().optional(),
    description: z.string().optional(),
    isNew: z.boolean().default(true),
  })).min(1, '至少需要一个文件'),
  rollback: z.boolean().default(false),
})

export type ChatInput = z.infer<typeof chatSchema>
export type ApplyInput = z.infer<typeof applySchema>