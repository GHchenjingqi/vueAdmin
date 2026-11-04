import { z } from 'zod'

/**
 * 商城后台共享 Schema（Zod）
 *
 * 阶段 1：商品中心（类目/品牌/属性/SPU/SKU/价格/汇率快照）。
 * 作为前后端共享的类型单一来源（对齐 workflow.ts 的组织方式）。
 */

// ==================== 通用 ====================

/** 多语言文本 JSON，如 { "zh-CN": "服饰", "en-US": "Apparel" } */
export const i18nTextSchema = z.record(z.string().min(1).max(10), z.string().min(1).max(2000))

/** 分页查询 */
export const shopPaginationSchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  keyword: z.string().max(100).optional(),
})

// ==================== 上架/发布状态机 ====================

export const spuStatusSchema = z.enum(['draft', 'review', 'rejected', 'listed', 'published', 'unlisted', 'archived'])
export type SpuStatus = z.infer<typeof spuStatusSchema>

/** 允许的状态流转（阶段 1 直接流转；阶段 2 改为审批流驱动） */
export const spuStatusTransitions: Record<SpuStatus, SpuStatus[]> = {
  draft: ['review', 'archived'],
  review: ['draft', 'listed', 'rejected'],
  rejected: ['draft', 'archived'],
  listed: ['published', 'unlisted', 'archived'],
  published: ['unlisted', 'archived'],
  unlisted: ['listed', 'archived'],
  archived: [],
}

export const statusActionSchema = z.enum(['submit', 'withdraw', 'reject', 'list', 'publish', 'unlist', 'archive'])
export type StatusAction = z.infer<typeof statusActionSchema>

/** 动作 → 目标状态（reject 需带 reason） */
export const statusActionTarget: Record<StatusAction, SpuStatus> = {
  submit: 'review',
  withdraw: 'draft',
  reject: 'rejected',
  list: 'listed',
  publish: 'published',
  unlist: 'unlisted',
  archive: 'archived',
}

export const statusChangeSchema = z.object({
  action: statusActionSchema,
  reason: z.string().max(500).optional(),
})

// ==================== 类目 ====================

export const createCategorySchema = z.object({
  parentId: z.number().int().min(0).default(0),
  name: i18nTextSchema,
  level: z.number().int().min(1).max(5).default(1),
  sort: z.number().int().default(0),
})
export type CreateCategoryInput = z.infer<typeof createCategorySchema>

export const updateCategorySchema = createCategorySchema.partial()
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>

// ==================== 品牌 ====================

export const createBrandSchema = z.object({
  name: z.string().min(1).max(100),
  logo: z.string().max(500).optional(),
})
export type CreateBrandInput = z.infer<typeof createBrandSchema>

export const updateBrandSchema = createBrandSchema.partial()
export type UpdateBrandInput = z.infer<typeof updateBrandSchema>

// ==================== 属性 ====================

export const createAttributeSchema = z
  .object({
    categoryId: z.number().int().min(1).nullable().optional(),
    name: z.string().min(1).max(100),
    type: z.enum(['text', 'select']).default('text'),
    options: z.array(z.string().min(1).max(100)).nullable().optional(),
    required: z.number().int().min(0).max(1).default(0),
    sort: z.number().int().default(0),
  })
  .refine((v) => v.type !== 'select' || (v.options != null && v.options.length > 0), {
    message: 'type=select 时 options 不能为空',
  })
export type CreateAttributeInput = z.infer<typeof createAttributeSchema>

export const updateAttributeSchema = createAttributeSchema.innerType().partial()
export type UpdateAttributeInput = z.infer<typeof updateAttributeSchema>

// ==================== SPU ====================

export const createSpuSchema = z.object({
  categoryId: z.number().int().min(1),
  brandId: z.number().int().min(1).nullable().optional(),
  name: i18nTextSchema,
  description: i18nTextSchema.nullable().optional(),
  cover: z.string().max(500).nullable().optional(),
  images: z.array(z.string().max(500)).nullable().optional(),
})
export type CreateSpuInput = z.infer<typeof createSpuSchema>

export const updateSpuSchema = createSpuSchema.partial()
export type UpdateSpuInput = z.infer<typeof updateSpuSchema>

// ==================== SKU ====================

export const createSkuSchema = z.object({
  spuId: z.number().int().min(1),
  code: z.string().min(1).max(64),
  spec: z.record(z.string().min(1).max(50), z.string().min(1).max(200)).nullable().optional(),
  barcode: z.string().max(64).nullable().optional(),
  originCountry: z.string().length(2).nullable().optional(),
  hsCode: z.string().max(20).nullable().optional(),
  declaredValue: z.number().min(0).max(9999999999.99).nullable().optional(),
  compliance: z.record(z.string().min(1).max(50), z.string().max(500)).nullable().optional(),
})
export type CreateSkuInput = z.infer<typeof createSkuSchema>

export const updateSkuSchema = createSkuSchema.omit({ spuId: true }).partial()
export type UpdateSkuInput = z.infer<typeof updateSkuSchema>

// ==================== 价格 ====================

export const upsertPriceSchema = z.object({
  currency: z.string().length(3),
  amount: z.number().min(0).max(9999999999.99),
  rateSnapshotId: z.number().int().min(1).nullable().optional(),
})
export type UpsertPriceInput = z.infer<typeof upsertPriceSchema>

// ==================== 汇率快照 ====================

export const rateSnapshotSchema = z.object({
  baseCurrency: z.string().length(3).default('USD'),
  rates: z.record(z.string().length(3), z.number().gt(0)),
  rateDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'rateDate 需为 YYYY-MM-DD'),
})
export type RateSnapshotInput = z.infer<typeof rateSnapshotSchema>

// ==================== 商城模块健康检查响应 ====================

export const shopHealthSchema = z.object({
  ok: z.boolean(),
  service: z.string(),
  time: z.string(),
})

export type ShopHealth = z.infer<typeof shopHealthSchema>
