import { z } from 'zod'

/** 币种配置治理 schema（P0-T05b / P5-T02）：二次确认字段为 literal(true)，缺失即 400 */

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
