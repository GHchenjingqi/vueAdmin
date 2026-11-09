import { locales, type Locale } from './messages'

/**
 * 单语站（P5-T01b）：路径无语言前缀。
 * locale 唯一来源为后台 store config，前端不切换，故 URL 不再承载语言。
 * 保留函数以兼容 import；localePath 恒返回原路径，detectLocale 恒 null（无前缀可检测）。
 */
export function localePath(path: string, _loc?: string): string {
  return path || '/'
}

/** 单语站无 URL 前缀 → 恒 null */
export function detectLocale(_path: string): null {
  return null
}

/** 判断某语言是否为「后台可配置」的版本 */
export function isRealLocale(loc: string): loc is Locale {
  return locales.includes(loc as Locale)
}
