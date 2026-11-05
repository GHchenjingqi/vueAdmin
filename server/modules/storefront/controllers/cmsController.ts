import type { NextFunction, Request, Response } from 'express'
import { getSite } from '../middleware/siteContext.js'
import * as cmsService from '../services/cmsService.js'

/** GET /cms/articles —— 公开文章列表（仅 published，分页 + tag/keyword 过滤） */
export const listArticles = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const site = getSite(res)
    const q = req.query as Record<string, unknown>
    const data = await cmsService.listArticles(site, {
      page: q.page != null ? Number(q.page) : undefined,
      pageSize: q.pageSize != null ? Number(q.pageSize) : undefined,
      tag: typeof q.tag === 'string' ? q.tag : undefined,
      keyword: typeof q.keyword === 'string' ? q.keyword : undefined,
    })
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}

/** GET /cms/articles/:slug —— 文章详情（仅 published；不存在/未发布 404） */
export const getArticle = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const site = getSite(res)
    const slug = (req.params as Record<string, unknown>).slug as string
    const data = await cmsService.getArticleBySlug(site, slug)
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}
