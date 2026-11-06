import { locales, defaultLocale, type Locale } from './messages'

/**
 * locale 路径规范化（P5-T01）：为任意路径生成带语言前缀的 URL（en-US/zh-CN）。
 * 用于 hreflang/canonical 与语言切换跳转；已带前缀的路径会被替换为目标语言前缀。
 * 真实语言版本来自 locales（禁止 hreflang 指向不存在的版本 → 不输出 404 地址）。
 */
export function localePath(path: string, loc: Locale = defaultLocale): string {
  const safeLoc = locales.includes(loc) ? loc : defaultLocale
  if (!path) return `/${safeLoc}`
  const seg = path.split('/').filter(Boolean)[0]
  if (locales.includes(seg as Locale)) {
    const rest = path.slice(seg.length + 1) // 已含前导 /
    return `/${safeLoc}${rest}`
  }
  if (path === '/' || path === '') return `/${safeLoc}`
  return `/${safeLoc}/${path.replace(/^\//, '')}`
}

/** 从路径提取语言前缀（无则 null） */
export function detectLocale(path: string): Locale | null {
  const seg = path.split('/').filter(Boolean)[0]
  return locales.includes(seg as Locale) ? (seg as Locale) : null
}

/** 判断某语言是否为「真实存在」的版本（决定 hreflang 是否输出） */
export function isRealLocale(loc: string): loc is Locale {
  return locales.includes(loc as Locale)
}
