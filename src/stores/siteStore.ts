/**
 * Site Store - 站点信息管理
 *
 * 职责：
 * - 站点标题、Logo、Favicon、SEO 信息
 * - 页面标题管理
 * - DOM 元素（favicon、meta）自动更新
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useSiteStore = defineStore('site', () => {
  // ==================== State ====================

  /** 站点标题 */
  const siteTitle = ref('Vue Admin')

  /** 站点 Logo */
  const siteLogo = ref('')

  /** 站点 Favicon */
  const siteFavicon = ref('')

  /** 站点描述 */
  const siteDescription = ref('')

  /** 站点关键词 */
  const siteKeywords = ref('')

  /** 当前页面标题 */
  const pageTitle = ref('')

  // ==================== Actions ====================

  /** 设置页面标题 */
  function setPageTitle(title: string): void {
    pageTitle.value = title
    document.title = title ? `${title} - ${siteTitle.value}` : siteTitle.value
  }

  /** 设置站点信息 */
  function setSiteInfo(info: { title?: string; logo?: string; favicon?: string; description?: string; keywords?: string }): void {
    if (info.title) {
      siteTitle.value = info.title
      document.title = pageTitle.value ? `${pageTitle.value} - ${info.title}` : info.title
    }
    if (info.logo) siteLogo.value = info.logo
    if (info.favicon) {
      siteFavicon.value = info.favicon
      updateFavicon(info.favicon)
    }
    if (info.description) {
      siteDescription.value = info.description
      updateMeta('description', info.description)
    }
    if (info.keywords) {
      siteKeywords.value = info.keywords
      updateMeta('keywords', info.keywords)
    }
  }

  /** 重置站点信息 */
  function reset(): void {
    siteTitle.value = 'Vue Admin'
    siteLogo.value = ''
    siteFavicon.value = ''
    siteDescription.value = ''
    siteKeywords.value = ''
    pageTitle.value = ''
  }

  return {
    // State
    siteTitle,
    siteLogo,
    siteFavicon,
    siteDescription,
    siteKeywords,
    pageTitle,
    // Actions
    setPageTitle,
    setSiteInfo,
    reset,
  }
})

/** 更新 Favicon（纯函数，不依赖 Store 响应式） */
export function updateFavicon(url: string): void {
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
  if (!link) {
    link = document.createElement('link')
    link.setAttribute('rel', 'icon')
    document.head.appendChild(link)
  }
  link.setAttribute('href', url)
}

/** 更新 Meta 标签 */
export function updateMeta(name: string, content: string): void {
  let meta = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)
  if (!meta) {
    meta = document.createElement('meta')
    meta.setAttribute('name', name)
    document.head.appendChild(meta)
  }
  meta.setAttribute('content', content)
}
