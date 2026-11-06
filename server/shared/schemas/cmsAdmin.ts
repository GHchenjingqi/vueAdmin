import { z } from 'zod'

/**
 * CMS 后台写入校验（P5-T06）
 *
 * 独立文件而非并入 shared/schemas/storefront.ts：该文件在并行方 P5-T01/P5-T03
 * 工作树中，独立文件可避免并发编辑互相夹带。公开读取仍用 storefront.ts 的既有 schema。
 */

/** 站点内唯一 slug：小写字母/数字 + 单连字符分段，杜绝空格、大小写歧义与路径穿越 */
export const articleSlugSchema = z
  .string()
  .min(1)
  .max(255)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug 仅允许小写字母、数字与连字符分段')

export const articleAdminListQuerySchema = z.object({
  siteId: z.coerce.number().int().positive().optional(),
  status: z.enum(['draft', 'published']).optional(),
  page: z.coerce.number().int().min(1).max(10000).optional(),
  pageSize: z.coerce.number().int().min(1).max(60).optional(),
})
export type ArticleAdminListQuery = z.infer<typeof articleAdminListQuerySchema>

export const articleCreateSchema = z.object({
  title: z.string().min(1).max(255),
  slug: articleSlugSchema,
  content: z.string().min(1),
  summary: z.string().max(500).nullable().optional(),
  coverImage: z.string().max(512).nullable().optional(),
  authorName: z.string().max(120).nullable().optional(),
  tags: z.array(z.string().min(1).max(50)).max(20).nullable().optional(),
  status: z.enum(['draft', 'published']).optional(),
  sortOrder: z.coerce.number().int().min(0).max(99999).optional(),
})
export type ArticleCreateBody = z.infer<typeof articleCreateSchema>

/** 状态变更走专门的 publish/unpublish 端点，更新接口不接受 status，避免绕过缓存失效 */
export const articleUpdateSchema = articleCreateSchema
  .partial()
  .omit({ status: true })
  .refine((v) => Object.keys(v).length > 0, '至少提供一个待更新字段')
export type ArticleUpdateBody = z.infer<typeof articleUpdateSchema>
