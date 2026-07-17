import { z } from 'zod'
import { paginationSchema } from './common.js'

export const createNoticeSchema = z.object({
  title: z.string().min(1, '标题不能为空').max(200),
  type: z.enum(['notice', 'announcement']).default('notice'),
  content: z.string().optional(),
  status: z.enum(['draft', 'published']).default('draft'),
  isTop: z.boolean().default(false),
  targetUserIds: z.array(z.number().int().positive()).optional(),
})

export const updateNoticeSchema = createNoticeSchema.partial()

export const noticeQuerySchema = paginationSchema.extend({
  keyword: z.string().optional(),
  type: z.enum(['notice', 'announcement']).optional(),
  status: z.enum(['draft', 'published']).optional(),
})

export const noticeSchema = z.object({
  id: z.number(),
  title: z.string(),
  content: z.string().optional(),
  type: z.enum(['notice', 'announcement']),
  publisher: z.string().optional(),
  publisherName: z.string().optional(),
  publishTime: z.string().optional(),
  read: z.boolean().optional(),
  status: z.string().optional(),
  isTop: z.boolean().optional(),
  targetUserIds: z.array(z.number()).optional(),
  createdAt: z.string().optional(),
})

export type CreateNoticeInput = z.infer<typeof createNoticeSchema>
export type UpdateNoticeInput = z.infer<typeof updateNoticeSchema>
export type NoticeQueryInput = z.infer<typeof noticeQuerySchema>
export type Notice = z.infer<typeof noticeSchema>