import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockFindAll } = vi.hoisted(() => ({
  mockFindAll: vi.fn(),
}))

vi.mock('../models/Setting.js', () => ({
  default: {
    findAll: mockFindAll,
  },
}))

import { getSiteInfo, loadSiteInfo, refreshSiteInfo, injectSiteInfo } from '../utils/siteCache'

describe('siteCache', () => {
  beforeEach(() => {
    mockFindAll.mockReset()
  })

  describe('getSiteInfo', () => {
    it('返回默认缓存值', () => {
      const info = getSiteInfo()

      expect(info).toHaveProperty('title')
      expect(info).toHaveProperty('logo')
      expect(info).toHaveProperty('favicon')
      expect(info).toHaveProperty('description')
      expect(info).toHaveProperty('keywords')
    })

    it('返回的是缓存副本', () => {
      const info1 = getSiteInfo()
      const info2 = getSiteInfo()

      expect(info1).not.toBe(info2)
      expect(info1).toEqual(info2)
    })
  })

  describe('loadSiteInfo', () => {
    it('从数据库加载站点信息', async () => {
      mockFindAll.mockResolvedValueOnce([
        { optionKey: 'site_title', optionValue: 'My App' },
        { optionKey: 'site_logo', optionValue: '/logo.png' },
        { optionKey: 'site_favicon', optionValue: '/favicon.ico' },
      ])

      await loadSiteInfo()

      const info = getSiteInfo()
      expect(info.title).toBe('My App')
      expect(info.logo).toBe('/logo.png')
      expect(info.favicon).toBe('/favicon.ico')
    })

    it('数据库为空时保留默认值', async () => {
      mockFindAll.mockResolvedValueOnce([])

      const before = getSiteInfo()
      await loadSiteInfo()
      const after = getSiteInfo()

      expect(after.title).toBe(before.title)
    })

    it('加载失败时保留默认值', async () => {
      mockFindAll.mockRejectedValueOnce(new Error('DB error'))

      const before = getSiteInfo()
      await loadSiteInfo()
      const after = getSiteInfo()

      expect(after).toEqual(before)
    })
  })

  describe('refreshSiteInfo', () => {
    it('更新指定 key 的缓存值', async () => {
      mockFindAll.mockResolvedValueOnce([
        { optionKey: 'site_title', optionValue: 'Old Title' },
      ])
      await loadSiteInfo()

      refreshSiteInfo('site_title', 'New Title')

      const info = getSiteInfo()
      expect(info.title).toBe('New Title')
    })

    it('无效 key 不更新', async () => {
      await loadSiteInfo()
      const before = getSiteInfo()

      refreshSiteInfo('invalid_key', 'value')

      const after = getSiteInfo()
      expect(after).toEqual(before)
    })
  })

  describe('injectSiteInfo', () => {
    it('替换 HTML 中的占位符', async () => {
      mockFindAll.mockResolvedValueOnce([
        { optionKey: 'site_title', optionValue: 'My App' },
      ])
      await loadSiteInfo()

      const html = '<html><head><title><!--SITE_TITLE--></title></head><body></body></html>'
      const result = injectSiteInfo(html)

      expect(result).toContain('My App')
      expect(result).not.toContain('<!--SITE_TITLE-->')
    })

    it('favicon 为空时使用默认值', () => {
      const html = '<html><head><link rel="icon" href="<!--SITE_FAVICON-->"></head><body></body></html>'
      const result = injectSiteInfo(html)

      expect(result).toContain('/favicon.ico')
    })
  })
})