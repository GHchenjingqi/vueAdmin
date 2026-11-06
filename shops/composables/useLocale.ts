import { computed } from 'vue'
import { locales as ALL_LOCALES, defaultLocale, type Locale } from '@shared/i18n/messages'
import { detectLocale, localePath as buildLocalePath } from '@shared/i18n/localePath'
import { useStoreConfig } from './useStoreConfig'

/**
 * 多语言（P5-T01）。
 *
 * locale 单一事实源（优先级）：
 * 1. URL 前缀（route.path → detectLocale，SSR 与客户端一致，路由经 app/router.options.ts 匹配）
 * 2. 已存 `store_locale` cookie（无前缀页面延续用户已选语言；locale.global 中间件与 URL 前缀同步）
 * 3. store config 默认语言
 * 与币种完全解耦：language 不来自 currency（P1-T05）；切换语言不清空购物车（购物车按 guest/token 服务端存储，URL 变更不影响）。
 */
export function useLocale() {
  const route = useRoute()
  const storeCfg = useStoreConfig()
  const cookieLocale = useCookie<Locale>('store_locale', { maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' })

  const locale = computed<Locale>(() => {
    const fromPath = detectLocale(route.path)
    if (fromPath) return fromPath
    const c = cookieLocale.value
    if (c && ALL_LOCALES.includes(c)) return c
    const fromStore = (storeCfg.market.value.language as Locale) ?? defaultLocale
    return ALL_LOCALES.includes(fromStore) ? fromStore : defaultLocale
  })

  const lang = computed(() => locale.value.split('-')[0] || 'en')

  /** 将路径规范化为带 locale 前缀（用于 hreflang/canonical/切换跳转） */
  function localePath(path: string, loc: Locale = locale.value): string {
    return buildLocalePath(path, loc)
  }

  /** 切换到指定语言：写 cookie 并跳转到对应前缀 URL */
  function setLocale(loc: Locale): void {
    cookieLocale.value = loc
    const target = buildLocalePath(route.fullPath, loc)
    if (target !== route.fullPath) navigateTo(target, { replace: true })
  }

  return { locale, lang, locales: ALL_LOCALES, localePath, setLocale }
}
