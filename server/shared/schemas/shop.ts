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

/**
 * 分页查询
 *
 * 使用 `.passthrough()`：validate 中间件会用解析结果整体替换 req.query，
 * Zod 默认会剥离未声明字段，导致各列表接口的专属筛选参数
 * （skuId / warehouseId / spuId / channelId / status / type 等）全部丢失。
 */
export const shopPaginationSchema = z
  .object({
    page: z.coerce.number().int().min(1).optional(),
    pageSize: z.coerce.number().int().min(1).max(100).optional(),
    keyword: z.string().max(100).optional(),
  })
  .passthrough()

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
  /** SEO slug：小写字母/数字与连字符，留空则由前台生成式 slug 兜底（阶段 5 第 2 步） */
  slug: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug 须为小写字母、数字与连字符，且不能以连字符开头/结尾')
    .optional(),
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

// ============================================================================
// 阶段 2：渠道 / 店铺 / 渠道商品 / 合规卡点 / 发布
// ============================================================================

export const channelTypeSchema = z.enum(['amazon', 'shopify', 'tiktok', 'shopee', 'independent'])
export type ChannelType = z.infer<typeof channelTypeSchema>

export const createChannelSchema = z.object({
  name: z.string().min(1).max(100),
  type: channelTypeSchema,
  config: z.record(z.string(), z.unknown()).nullable().optional(),
})
export type CreateChannelInput = z.infer<typeof createChannelSchema>

export const updateChannelSchema = createChannelSchema.partial()
export type UpdateChannelInput = z.infer<typeof updateChannelSchema>

export const createShopSchema = z.object({
  channelId: z.number().int().min(1),
  name: z.string().min(1).max(100),
  credentials: z.record(z.string(), z.unknown()).nullable().optional(),
})
export type CreateShopInput = z.infer<typeof createShopSchema>

export const updateShopSchema = createShopSchema.partial()
export type UpdateShopInput = z.infer<typeof updateShopSchema>

export const channelProductStatusSchema = z.enum(['listed', 'published'])
export type ChannelProductStatus = z.infer<typeof channelProductStatusSchema>

export const createChannelProductSchema = z.object({
  channelId: z.number().int().min(1),
  shopId: z.number().int().min(1),
  spuId: z.number().int().min(1),
  skuId: z.number().int().min(1).nullable().optional(),
})
export type CreateChannelProductInput = z.infer<typeof createChannelProductSchema>

/** 提交发布：选择渠道/店铺，触发审批流 */
export const submitPublishSchema = z.object({
  channelId: z.number().int().min(1),
  shopId: z.number().int().min(1),
  /** 是否同步上架到渠道（审批通过后写入 channel_products） */
  listToChannel: z.boolean().default(true),
})
export type SubmitPublishInput = z.infer<typeof submitPublishSchema>

// ============================================================================
// 阶段 3：库存中心 / 订单履约 / 物流
// ============================================================================

export const warehouseTypeSchema = z.enum(['bonded', 'overseas', 'direct'])
export type WarehouseType = z.infer<typeof warehouseTypeSchema>

export const createWarehouseSchema = z.object({
  name: z.string().min(1).max(100),
  type: warehouseTypeSchema,
  country: z.string().length(2).default('CN'),
  address: z.string().max(500).nullable().optional(),
})
export type CreateWarehouseInput = z.infer<typeof createWarehouseSchema>

export const updateWarehouseSchema = createWarehouseSchema.partial()
export type UpdateWarehouseInput = z.infer<typeof updateWarehouseSchema>

export const inventoryLogTypeSchema = z.enum(['in', 'out', 'lock', 'unlock'])
export type InventoryLogType = z.infer<typeof inventoryLogTypeSchema>

export const adjustInventorySchema = z.object({
  skuId: z.number().int().min(1),
  warehouseId: z.number().int().min(1),
  delta: z.number().int(),
})
export type AdjustInventoryInput = z.infer<typeof adjustInventorySchema>

export const orderStatusSchema = z.enum(['created', 'paid', 'fulfilled', 'shipped', 'done', 'cancelled'])
export type OrderStatus = z.infer<typeof orderStatusSchema>

export const createOrderItemSchema = z.object({
  skuId: z.number().int().min(1),
  qty: z.number().int().min(1),
  price: z.number().min(0).max(9999999999.99),
})
export type CreateOrderItemInput = z.infer<typeof createOrderItemSchema>

export const createOrderSchema = z.object({
  channelId: z.number().int().min(1),
  shopId: z.number().int().min(1),
  buyer: z.record(z.string(), z.unknown()),
  currency: z.string().length(3).default('USD'),
  items: z.array(createOrderItemSchema).min(1),
})
export type CreateOrderInput = z.infer<typeof createOrderSchema>

export const shipOrderSchema = z.object({
  carrier: z.string().min(1).max(100),
  trackingNo: z.string().min(1).max(100).optional(),
})
export type ShipOrderInput = z.infer<typeof shipOrderSchema>

// ============================================================================
// 阶段 4：营销中心 / 数据参谋
// ============================================================================

export const promotionTypeSchema = z.enum(['discount', 'full_reduce'])
export const promotionScopeSchema = z.enum(['sku', 'spu', 'category', 'all'])
export type PromotionType = z.infer<typeof promotionTypeSchema>
export type PromotionScope = z.infer<typeof promotionScopeSchema>

export const createPromotionSchema = z.object({
  name: i18nTextSchema,
  type: promotionTypeSchema,
  scope: promotionScopeSchema,
  rule: z.record(z.string(), z.unknown()),
  startAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  targetIds: z.array(z.number().int()).nullable().optional(),
})
export type CreatePromotionInput = z.infer<typeof createPromotionSchema>

export const updatePromotionSchema = createPromotionSchema.partial()
export type UpdatePromotionInput = z.infer<typeof updatePromotionSchema>

export const couponTypeSchema = z.enum(['fixed', 'percent'])
export type CouponType = z.infer<typeof couponTypeSchema>

export const createCouponSchema = z.object({
  code: z.string().min(1).max(50),
  type: couponTypeSchema,
  value: z.number().min(0).max(9999999999.99),
  minSpend: z.number().min(0).default(0),
  currency: z.string().length(3).default('USD'),
  validFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  validTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})
export type CreateCouponInput = z.infer<typeof createCouponSchema>

export const updateCouponSchema = createCouponSchema.partial()
export type UpdateCouponInput = z.infer<typeof updateCouponSchema>

export const analyticsQuerySchema = z.object({
  startAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dimension: z.enum(['channel', 'country', 'category', 'day']).default('day'),
  channelId: z.number().int().min(1).optional(),
})
export type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>

/** T-09：创建订单退款（金额单位分；省略 amountCents 表示退剩余全部） */
export const createRefundSchema = z.object({
  amountCents: z.number().int().positive('退款金额须为正整数分').optional(),
  reason: z.string().max(255).optional(),
  idempotencyKey: z.string().min(1).max(64).optional(),
  /** 仅用于校验；与订单快照不符直接拒绝，不参与落库 */
  currency: z.string().length(3).optional(),
})
export type CreateRefundInput = z.infer<typeof createRefundSchema>

/** RMA 驳回（P4-T17 G4：客服履约） */
export const rmaRejectSchema = z.object({
  rejectReason: z.string().min(1, '驳回原因不能为空').max(255),
})
export type RmaRejectInput = z.infer<typeof rmaRejectSchema>
