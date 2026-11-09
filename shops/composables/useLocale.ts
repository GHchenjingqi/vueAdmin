import { computed } from 'vue'
import { locales as ALL_LOCALES, defaultLocale, type Locale } from '@shared/i18n/messages'
import { useStoreConfig } from './useStoreConfig'

/**
 * 站点语言（P5-T01b 单语收敛）。
 *
 * locale 单一来源 = 后台 store config `market.language`（settings 唯一数据源）。
 * - 前端不再提供语言切换器，URL 无语言前缀（单 URL 结构）。
 * - 创建英文站即后台设 en-US → 全站英文；后台可改 zh-CN，站点随之切换（不在前端切换）。
 * - 与币种解耦：语言不来自 currency（P1-T05）。
 * - store config 加载前/失败回退：defaultLocale（en-US），与币种 fail-closed 不同（语言允许回退）。
 */
export function useLocale() {
  const storeCfg = useStoreConfig()

  const locale = computed<Locale>(() => {
    const fromStore = storeCfg.market.value.language as Locale
    return ALL_LOCALES.includes(fromStore) ? fromStore : defaultLocale
  })

  const lang = computed(() => locale.value.split('-')[0] || 'en')

  /** 单语站：路径恒为原样（无语言前缀），供 canonical/SEO 使用 */
  function localePath(path: string): string {
    return path || '/'
  }

  return { locale, lang, locales: ALL_LOCALES, localePath }
}
