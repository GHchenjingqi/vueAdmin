import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { runInTenant } from '../modules/tenant/context.js'
import { ShopArticle } from '../modules/shop/models/index.js'
import * as cmsService from '../modules/storefront/services/cmsService.js'
import { faqListEtag, faqDetailEtag } from '../modules/storefront/services/cmsCacheService.js'
import type { StorefrontSite } from '../modules/storefront/middleware/siteContext.js'

const TID = 77
let SITE: StorefrontSite

beforeAll(async () => {
  await runInTenant({ tenantId: TID }, async () => {
    await ShopArticle.destroy({ where: { tenantId: TID } })
  })
  SITE = { tenantId: TID, channelId: null, shopId: 771, defaultCurrency: 'USD', defaultLocale: 'en-US' }
})

afterAll(async () => {
  await runInTenant({ tenantId: TID }, async () => {
    await ShopArticle.destroy({ where: { tenantId: TID } })
  })
})

describe('storefront FAQ（复用 shop_articles 表 tags 含 faq）', () => {
  it('listFaqs 仅返回含 faq 标记 + published；普通文章不可见', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      await cmsService.createArticle(SITE, {
        title: 'How long does shipping take?',
        slug: 'faq-shipping-time',
        content: '<p>5-7 business days.</p>',
        summary: '5-7 days',
        tags: ['faq', 'shipping'],
        status: 'published',
        sortOrder: 1,
      })
      await cmsService.createArticle(SITE, {
        title: 'Blog post not faq',
        slug: 'blog-regular',
        content: '<p>x</p>',
        tags: ['guide'],
        status: 'published',
      })
      await cmsService.createArticle(SITE, {
        title: 'Draft faq hidden',
        slug: 'faq-draft',
        content: '<p>x</p>',
        tags: ['faq'],
        status: 'draft',
      })
      const { items, categories } = await cmsService.listFaqs(SITE)
      expect(items).toHaveLength(1)
      expect(items[0].question).toBe('How long does shipping take?')
      expect(items[0].category).toBe('shipping')
      expect(items[0].shortAnswer).toBe('5-7 days')
      expect(categories).toEqual(['shipping'])
    })
  })

  it('listFaqs category 过滤与 sortOrder 升序', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      await cmsService.createArticle(SITE, {
        title: 'Returns policy',
        slug: 'faq-returns',
        content: '<p>30 days.</p>',
        tags: ['faq', 'returns'],
        status: 'published',
        sortOrder: 2,
      })
      await cmsService.createArticle(SITE, {
        title: 'Sizing guide',
        slug: 'faq-sizing',
        content: '<p>Measure.</p>',
        tags: ['faq', 'sizing'],
        status: 'published',
        sortOrder: 3,
      })
      const all = await cmsService.listFaqs(SITE)
      expect(all.items.map((i) => i.category)).toEqual(['shipping', 'returns', 'sizing'])

      const shipping = await cmsService.listFaqs(SITE, { category: 'shipping' })
      expect(shipping.items).toHaveLength(1)
      expect(shipping.items[0].slug).toBe('faq-shipping-time')
    })
  })

  it('listFaqs keyword 模糊匹配 question', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const r = await cmsService.listFaqs(SITE, { keyword: 'Returns' })
      expect(r.items).toHaveLength(1)
      expect(r.items[0].slug).toBe('faq-returns')
    })
  })

  it('getFaqBySlug 返回含 answer/category；slug 不存在或非 faq → 404', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const item = await cmsService.getFaqBySlug(SITE, 'faq-shipping-time')
      expect(item.answer).toContain('5-7')
      expect(item.category).toBe('shipping')

      await expect(cmsService.getFaqBySlug(SITE, 'no-such-slug')).rejects.toThrow(/404|不存在/)

      // 普通文章（tags 无 faq）即使 published 也返回 404
      await expect(cmsService.getFaqBySlug(SITE, 'blog-regular')).rejects.toThrow(/404|不存在/)
    })
  })

  it('FAQ 列表 ETag 因子：revision + category + keyword', async () => {
    const base = faqListEtag(TID, SITE.shopId ?? 0)
    const diffCat = faqListEtag(TID, SITE.shopId ?? 0, { category: 'shipping' })
    const diffKw = faqListEtag(TID, SITE.shopId ?? 0, { keyword: 'shipping' })
    expect(base).not.toBe(diffCat)
    expect(base).not.toBe(diffKw)
  })

  it('FAQ 详情 ETag 因子：slug + updatedAt', async () => {
    const a = faqDetailEtag(TID, SITE.shopId ?? 0, 'faq-shipping-time', new Date('2026-01-01T00:00:00Z'))
    const b = faqDetailEtag(TID, SITE.shopId ?? 0, 'faq-shipping-time', new Date('2026-02-01T00:00:00Z'))
    const c = faqDetailEtag(TID, SITE.shopId ?? 0, 'faq-returns', new Date('2026-01-01T00:00:00Z'))
    expect(a).not.toBe(b)
    expect(a).not.toBe(c)
  })
})
