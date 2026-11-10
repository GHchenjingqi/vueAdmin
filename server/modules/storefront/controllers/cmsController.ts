import type { NextFunction, Request, Response } from 'express'
import { getSite } from '../middleware/siteContext.js'
import * as cmsService from '../services/cmsService.js'
import * as bannerService from '../services/bannerService.js'
import { articleDetailEtag, articleListEtag, etagMatches } from '../services/cmsCacheService.js'

const CACHE_CONTROL = 'public, max-age=30, stale-while-revalidate=30'
const VARY = 'Host, X-Forwarded-Proto'

/** 结构化数据里的绝对 URL：来自当前请求 Host（可被反代 X-Forwarded-Proto 覆盖），无法推导时用相对路径 */
function baseUrlOf(req: Request): string {
  const host = req.headers.host
  if (typeof host !== 'string' || host.trim() === '') return ''
  const forwarded = req.headers['x-forwarded-proto']
  const proto = (typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : req.protocol) || 'https'
  return `${proto}://${host}`
}

function setCacheHeaders(res: Response, etag: string): void {
  res.set('ETag', etag)
  res.set('Cache-Control', CACHE_CONTROL)
  res.set('Vary', VARY)
}

/** 304 同样要带 Vary，否则中间缓存可能把另一 Host / 协议的响应复用给本次请求 */
function setNotModified(res: Response, etag: string): void {
  res.set('ETag', etag)
  res.set('Vary', VARY)
  res.status(304).end()
}

/** GET /cms/articles —— 公开文章列表（仅 published，分页 + tag/keyword 过滤） */
export const listArticles = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const site = getSite(res)
    const q = req.query as Record<string, unknown>
    const page = Number(q.page) > 0 ? Number(q.page) : 1
    const pageSize = Math.min(Number(q.pageSize) > 0 ? Number(q.pageSize) : 10, 60)
    const tag = typeof q.tag === 'string' ? q.tag : undefined
    const keyword = typeof q.keyword === 'string' ? q.keyword : undefined
    const etag = articleListEtag(site.tenantId, site.shopId ?? 0, { page, pageSize, tag, keyword })

    // 站点级 revision 覆盖任意文章写操作：ETag 命中说明发布/下线后没有任何变更，可直接 304
    if (etagMatches(req.headers['if-none-match'], etag)) {
      setNotModified(res, etag)
      return
    }

    const data = await cmsService.listArticles(site, { page, pageSize, tag, keyword })
    setCacheHeaders(res, etag)
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}

/** GET /cms/articles/:slug —— 文章详情（仅 published；不存在/未发布 404，且 404 优先于 304） */
export const getArticle = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const site = getSite(res)
    const slug = (req.params as Record<string, unknown>).slug as string
    // structuredData 的绝对 URL 随 Host / X-Forwarded-Proto 变化，必须同时进入 ETag 因子
    const baseUrl = baseUrlOf(req)
    // 必须先查库：文章下线后即使客户端持有旧 ETag，也必须返回 404 而不是 304
    const data = await cmsService.getArticleBySlug(site, slug, baseUrl)
    const etag = articleDetailEtag(site.tenantId, site.shopId ?? 0, slug, data.updatedAt, baseUrl)
    if (etagMatches(req.headers['if-none-match'], etag)) {
      setNotModified(res, etag)
      return
    }
    setCacheHeaders(res, etag)
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}

/** GET /cms/banners?position=hero|secondary —— 公开首页 Banner（仅启用 + 时段内，按 sortOrder） */
export const listBanners = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const site = getSite(res)
    const q = req.query as Record<string, unknown>
    const position = q.position === 'hero' || q.position === 'secondary' ? q.position : undefined
    const data = await bannerService.listBanners(site, { position })
    setCacheHeaders(res, `W/"banners-${site.tenantId}-${site.shopId ?? 0}-${position ?? 'all'}"`)
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}
