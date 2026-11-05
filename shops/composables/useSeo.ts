import { computed } from 'vue'

/** SEO 组合式（P2-T09）：每个页面类型自动产出唯一 Title/Description/Canonical/hreflang（仅真实存在的语言版本）。 */
export function useSeo(input: { title: string; description: string; path: string }) {
  const siteUrl = useRuntimeConfig().public.siteUrl as string
  const canonical = computed(() => `${siteUrl}${input.path}`)

  useHead({
    title: () => input.title,
    meta: [{ name: 'description', content: input.description }],
    link: [{ rel: 'canonical', href: canonical.value }],
  })

  return { canonical }
}
