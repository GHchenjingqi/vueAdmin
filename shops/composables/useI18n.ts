import { translate, translateI } from '@shared/i18n/messages'
import { useLocale } from './useLocale'

/**
 * 响应式 i18n（P5-T01）：组件内 const { t, ti } = useI18n()。
 * - t('nav.cart') → 当前 locale 文案（locale 由 useLocale 单一事实源：URL→cookie→store config）
 * - ti('newsletter.success', { email }) → 带插值
 * 模板中调用 t() 会读取 locale.value，切换语言时响应式更新。
 */
export function useI18n() {
  const { locale } = useLocale()
  const t = (key: string): string => translate(locale.value, key)
  const ti = (key: string, vars: Record<string, string>): string => translateI(locale.value, key, vars)
  return { locale, t, ti }
}
