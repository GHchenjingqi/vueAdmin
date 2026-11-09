import { computed } from 'vue'
import { useLocale } from './useLocale'

/**
 * SEO 组合式（P2-T09 / P5-T01b 单语 / SEO-TDK）。
 * 跨境独立站 TDK 惯例：唯一 Title/Description/Keywords + canonical + Open Graph + Twitter Card + robots。
 * - 单语站无 hreflang（后台语言唯一，前端不切换）。
 * - 默认 index, follow；交易/隐私页传 noindex 生成 noindex, nofollow。
 * - og:type：website（默认）/ product / article；og:image 自动拼 siteUrl。
 */
export interface SeoInput {
  title: string | (() => string)
  description: string | (() => string)
  path: string
  /** 页面关键词（逗号分隔）；Google 已忽略 keywords，但保留完整 TDK（跨境惯例）。空则不输出。 */
  keywords?: string | (() => string)
  /** Open Graph 类型：website（默认）/ product / article 等 */
  ogType?: 'website' | 'product' | 'article' | string
  /** OG/Twitter 分享图：绝对 URL 或以 / 开头的相对路径（自动拼 siteUrl）；可传函数以支持异步数据 */
  ogImage?: string | (() => string)
  /** 交易/隐私页 → noindex, nofollow；默认 index, follow */
  noindex?: boolean
}

export function useSeo(input: SeoInput) {
  const siteUrl = useRuntimeConfig().public.siteUrl as string
  const { localePath } = useLocale()
  const resolve = (v: string | (() => string)) => (typeof v === 'function' ? v() : v)

  const canonical = computed(() => `${siteUrl}${localePath(input.path)}`)
  const title = computed(() => resolve(input.title))
  const description = computed(() => resolve(input.description))
  const keywords = computed(() => resolve(input.keywords ?? ''))
  const ogImage = computed(() => {
    const img = resolve(input.ogImage ?? '')
    if (!img) return ''
    return img.startsWith('http') ? img : `${siteUrl}${img.startsWith('/') ? img : `/${img}`}`
  })

  const siteName = 'Aurora Hair Studio'
  const ogType = input.ogType ?? 'website'
  const robots = input.noindex ? 'noindex, nofollow' : 'index, follow'

  useHead({
    title: () => title.value,
    meta: [
      { name: 'description', content: description.value },
      ...(keywords.value ? [{ name: 'keywords', content: keywords.value }] : []),
      { name: 'robots', content: robots },
      { property: 'og:title', content: title.value },
      { property: 'og:description', content: description.value },
      { property: 'og:type', content: ogType },
      { property: 'og:url', content: canonical.value },
      { property: 'og:site_name', content: siteName },
      ...(ogImage.value ? [{ property: 'og:image', content: ogImage.value }] : []),
      { name: 'twitter:card', content: ogImage.value ? 'summary_large_image' : 'summary' },
      { name: 'twitter:title', content: title.value },
      { name: 'twitter:description', content: description.value },
      ...(ogImage.value ? [{ name: 'twitter:image', content: ogImage.value }] : []),
    ],
    link: [{ rel: 'canonical', href: canonical.value }],
  })

  return { canonical, title, description }
}
