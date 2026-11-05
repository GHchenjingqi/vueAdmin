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

/** 订单来源归因（site / utm），随建单固化进订单快照 */
export const orderAttributionSchema = z.object({
  utmSource: z.string().max(120).optional(),
  utmMedium: z.string().max(120).optional(),
  utmCampaign: z.string().max(200).optional(),
  utmTerm: z.string().max(200).optional(),
  utmContent: z.string().max(200).optional(),
  landingPage: z.string().max(512).optional(),
  referrer: z.string().max(512).optional(),
})

export type OrderAttribution = z.infer<typeof orderAttributionSchema>

/** POST /orders —— 建单（幂等键 + 快照 + 库存预占 + 来源归因） */
export const createOrderSchema = z
  .object({
    idempotencyKey: z.string().min(1).max(64).optional(),
    email: z.string().email('邮箱格式不正确').max(255).optional(),
    shippingAddress: z.record(z.unknown()).optional(),
    note: z.string().max(500).optional(),
    cartToken: z.string().min(1).max(64).optional(),
    items: z.array(cartLineInput).max(100).optional(),
    customerId: z.number().int().positive().optional(),
    attribution: orderAttributionSchema.optional(),
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

// ————————————————————————————————————————————————
// 阶段 5 步骤 5：订阅 + 到货通知（公开接口，.passthrough() 容忍多余字段）
// ————————————————————————————————————————————————

/** POST /newsletter/subscribe —— 邮件订阅（POST 体仅接受声明字段，多余字段剥离） */
export const newsletterSubscribeSchema = z.object({
  email: z.string().email('邮箱格式不正确').max(255),
  source: z.string().max(50).optional(),
  locale: z.string().max(10).optional(),
})

/** POST /newsletter/unsubscribe & GET /newsletter/unsubscribe?token= —— 退订 */
export const newsletterUnsubscribeSchema = z.object({
  token: z.string().min(1).max(64),
})

/** POST /restock/subscribe —— 到货提醒订阅（POST 体仅接受声明字段，多余字段剥离） */
export const restockSubscribeSchema = z.object({
  email: z.string().email('邮箱格式不正确').max(255),
  skuId: z.number().int().positive('skuId 必须为正整数'),
  locale: z.string().max(10).optional(),
})

export type NewsletterSubscribeInput = z.infer<typeof newsletterSubscribeSchema>
export type NewsletterUnsubscribeInput = z.infer<typeof newsletterUnsubscribeSchema>
export type RestockSubscribeInput = z.infer<typeof restockSubscribeSchema>

// ————————————————————————————————————————————————
// 阶段 5 步骤 5（第二切片）：商品评价 + 问答（公开接口）
// ————————————————————————————————————————————————

/** GET /reviews?spuId=&page=&pageSize= —— 公开评价列表（仅 approved + 评分汇总） */
export const reviewListQuerySchema = z
  .object({
    spuId: z.coerce.number().int().positive('spuId 必须为正整数'),
    page: optionalQueryInt(),
    pageSize: optionalQueryInt(60),
  })
  .passthrough()

/** POST /reviews —— 提交评价（游客/登录顾客，进入 pending 审核态） */
export const reviewSubmitSchema = z.object({
  spuId: z.number().int().positive('spuId 必须为正整数'),
  skuId: z.number().int().positive().optional(),
  rating: z.number().int().min(1).max(5, '评分必须为 1-5'),
  title: z.string().max(120).optional(),
  content: z.string().min(1).max(2000),
  images: z.array(z.string().url()).max(9).optional(),
  isAnonymous: z.boolean().optional(),
  orderId: z.number().int().positive().optional(),
  locale: z.string().max(10).optional(),
})

/** POST /reviews/:id/helpful —— 标记有用 */
export const reviewHelpfulParamSchema = z
  .object({
    id: z.coerce.number().int().positive(),
  })
  .passthrough()

/** GET /qa?spuId= —— 公开问答列表（仅 answered） */
export const qaListQuerySchema = z
  .object({
    spuId: z.coerce.number().int().positive('spuId 必须为正整数'),
  })
  .passthrough()

/** POST /qa —— 提交问题（进入 pending 待回答） */
export const qaSubmitSchema = z.object({
  spuId: z.number().int().positive('spuId 必须为正整数'),
  skuId: z.number().int().positive().optional(),
  question: z.string().min(1).max(1000),
  locale: z.string().max(10).optional(),
})

export type ReviewListQueryInput = z.infer<typeof reviewListQuerySchema>
export type ReviewSubmitInput = z.infer<typeof reviewSubmitSchema>
export type QaListQueryInput = z.infer<typeof qaListQuerySchema>
export type QaSubmitInput = z.infer<typeof qaSubmitSchema>

// ————————————————————————————————————————————————
// 阶段 5 步骤 5（第三切片）：内容管理 CMS（公开读取接口）
// ————————————————————————————————————————————————

/** GET /cms/articles?page=&pageSize=&tag=&keyword= —— 公开文章列表（仅 published） */
export const cmsListQuerySchema = z
  .object({
    page: optionalQueryInt(),
    pageSize: optionalQueryInt(60),
    tag: optionalQueryStr(40),
    keyword: optionalQueryStr(100),
  })
  .passthrough()

/** GET /cms/articles/:slug —— 文章详情（路径参数 slug） */
export const cmsSlugParamSchema = z
  .object({
    slug: z.string().min(1).max(255),
  })
  .passthrough()

export type CmsListQueryInput = z.infer<typeof cmsListQuerySchema>
export type CmsSlugParamInput = z.infer<typeof cmsSlugParamSchema>

// ————————————————————————————————————————————————
// 阶段 5 步骤 5（第四切片）：退货/售后（顾客登录，需校验订单归属与服务端重算退款）
// ————————————————————————————————————————————————

/** POST /rma —— 提交退货申请（orderId + 退货明细 + 原因） */
export const rmaSubmitSchema = z.object({
  orderId: z.number().int().positive('orderId 必须为正整数'),
  items: z
    .array(
      z.object({
        orderItemId: z.number().int().positive('orderItemId 必须为正整数'),
        skuId: z.number().int().positive('skuId 必须为正整数'),
        qty: z.number().int().min(1, '退货数量至少为 1').max(9999),
      }),
    )
    .min(1, '退货明细不能为空')
    .max(100),
  reason: z.string().max(1000).optional(),
})

/** GET /rma/:id、POST /rma/:id/cancel、POST /rma/:id/track —— 路径参数 id */
export const rmaIdParamSchema = z
  .object({
    id: z.coerce.number().int().positive(),
  })
  .passthrough()

/** POST /rma/:id/track —— 回寄物流单号 */
export const rmaTrackSchema = z.object({
  trackingNo: z.string().min(1).max(64, '物流单号最长 64 字符'),
})

export type RmaSubmitInput = z.infer<typeof rmaSubmitSchema>
export type RmaIdParamInput = z.infer<typeof rmaIdParamSchema>
export type RmaTrackInput = z.infer<typeof rmaTrackSchema>

// ————————————————————————————————————————————————
// 阶段 5 步骤 5（第五切片）：物流轨迹 17track（防枚举，需 orderNo + accessToken 双要素）
// ————————————————————————————————————————————————

/** GET /track/:orderNo —— 路径参数订单号 */
export const trackOrderParamSchema = z
  .object({
    orderNo: z.string().min(1).max(64),
  })
  .passthrough()

/** GET /track/:orderNo?accessToken= —— 访问凭证（缺失时 service 层按 404 处理） */
export const trackOrderQuerySchema = z
  .object({
    accessToken: z.string().min(1).max(128).optional(),
  })
  .passthrough()

export type TrackOrderParamInput = z.infer<typeof trackOrderParamSchema>
export type TrackOrderQueryInput = z.infer<typeof trackOrderQuerySchema>

// ————————————————————————————————————————————————
// 阶段 5 步骤 6：服务端 CAPI 埋点（事件幂等 + 同意门控 + 服务端事实校准）
// ————————————————————————————————————————————————

/** POST /track-event —— 上报一个埋点事件（params 为开放字典，容纳各事件参数） */
export const trackEventSchema = z
  .object({
    eventId: z.string().min(1).max(64, 'eventId 最长 64 字符'),
    eventName: z.string().min(1).max(40),
    consent: z
      .object({ analytics: z.boolean().optional() })
      .passthrough()
      .optional(),
    sessionId: z.string().max(64).optional(),
    params: z.record(z.unknown()).optional(),
  })
  .passthrough()

export type TrackEventInputSchema = z.infer<typeof trackEventSchema>
