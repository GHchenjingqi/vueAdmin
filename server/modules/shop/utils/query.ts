/**
 * 商城模块的 query 参数解析工具。
 *
 * 背景：validate 中间件用 Zod 解析 query 后会整体替换 req.query，
 * 未在 schema 中声明的筛选参数（如 skuId / spuId / channelId）会保留为字符串。
 * 直接 `Number(v)` 在非法输入下会得到 NaN，污染 Sequelize where 条件。
 * 这里统一做安全转换：非法值一律视为「未传」。
 */

/** 解析正整数 ID；非法值返回 undefined */
export function queryInt(raw: unknown): number | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined
  const n = Number(raw)
  if (!Number.isInteger(n) || n <= 0) return undefined
  return n
}

/** 解析字符串枚举；空值返回 undefined */
export function queryStr(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined
  const v = raw.trim()
  return v === '' ? undefined : v
}
