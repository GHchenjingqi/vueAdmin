import { computed } from 'vue'
import { locales, defaultLocale } from '@shared/i18n/messages'
import { useLocale } from './useLocale'

/** SEO 组合式（P2-T09 / P5-T01）：唯一 Title/Description/Canonical/hreflang（仅真实存在的语言版本，禁止指向 404）。 */
export function useSeo(input: { title: string; description: string; path: string }) {
  const siteUrl = useRuntimeConfig().public.siteUrl as string
  const { localePath } = useLocale()
  const canonical = computed(() => `${siteUrl}${localePath(input.path)}`)

  // P5-T01：hreflang 只输出真实存在的语言版本（en-US / zh-CN），各自指向带前缀 URL（经 01-locale 中间件服务，不会 404）
  const hreflang = computed(() => [
    ...locales.map((loc) => ({ rel: 'alternate', hreflang: loc, href: `${siteUrl}${localePath(input.path, loc)}` })),
    { rel: 'alternate', hreflang: 'x-default', href: `${siteUrl}${localePath(input.path, defaultLocale)}` },
  ])

  useHead({
    title: () => input.title,
    meta: [{ name: 'description', content: input.description }],
    link: [{ rel: 'canonical', href: canonical.value }, ...hreflang.value],
  })

  return { canonical }
}
