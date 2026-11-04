import { z } from 'zod'

/**
 * Storefront 公开接口共享 Schema（Zod）
 *
 * 注意：validate 中间件会用解析结果整体替换 req.query，Zod object 默认会剥离
 * 未声明字段（阶段 2/3/4 已踩过坑），因此所有 query schema 必须 .passthrough()。
 *
 * 公开接口的 query 参数一律「非法值视为未传」而非抛 400，避免脏参数直接打挂 C 端页面。
 */

/** 正整数 query：空串 / 非数字 / 越界一律降级为 undefined */
const optionalQueryInt = (max?: number) =>
  z.preprocess((v) => {
    if (v === '' || v === undefined || v === null) return undefined
    const n = Number(v)
    if (!Number.isInteger(n) || n <= 0) return undefined
    if (max !== undefined && n > max) return undefined
    return n
  }, z.number().int().positive().optional())

/** 字符串 query：去空白、限长，空串降级为 undefined */
const optionalQueryStr = (max: number) =>
  z.preprocess((v) => {
    if (typeof v !== 'string') return undefined
    const s = v.trim()
    return s === '' ? undefined : s.slice(0, max)
  }, z.string().optional())

export const storefrontProductQuerySchema = z
  .object({
    page: optionalQueryInt(),
    pageSize: optionalQueryInt(60),
    keyword: optionalQueryStr(100),
    categoryId: optionalQueryInt(),
    currency: z.preprocess((v) => {
      if (typeof v !== 'string') return undefined
      const s = v.trim().toUpperCase()
      return /^[A-Z]{3}$/.test(s) ? s : undefined
    }, z.string().length(3).optional()),
    lang: optionalQueryStr(10),
  })
  .passthrough()

export type StorefrontProductQuery = z.infer<typeof storefrontProductQuerySchema>

export const storefrontCategoryQuerySchema = z
  .object({
    lang: optionalQueryStr(10),
  })
  .passthrough()

/** 商品详情路径参数：slug 形如 `123-body-wave-wig`，也接受纯 id */
export const storefrontSlugParamSchema = z
  .object({
    slug: z.string().min(1).max(200),
  })
  .passthrough()

export const storefrontRateQuerySchema = z
  .object({
    base: z.preprocess((v) => {
      if (typeof v !== 'string') return undefined
      const s = v.trim().toUpperCase()
      return /^[A-Z]{3}$/.test(s) ? s : undefined
    }, z.string().length(3).optional()),
  })
  .passthrough()

// ————————————————————————————————————————————————
// 阶段 5 步骤 4：购物车 / 结算报价 / 建单 / 支付（公开接口，.passthrough() 容忍多余字段）
// ————————————————————————————————————————————————

const iso3 = z
  .string()
  .transform((v) => v.trim().toUpperCase())
  .refine((v) => /^[A-Z]{3}$/.test(v), '币种需为 ISO 4217 三位代码')

const cartLineInput = z.object({
  skuId: z.number().int().positive('skuId 必须为正整数'),
  qty: z.number().int().min(1, '数量至少为 1').max(9999),
})

/** POST /cart/items —— 加入 / 更新购物车 */
export const cartAddSchema = z
  .object({
    skuId: z.number().int().positive('skuId 必须为正整数'),
    qty: z.number().int().min(1, '数量至少为 1').max(9999),
  })
  .passthrough()

/** PATCH /cart/items/:id —— 改数量 */
export const cartUpdateSchema = z
  .object({
    qty: z.number().int().min(1, '数量至少为 1').max(9999),
  })
  .passthrough()

/** POST /checkout/quote —— 服务端重算报价（忽略前端传入总价） */
export const quoteSchema = z
  .object({
    cartToken: z.string().min(1).max(64).optional(),
    items: z.array(cartLineInput).max(100).optional(),
    shippingAddress: z.record(z.unknown()).optional(),
  })
  .passthrough()

/** POST /orders —— 建单（幂等键 + 快照 + 库存预占） */
export const createOrderSchema = z
  .object({
    idempotencyKey: z.string().min(1).max(64).optional(),
    email: z.string().email('邮箱格式不正确').max(255).optional(),
    shippingAddress: z.record(z.unknown()).optional(),
    note: z.string().max(500).optional(),
    cartToken: z.string().min(1).max(64).optional(),
    items: z.array(cartLineInput).max(100).optional(),
    customerId: z.number().int().positive().optional(),
  })
  .passthrough()

/** POST /payments/session —— 创建支付会话 */
export const createPaymentSessionSchema = z
  .object({
    orderId: z.number().int().positive('orderId 必须为正整数'),
  })
  .passthrough()

export type CartAddInput = z.infer<typeof cartAddSchema>
export type CartUpdateInput = z.infer<typeof cartUpdateSchema>
export type QuoteInput = z.infer<typeof quoteSchema>
export type CreateOrderInput = z.infer<typeof createOrderSchema>
export type CreatePaymentSessionInput = z.infer<typeof createPaymentSessionSchema>
