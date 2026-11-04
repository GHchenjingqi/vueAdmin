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
