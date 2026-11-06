import type { NextFunction, Request, Response } from 'express'
import * as cmsService from '../../storefront/services/cmsService.js'
import type { StorefrontSite } from '../../storefront/middleware/siteContext.js'
import { getTenantContext } from '../../tenant/context.js'
import type { ArticleAdminListQuery } from '../../../shared/schemas/cmsAdmin.js'

/**
 * CMS 后台写入控制器（P5-T06）
 *
 * 复用 storefront 的 cmsService 与 shop_articles 模型，不建第二套数据/服务。
 * 站点由 query.siteId 指定；缺省为 0（默认站点），与公开侧 site.shopId ?? 0 对齐。
 * 状态变更只能用 publish/unpublish 端点，更新接口不接受 status（避免绕过缓存失效）。
 */
function siteOf(req: Request): StorefrontSite {
  const raw = Number(req.query.siteId)
  const shopId = Number.isInteger(raw) && raw > 0 ? raw : 0
  return {
    tenantId: getTenantContext()?.tenantId ?? 1,
    channelId: null,
    shopId,
    defaultCurrency: 'USD',
    defaultLocale: 'en-US',
  }
}

/** GET /shop/articles —— 后台列表（含草稿，status 过滤 + 分页） */
export const list = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = req.query as unknown as ArticleAdminListQuery
    res.json({ code: 0, data: await cmsService.listAllArticles(siteOf(req), q) })
  } catch (err) {
    next(err)
  }
}

/** POST /shop/articles —— 新建（默认 draft；可直接 published，二者均触发缓存失效） */
export const create = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // zod 已校验必填；tsconfig strict:false 下 z.infer 会把字段全标可选，故断言为 service 输入类型
    const body = req.body as cmsService.ArticleCreateInput
    res.json({ code: 0, data: await cmsService.createArticle(siteOf(req), body) })
  } catch (err) {
    next(err)
  }
}

/** PUT /shop/articles/:id —— 编辑内容（slug 冲突 → 409） */
export const update = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = req.body as cmsService.ArticleUpdateInput
    res.json({ code: 0, data: await cmsService.updateArticle(siteOf(req), Number(req.params.id), body) })
  } catch (err) {
    next(err)
  }
}

/** POST /shop/articles/:id/publish —— 发布（幂等，已发布不重复触发失效） */
export const publish = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ code: 0, data: await cmsService.publishArticle(siteOf(req), Number(req.params.id)) })
  } catch (err) {
    next(err)
  }
}

/** POST /shop/articles/:id/unpublish —— 下线（幂等，公开侧随即 404） */
export const unpublish = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ code: 0, data: await cmsService.unpublishArticle(siteOf(req), Number(req.params.id)) })
  } catch (err) {
    next(err)
  }
}
