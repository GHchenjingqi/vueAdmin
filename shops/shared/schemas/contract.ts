import { z } from 'zod'
import type { StoreConfig } from '../types/currency'

/** 契约测试骨架（P1-T14）：store-config 响应 schema（前后端共享契约） */
export const currencyConfigSchema = z.object({
  code: z.string().regex(/^[A-Z]{3}$/),
  symbol: z.string().min(1),
  decimalDigits: z.number().int().min(0).max(4),
  symbolPosition: z.enum(['before', 'after']),
  thousandsSeparator: z.string(),
  decimalSeparator: z.string(),
  locale: z.string().min(2),
})

export const storeConfigSchema = z.object({
  currency: currencyConfigSchema,
  market: z.object({ country: z.string().length(2), language: z.string().min(2) }),
  version: z.string().min(1),
})

export function parseStoreConfig(raw: unknown): StoreConfig {
  return storeConfigSchema.parse(raw) as StoreConfig
}

export const moneySchema = z.object({ amount: z.number().int().nonnegative(), currency: z.string().regex(/^[A-Z]{3}$/) })

export const cartItemSchema = z.object({
  id: z.number().int(),
  skuId: z.number().int(),
  spuId: z.number().int(),
  title: z.string(),
  spec: z.record(z.string(), z.string()),
  qty: z.number().int().min(1).max(10),
  unit: moneySchema,
  lineTotal: moneySchema,
  sellable: z.boolean(),
  stockNote: z.string().optional(),
})

export const cartSchema = z.object({
  token: z.string(),
  items: z.array(cartItemSchema),
  currency: z.string().regex(/^[A-Z]{3}$/),
  itemCount: z.number().int().nonnegative(),
})

export const quoteSchema = z.object({
  quoteId: z.string(),
  version: z.number().int(),
  expiresAt: z.string(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  items: z.array(z.object({ skuId: z.number().int(), title: z.string(), qty: z.number().int(), unit: moneySchema, lineTotal: moneySchema })),
  totals: z.object({ subtotal: moneySchema, discount: moneySchema, shipping: moneySchema, tax: moneySchema, total: moneySchema }),
  shippingRates: z.array(z.object({ id: z.string(), name: z.string(), amount: moneySchema, etaDays: z.string() })),
  appliedCoupon: z.object({ code: z.string(), discount: moneySchema }).nullable().optional(),
  warnings: z.array(z.string()),
})
