import { z } from 'zod'

/**
 * 首页 Banner 后台写入校验
 *
 * 独立文件，避免与 cmsAdmin.ts 并发编辑互相夹带。
 * position 限定 hero/secondary；时段可空（空=无限制）。
 */

export const bannerPositionSchema = z.enum(['hero', 'secondary'])

export const bannerAdminListQuerySchema = z.object({
  siteId: z.coerce.number().int().nonnegative().optional(),
  position: bannerPositionSchema.optional(),
})
export type BannerAdminListQuery = z.infer<typeof bannerAdminListQuerySchema>

/** ISO 日期字符串或空（空=无限制） */
const dateish = z
  .string()
  .min(1)
  .refine((v) => !Number.isNaN(Date.parse(v)), '无效日期')
  .nullable()
  .optional()

export const bannerCreateSchema = z.object({
  position: bannerPositionSchema.optional(),
  title: z.string().min(1).max(255),
  subtitle: z.string().max(500).nullable().optional(),
  linkUrl: z.string().max(512).nullable().optional(),
  buttonLabel: z.string().max(120).nullable().optional(),
  image: z.string().min(1).max(512),
  enabled: z.boolean().optional(),
  sortOrder: z.coerce.number().int().min(0).max(99999).optional(),
  startAt: dateish,
  endAt: dateish,
})
export type BannerCreateBody = z.infer<typeof bannerCreateSchema>

export const bannerUpdateSchema = bannerCreateSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, '至少提供一个待更新字段')
export type BannerUpdateBody = z.infer<typeof bannerUpdateSchema>
