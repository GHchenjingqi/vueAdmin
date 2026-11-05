import { describe, it, expect, beforeAll } from 'vitest'
import { runInTenant } from '../modules/tenant/context.js'
import { ShopArticle } from '../modules/shop/models/index.js'
import * as cmsService from '../modules/storefront/services/cmsService.js'
import type { StorefrontSite } from '../modules/storefront/middleware/siteContext.js'

const TID = 71
let SITE: StorefrontSite

beforeAll(async () => {
  await runInTenant({ tenantId: TID }, async () => {
    // 清理 + 建站点上下文
    await ShopArticle.destroy({ where: { tenantId: TID } })
  })
  SITE = {
    tenantId: TID,
    channelId: null,
    shopId: 711,
    defaultCurrency: 'USD',
    defaultLocale: 'en-US',
  }
})

describe('storefront CMS 内容管理', () => {
  it('createArticle 写入并自动置 publishedAt', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const r = await cmsService.createArticle(SITE, {
        title: '如何选择假发',
        slug: 'how-to-choose-wig',
        content: '<p>正文…</p>',
        summary: '摘要',
        tags: ['guide', 'wig'],
        status: 'published',
      })
      expect(r.id).toBeGreaterThan(0)
      const row = await ShopArticle.findOne({ where: { id: r.id, tenantId: TID } })
      expect(row!.status).toBe('published')
      expect(row!.publishedAt).not.toBeNull()
    })
  })

  it('列表仅返回 published，草稿不可见；分页与排序生效', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      await cmsService.createArticle(SITE, {
        title: '草稿不应出现',
        slug: 'draft-hidden',
        content: 'x',
        status: 'draft',
      })
      await cmsService.createArticle(SITE, {
        title: '第二篇',
        slug: 'second',
        content: 'x',
        status: 'published',
        sortOrder: 5,
      })

      const list = await cmsService.listArticles(SITE, { page: 1, pageSize: 10 })
      expect(list.total).toBe(2) // 两篇 published
      expect(list.items.every((a) => a.slug !== 'draft-hidden')).toBe(true)
      // sortOrder 大的「第二篇」应排在最前
      expect(list.items[0].slug).toBe('second')
    })
  })

  it('keyword / tag 过滤', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const byKw = await cmsService.listArticles(SITE, { keyword: '假发' })
      expect(byKw.items.some((a) => a.slug === 'how-to-choose-wig')).toBe(true)

      const byTag = await cmsService.listArticles(SITE, { tag: 'guide' })
      expect(byTag.items.some((a) => a.slug === 'how-to-choose-wig')).toBe(true)
      expect(byTag.items.every((a) => a.tags?.includes('guide'))).toBe(true)
    })
  })

  it('getArticleBySlug 仅返回 published；未发布/不存在 → 404', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const ok = await cmsService.getArticleBySlug(SITE, 'how-to-choose-wig')
      expect(ok.title).toBe('如何选择假发')
      expect(ok.content).toContain('正文')

      await expect(cmsService.getArticleBySlug(SITE, 'draft-hidden')).rejects.toMatchObject({ statusCode: 404 })
      await expect(cmsService.getArticleBySlug(SITE, 'nope')).rejects.toMatchObject({ statusCode: 404 })
    })
  })

  it('不同站点的文章相互不可见（siteId 隔离）', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const otherSite: StorefrontSite = { ...SITE, shopId: 999 }
      const list = await cmsService.listArticles(otherSite, {})
      expect(list.items.every((a) => a.slug !== 'how-to-choose-wig')).toBe(true)
      await expect(cmsService.getArticleBySlug(otherSite, 'how-to-choose-wig')).rejects.toMatchObject({
        statusCode: 404,
      })
    })
  })
})
