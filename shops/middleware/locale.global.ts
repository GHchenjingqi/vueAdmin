import { defaultLocale, type Locale } from '@shared/i18n/messages'
import { detectLocale } from '@shared/i18n/localePath'

/**
 * 多语言全局路由守卫（P5-T01）。
 *
 * 路由经 app/router.options.ts 提供 `:locale(en-US|zh-CN)?` 前缀参数，
 * 故 `/zh-CN/cart` 命中带前缀页面。本守卫在每次导航（SSR+客户端）将 URL 前缀
 * 同步进 store_locale cookie，使 useLocale() 单一事实源保持一致。
 * 无前缀路径（可选参数缺失）不改写 cookie，保留用户已选语言。
 */
export default defineNuxtRouteMiddleware((to) => {
  const seg = detectLocale(to.path)
  if (seg) {
    const cookie = useCookie<Locale>('store_locale', {
      maxAge: 60 * 60 * 24 * 365,
      sameSite: 'lax',
      default: () => defaultLocale,
    })
    if (cookie.value !== seg) cookie.value = seg
  }
})
