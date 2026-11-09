// @vitest-environment node
/**
 * 目录多语言透传 + CMS 详情缓存键实证
 *
 * 缺陷一（catalog 多语言隔离）：
 *   catalogController.categories / products 都会读取 ?lang=，但 productDetail 只把
 *   site.defaultLocale 传给 getProductBySlug。而生成式 slug 由 localized(name, lang)
 *   生成：中文标题落到 `${id}-product`，英文落到 `${id}-body-wave-wig`。
 *   于是中文列表给出的链接在详情侧按站点默认语言解析 → 404，即便能打开也返回英文。
 *
 * 缺陷二（CMS 缓存键）：
 *   getArticle 用 baseUrlOf(req) 生成 structuredData 绝对 URL（随 Host / X-Forwarded-Proto
 *   变化），但 articleDetailEtag 的因子只含 tenantId/siteId/revision/slug/updatedAt，
 *   不含 baseUrl，也没有 Vary 头。不同域名返回不同内容却共用同一 ETag，
 *   If-None-Match 会 304 命中并复用另一域名的内容。
 *
 * 专属租户 987707，避免与既有 storefront / cms 用例共用数据。
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import type { Request, Response } from 'express'
import { runInTenant } from '../modules/tenant/context.js'
import { ShopArticle, ShopSpu } from '../modules/shop/models/index.js'
import * as catalogService from '../modules/storefront/services/catalogService.js'
import * as catalogController from '../modules/storefront/controllers/catalogController.js'
import * as cmsService from '../modules/storefront/services/cmsService.js'
import * as cmsController from '../modules/storefront/controllers/cmsController.js'
import * as cmsCache from '../modules/storefront/services/cmsCacheService.js'
import type { StorefrontSite } from '../modules/storefront/middleware/siteContext.js'

const TID = 987707
const uniq = (): string => `clc${Date.now()}${Math.floor(Math.random() * 1e6)}`
const inTenant = <T>(fn: () => Promise<T>): Promise<T> => runInTenant({ tenantId: TID }, fn)

const SITE: StorefrontSite = {
  tenantId: TID,
  channelId: null,
  shopId: 7071,
  defaultCurrency: 'USD',
  defaultLocale: 'en-US',
}

function mockReqRes(opts: { query?: Record<string, unknown>; params?: Record<string, string>; headers?: Record<string, string> } = {}) {
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

function headerOf(raw: { set: ReturnType<typeof vi.fn> }, name: string): string | null {
  const hit = raw.set.mock.calls.find((c: unknown[]) => c[0] === name)
  return hit ? (hit[1] as string) : null
}

let articleSlug = ''

beforeAll(async () => {
  await inTenant(async () => {
    await ShopSpu.destroy({ where: { tenantId: TID } })
    await ShopArticle.destroy({ where: { tenantId: TID } })
    await ShopSpu.create({
      tenantId: TID,
      categoryId: 0,
      brandId: null,
      name: { 'en-US': 'Body Wave Wig', 'zh-CN': '波浪假发' },
      description: { 'en-US': 'English description', 'zh-CN': '中文商品描述' },
      slug: null,
      status: 'listed',
    } as never)
    articleSlug = 'clc-article-' + uniq()
    await cmsService.createArticle(SITE, {
      title: 'Cache key article',
      slug: articleSlug,
      content: '<p>body</p>',
      summary: 'sum',
      status: 'published',
    })
  })
})

afterAll(async () => {
  await inTenant(async () => {
    await ShopSpu.destroy({ where: { tenantId: TID } })
    await ShopArticle.destroy({ where: { tenantId: TID } })
  })
  cmsCache.resetArticleCacheForTests()
})

describe('catalog 多语言透传（catalogController.productDetail）', () => {
  it('中文列表生成式 slug 打开详情应返回中文，且不传 lang 时兼容站点默认语言', async () => {
    await inTenant(async () => {
      const zhList = await catalogService.listProducts({ lang: 'zh-CN' }, { currency: 'USD', lang: 'en-US' })
      const enList = await catalogService.listProducts({ lang: 'en-US' }, { currency: 'USD', lang: 'en-US' })

      const call = async (query: Record<string, unknown>, slug: string) => {
        const { req, res, raw, next } = mockReqRes({ query, params: { slug } })
        await catalogController.productDetail(req, res, next)
        const body = raw.json.mock.calls[0]?.[0] as { data?: Record<string, unknown> } | undefined
        return {
          nextCalls: next.mock.calls.length,
          errorStatus: (next.mock.calls[0]?.[0] as { statusCode?: number } | undefined)?.statusCode ?? null,
          jsonCalls: raw.json.mock.calls.length,
          title: (body?.data?.title as string | undefined) ?? null,
          seoTitle: (body?.data?.seo as { title?: string } | undefined)?.title ?? null,
        }
      }

      const zhCall = await call({ lang: 'zh-CN' }, zhList.list[0].slug)
      const enCall = await call({}, enList.list[0].slug)

      expect({
        titleZh: zhList.list[0].title,
        titleEn: enList.list[0].title,
        slugDiffers: zhList.list[0].slug !== enList.list[0].slug,
        zhSlug: zhList.list[0].slug,
        enSlug: enList.list[0].slug,
        zhCall,
        enCall,
      }).toEqual({
        titleZh: '波浪假发',
        titleEn: 'Body Wave Wig',
        slugDiffers: true,
        zhSlug: expect.stringMatching(/-product$/),
        enSlug: expect.stringMatching(/-body-wave-wig$/),
        zhCall: { nextCalls: 0, errorStatus: null, jsonCalls: 1, title: '波浪假发', seoTitle: '波浪假发' },
        enCall: { nextCalls: 0, errorStatus: null, jsonCalls: 1, title: 'Body Wave Wig', seoTitle: 'Body Wave Wig' },
      })
    })
  })
})

describe('CMS 详情缓存键（cmsController.getArticle）', () => {
  it('不同 Host 的详情 ETag 必须不同；跨域名 If-None-Match 不得 304', async () => {
    await inTenant(async () => {
      const a = mockReqRes({ params: { slug: articleSlug }, headers: { host: 'a.example' } })
      await cmsController.getArticle(a.req, a.res, a.next)
      const b = mockReqRes({ params: { slug: articleSlug }, headers: { host: 'b.example' } })
      await cmsController.getArticle(b.req, b.res, b.next)
      const etagA = headerOf(a.raw, 'ETag')
      const etagB = headerOf(b.raw, 'ETag')
      const urlA = (a.raw.json.mock.calls[0]?.[0] as { data?: { structuredData?: { url?: string } } } | undefined)?.data?.structuredData?.url
      const urlB = (b.raw.json.mock.calls[0]?.[0] as { data?: { structuredData?: { url?: string } } } | undefined)?.data?.structuredData?.url

      // 拿 A 域名的 ETag 去请求 B 域名：修复前会 304 命中并复用 A 的结构化数据
      const cross = mockReqRes({
        params: { slug: articleSlug },
        headers: { host: 'b.example', 'if-none-match': etagA ?? '' },
      })
      await cmsController.getArticle(cross.req, cross.res, cross.next)

      expect({
        urlA,
        urlB,
        urlDiffers: urlA !== urlB,
        etagSame: etagA === etagB,
        varyA: headerOf(a.raw, 'Vary'),
        crossNotModified: cross.raw.status.mock.calls.some((c: unknown[]) => c[0] === 304),
        crossBodyReturned: cross.raw.json.mock.calls.length,
      }).toEqual({
        urlA: `http://a.example/blog/${articleSlug}`,
        urlB: `http://b.example/blog/${articleSlug}`,
        urlDiffers: true,
        etagSame: false,
        varyA: 'Host, X-Forwarded-Proto',
        crossNotModified: false,
        crossBodyReturned: 1,
      })
    })
  })

  it('阴性对照：同 Host 的 ETag 仍稳定且 304 正常；列表 ETag 不随 Host 变化', async () => {
    await inTenant(async () => {
      const first = mockReqRes({ params: { slug: articleSlug }, headers: { host: 'same.example' } })
      await cmsController.getArticle(first.req, first.res, first.next)
      const etag = headerOf(first.raw, 'ETag')
      const hit = mockReqRes({
        params: { slug: articleSlug },
        headers: { host: 'same.example', 'if-none-match': etag ?? '' },
      })
      await cmsController.getArticle(hit.req, hit.res, hit.next)
      expect(etag).toMatch(/^"article-/)
      expect(hit.raw.status.mock.calls.some((c: unknown[]) => c[0] === 304)).toBe(true)
      expect(hit.raw.json).not.toHaveBeenCalled()

      const listA = mockReqRes({ headers: { host: 'a.example' } })
      await cmsController.listArticles(listA.req, listA.res, listA.next)
      const listB = mockReqRes({ headers: { host: 'b.example' } })
      await cmsController.listArticles(listB.req, listB.res, listB.next)
      expect(headerOf(listA.raw, 'ETag')).toBe(headerOf(listB.raw, 'ETag'))
    })
  })
})
