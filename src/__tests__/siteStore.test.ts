/**
 * siteStore.ts 单元测试
 * 覆盖：站点信息管理、页面标题、DOM 更新
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useSiteStore, updateFavicon, updateMeta } from '../stores/siteStore'

describe('siteStore.ts', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  describe('初始状态', () => {
    it('siteTitle 默认为 Vue Admin', () => {
      const store = useSiteStore()
      expect(store.siteTitle).toBe('Vue Admin')
    })

    it('其他字段为空字符串', () => {
      const store = useSiteStore()
      expect(store.siteLogo).toBe('')
      expect(store.siteFavicon).toBe('')
      expect(store.siteDescription).toBe('')
      expect(store.siteKeywords).toBe('')
      expect(store.pageTitle).toBe('')
    })
  })

  describe('setPageTitle', () => {
    it('设置页面标题并更新 document.title', () => {
      const store = useSiteStore()
      store.setPageTitle('用户管理')

      expect(store.pageTitle).toBe('用户管理')
      expect(document.title).toBe('用户管理 - Vue Admin')
    })

    it('空标题时仅显示站点标题', () => {
      const store = useSiteStore()
      store.siteTitle = 'My App'
      store.setPageTitle('')

      expect(document.title).toBe('My App')
    })
  })

  describe('setSiteInfo', () => {
    it('设置站点标题', () => {
      const store = useSiteStore()
      store.setSiteInfo({ title: '新站点' })

      expect(store.siteTitle).toBe('新站点')
    })

    it('设置站点 Logo', () => {
      const store = useSiteStore()
      store.setSiteInfo({ logo: '/logo.png' })

      expect(store.siteLogo).toBe('/logo.png')
    })

    it('设置站点描述', () => {
      const store = useSiteStore()
      store.setSiteInfo({ description: '这是站点描述' })

      expect(store.siteDescription).toBe('这是站点描述')
    })

    it('设置站点关键词', () => {
      const store = useSiteStore()
      store.setSiteInfo({ keywords: 'Vue, Admin, TypeScript' })

      expect(store.siteKeywords).toBe('Vue, Admin, TypeScript')
    })

    it('部分更新不影响其他字段', () => {
      const store = useSiteStore()
      store.siteTitle = '原标题'
      store.siteLogo = '/old-logo.png'

      store.setSiteInfo({ title: '新标题' })

      expect(store.siteTitle).toBe('新标题')
      expect(store.siteLogo).toBe('/old-logo.png')
    })
  })

  describe('reset', () => {
    it('重置所有状态', () => {
      const store = useSiteStore()
      store.siteTitle = '测试站点'
      store.siteLogo = '/logo.png'
      store.siteFavicon = '/favicon.ico'
      store.siteDescription = '描述'
      store.siteKeywords = '关键词'
      store.pageTitle = '页面标题'

      store.reset()

      expect(store.siteTitle).toBe('Vue Admin')
      expect(store.siteLogo).toBe('')
      expect(store.siteFavicon).toBe('')
      expect(store.siteDescription).toBe('')
      expect(store.siteKeywords).toBe('')
      expect(store.pageTitle).toBe('')
    })
  })
})

describe('siteStore.ts - DOM 更新', () => {
  describe('updateFavicon', () => {
    it('创建 favicon link', () => {
      updateFavicon('/favicon.ico')

      const link = document.querySelector('link[rel="icon"]')
      expect(link).not.toBeNull()
    })
  })

  describe('updateMeta', () => {
    it('创建 meta 标签', () => {
      updateMeta('test-meta', 'test content')

      const meta = document.querySelector('meta[name="test-meta"]')
      expect(meta).not.toBeNull()
    })
  })
})
