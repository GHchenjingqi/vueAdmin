// @vitest-environment node
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import type { Request, Response } from 'express'
import { runInTenant } from '../modules/tenant/context.js'
import { ShopArticle, AuditLog } from '../modules/shop/models/index.js'
import * as auditLogService from '../modules/shop/services/auditLogService.js'
import * as cmsService from '../modules/storefront/services/cmsService.js'
import * as cmsCache from '../modules/storefront/services/cmsCacheService.js'
import * as cmsController from '../modules/storefront/controllers/cmsController.js'
import type { StorefrontSite } from '../modules/storefront/middleware/siteContext.js'

const TID = 83
const SITE: StorefrontSite = {
  tenantId: TID,
  channelId: null,
  shopId: 831,
  defaultCurrency: 'USD',
  defaultLocale: 'en-US',
}
const slug = (s: string): string => `p5t06-${s}`

async function make(status: 'draft' | 'published', s: string) {
  return runInTenant({ tenantId: TID }, () =>
    cmsService.createArticle(SITE, {
      title: `T ${s}`,
      slug: slug(s),
      content: '<p>body</p>',
      summary: 'sum',
      authorName: 'Editor',
      tags: ['guide'],
      status,
    }),
  )
}

function mockReqRes(
  opts: {
    query?: Record<string, unknown>
    params?: Record<string, string>
    headers?: Record<string, string>
  } = {},
) {
  const res = {
    locals: { site: SITE },
    set: vi.fn(),
    status: vi.fn().mockReturnThis(),
    end: vi.fn(),
    json: vi.fn(),
  }
  const req = {
    query: opts.query ?? {},
    params: opts.params ?? {},
    headers: opts.headers ?? {},
    protocol: 'http',
  } as unknown as Request
  const next = vi.fn()
  return { req, res: res as unknown as Response, raw: res, next }
}

function etagOf(res: { set: ReturnType<typeof vi.fn> }): string {
  return res.set.mock.calls.find((c: unknown[]) => c[0] === 'ETag')?.[1] as string
}

beforeAll(async () => {
  await runInTenant({ tenantId: TID }, async () => {
    await ShopArticle.destroy({ where: { tenantId: TID } })
    await AuditLog.destroy({ where: { tenantId: TID, entityType: 'article' } })
  })
})

afterAll(async () => {
  await runInTenant({ tenantId: TID }, async () => {
    await ShopArticle.destroy({ where: { tenantId: TID } })
    await AuditLog.destroy({ where: { tenantId: TID, entityType: 'article' } })
  })
  cmsCache.resetArticleCacheForTests()
})

beforeEach(() => {
  cmsCache.resetArticleCacheForTests()
})

describe('P5-T06 CMS 后台发布 / 缓存失效 / 结构化数据', () => {
  it('draft 不可见 → publish 可见 → unpublish 下线；重复发布幂等且写审计', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const { id } = await make('draft', 'flow')
      await expect(cmsService.getArticleBySlug(SITE, slug('flow'))).rejects.toMatchObject({ statusCode: 404 })
      expect((await cmsService.listArticles(SITE, {})).items.some((a) => a.slug === slug('flow'))).toBe(false)

      expect((await cmsService.publishArticle(SITE, id)).changed).toBe(true)
      expect((await cmsService.publishArticle(SITE, id)).changed).toBe(false)
      expect((await cmsService.getArticleBySlug(SITE, slug('flow'))).title).toBe('T flow')

      expect((await cmsService.unpublishArticle(SITE, id)).changed).toBe(true)
      expect((await cmsService.unpublishArticle(SITE, id)).changed).toBe(false)
      await expect(cmsService.getArticleBySlug(SITE, slug('flow'))).rejects.toMatchObject({ statusCode: 404 })

      const actions = (await auditLogService.listByEntity({ entityType: 'article', entityId: id })).map((r) => r.action)
      expect(actions).toContain('article.published')
      expect(actions).toContain('article.unpublished')
    })
  })

  it('同站点 slug 唯一（create/update 均 409），不同站点可复用同一 slug', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      await make('published', 'uniq')
      await expect(make('draft', 'uniq')).rejects.toMatchObject({ statusCode: 409 })

      const second = await make('draft', 'uniq2')
      await expect(cmsService.updateArticle(SITE, second.id, { slug: slug('uniq') })).rejects.toMatchObject({
        statusCode: 409,
      })

      const other: StorefrontSite = { ...SITE, shopId: 832 }
      const r = await cmsService.createArticle(other, {
        title: 'other',
        slug: slug('uniq'),
        content: 'x',
        status: 'draft',
      })
      await expect(cmsService.getArticleBySlug(other, slug('uniq'))).rejects.toMatchObject({ statusCode: 404 })
      await cmsService.publishArticle(other, r.id)
      expect((await cmsService.getArticleBySlug(other, slug('uniq'))).title).toBe('other')
    })
  })

  it('写操作逐次触发失效事件、递增 revision 并改变列表 ETag；失效器异常不阻断发布', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const spy = vi.fn()
      cmsCache.registerArticleCacheInvalidator(spy)
      const rev0 = cmsCache.getArticleRevision(TID, 831)
      const etag0 = cmsCache.articleListEtag(TID, 831, {})

      const { id } = await make('draft', 'cache')
      expect(cmsCache.articleListEtag(TID, 831, {})).not.toBe(etag0)
      await cmsService.updateArticle(SITE, id, { title: 'updated' })
      await cmsService.publishArticle(SITE, id)
      await cmsService.unpublishArticle(SITE, id)

      expect(spy.mock.calls.map((c) => c[0].action)).toEqual(['created', 'updated', 'published', 'unpublished'])
      expect(spy.mock.calls[0][0]).toMatchObject({ tenantId: TID, siteId: 831, slug: slug('cache') })
      expect(cmsCache.getArticleRevision(TID, 831)).toBe(rev0 + 4)

      cmsCache.registerArticleCacheInvalidator(() => {
        throw new Error('CDN down')
      })
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
      const r = await make('published', 'cache2')
      expect(r.id).toBeGreaterThan(0)
      expect(cmsCache.getArticleRevision(TID, 831)).toBe(rev0 + 5)
      warn.mockRestore()
    })
  })

  it('公开详情产出 BlogPosting 结构化数据（绝对 URL 规范化）', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      await make('published', 'jsonld')
      const d = await cmsService.getArticleBySlug(SITE, slug('jsonld'), 'https://shop.example/')
      expect(d.structuredData).toMatchObject({
        '@context': 'https://schema.org',
        '@type': 'BlogPosting',
        headline: 'T jsonld',
        url: `https://shop.example/blog/${slug('jsonld')}`,
      })
      expect(d.structuredData.description).toBe('sum')
      expect(d.structuredData.author).toEqual({ '@type': 'Person', name: 'Editor' })
      expect(d.structuredData.datePublished).toBeTruthy()
      expect(d.updatedAt).toBeInstanceOf(Date)
    })
  })

  it('后台列表含草稿，可按 status 过滤', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      await make('draft', 'adminlist')
      const all = await cmsService.listAllArticles(SITE, {})
      expect(all.rows.some((r) => r.slug === slug('adminlist'))).toBe(true)
      const drafts = await cmsService.listAllArticles(SITE, { status: 'draft' })
      expect(drafts.rows.every((r) => r.status === 'draft')).toBe(true)
      expect(drafts.rows.some((r) => r.slug === slug('adminlist'))).toBe(true)
      const pub = await cmsService.listAllArticles(SITE, { status: 'published' })
      expect(pub.rows.every((r) => r.status === 'published')).toBe(true)
    })
  })

  it('列表 ETag 命中返回 304；发布后旧 ETag 立即失效重新 200', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const first = mockReqRes({})
      await cmsController.listArticles(first.req, first.res, first.next)
      const etag = etagOf(first.raw)
      expect(etag).toMatch(/^"articles-/)
      expect(first.raw.set.mock.calls.some((c: unknown[]) => c[0] === 'Cache-Control')).toBe(true)

      const cached = mockReqRes({ headers: { 'if-none-match': etag } })
      await cmsController.listArticles(cached.req, cached.res, cached.next)
      expect(cached.raw.status).toHaveBeenCalledWith(304)
      expect(cached.raw.json).not.toHaveBeenCalled()

      await make('published', 'etag')
      const after = mockReqRes({ headers: { 'if-none-match': etag } })
      await cmsController.listArticles(after.req, after.res, after.next)
      expect(after.raw.status).not.toHaveBeenCalled()
      expect(after.raw.json).toHaveBeenCalled()
      expect(etagOf(after.raw)).not.toBe(etag)
    })
  })

  it('详情 304 正常命中；下线后旧 ETag 仍返回 404（404 优先于 304）', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const { id } = await make('published', 'down')
      const ok = mockReqRes({ params: { slug: slug('down') }, headers: { host: 'shop.example' } })
      await cmsController.getArticle(ok.req, ok.res, ok.next)
      const etag = etagOf(ok.raw)
      expect(etag).toMatch(/^"article-/)
      const detail = ok.raw.json.mock.calls[0][0].data
      expect(detail.structuredData.url).toBe(`http://shop.example/blog/${slug('down')}`)

      const hit = mockReqRes({ params: { slug: slug('down') }, headers: { host: 'shop.example', 'if-none-match': etag } })
      await cmsController.getArticle(hit.req, hit.res, hit.next)
      expect(hit.raw.status).toHaveBeenCalledWith(304)
      expect(hit.raw.json).not.toHaveBeenCalled()

      await cmsService.unpublishArticle(SITE, id)
      const stale = mockReqRes({
        params: { slug: slug('down') },
        headers: { host: 'shop.example', 'if-none-match': etag },
      })
      await cmsController.getArticle(stale.req, stale.res, stale.next)
      expect(stale.raw.status).not.toHaveBeenCalled()
      expect(stale.next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }))
    })
  })
})
