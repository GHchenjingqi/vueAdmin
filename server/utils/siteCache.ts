import Setting from '../models/Setting.js'

const siteKeys = ['site_title', 'site_logo', 'site_favicon', 'site_description', 'site_keywords']

const cache = {
  title: 'Vue Admin',
  logo: '',
  favicon: '',
  description: '基于 Vue 3 + Element Plus 的全栈后台管理系统',
  keywords: 'Vue, Admin, Element Plus, 后台管理',
}

let loaded = false

export function getSiteInfo() {
  return { ...cache }
}

export async function loadSiteInfo() {
  try {
    const settings = await Setting.findAll({ where: { optionKey: siteKeys } }) as unknown as Array<{ optionKey: string; optionValue: string }>
    const map: Record<string, string> = {}
    settings.forEach((s) => {
      map[s.optionKey] = s.optionValue
    })
    if (map.site_title) cache.title = map.site_title
    if (map.site_logo) cache.logo = map.site_logo
    if (map.site_favicon) cache.favicon = map.site_favicon
    if (map.site_description) cache.description = map.site_description
    if (map.site_keywords) cache.keywords = map.site_keywords
    loaded = true
  } catch {
    // 加载失败使用默认值
  }
}

export function refreshSiteInfo(key, value) {
  const map = {
    site_title: 'title',
    site_logo: 'logo',
    site_favicon: 'favicon',
    site_description: 'description',
    site_keywords: 'keywords',
  }
  const cacheKey = map[key]
  if (cacheKey) {
    cache[cacheKey] = value
  }
}

export function injectSiteInfo(html) {
  return html
    .replace('<!--SITE_TITLE-->', cache.title)
    .replace('<!--SITE_DESCRIPTION-->', cache.description)
    .replace('<!--SITE_KEYWORDS-->', cache.keywords)
    .replace('<!--SITE_FAVICON-->', cache.favicon || '/favicon.ico')
}