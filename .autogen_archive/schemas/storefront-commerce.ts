import { z } from 'zod'

/** C 端交易契约（P3）：cart/quote/order/payment；金额对象 {amount:分, currency}（C2/C3） */

export const addressSchema = z.object({
  fullName: z.string().min(1).max(120),
  phone: z.string().min(3).max(32),
  country: z.string().length(2),
  province: z.string().min(1).max(64),
  city: z.string().min(1).max(64),
  address1: z.string().min(1).max(255),
  address2: z.string().max(255).optional(),
  postcode: z.string().min(1).max(20),
})
export type AddressInput = z.infer<typeof addressSchema>

export const addCartItemSchema = z.object({ skuId: z.number().int().positive(), qty: z.number().int().min(1).max(10).default(1) })
export const updateCartItemSchema = z.object({ qty: z.number().int().min(0).max(10) })

export const quoteSchemaReq = z.object({
  address: addressSchema.partial({ fullName: true, phone: true }).optional(),
  couponCode: z.string().trim().max(64).optional(),
  shippingRateId: z.string().trim().max(32).optional(),
})

export const createOrderSchema = z.object({
  email: z.string().email().max(255),
  address: addressSchema,
  shippingRateId: z.string().trim().max(32).optional(),
  couponCode: z.string().trim().max(64).optional(),
  note: z.string().max(500).optional(),
})

export const currencyConfigSchema = z.object({
  code: z.string().regex(/^[A-Z]{3}$/),
  symbol: z.string().min(1).max(8),
  decimalDigits: z.number().int().min(0).max(4),
  symbolPosition: z.enum(['before', 'after']),
  thousandsSeparator: z.string().max(4),
  decimalSeparator: z.string().max(4),
  locale: z.string().min(2).max(20),
})

export const updateCurrencySchema = z.object({
  config: currencyConfigSchema,
  confirmImpact: z.literal(true),
  ackNoConversion: z.literal(true),
  effectiveAt: z.string().datetime().optional(),
})

export const rollbackCurrencySchema = z.object({ changeId: z.number().int().positive() })
