import type { NextFunction, Request, Response } from 'express'
import * as bannerService from '../../storefront/services/bannerService.js'
import type { StorefrontSite } from '../../storefront/middleware/siteContext.js'
import { getTenantContext } from '../../tenant/context.js'
import type { BannerAdminListQuery } from '../../../shared/schemas/bannerAdmin.js'

/**
 * 首页 Banner 后台 CRUD 控制器
 *
 * 站点解析对齐 articleAdminController：siteId 缺省为 0（默认站点）。
 */
function siteOf(req: Request): StorefrontSite {
  const raw = Number(req.query.siteId)
  const shopId = Number.isInteger(raw) && raw >= 0 ? raw : 0
  return {
    tenantId: getTenantContext()?.tenantId ?? 1,
    channelId: null,
    shopId,
    defaultCurrency: 'USD',
    defaultLocale: 'en-US',
  }
}

/** GET /shop/banners —— 后台列表（含未启用） */
export const list = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = req.query as unknown as BannerAdminListQuery
    res.json({ code: 0, data: await bannerService.listAllBanners(siteOf(req), { position: q.position }) })
  } catch (err) {
    next(err)
  }
}

/** POST /shop/banners —— 新建 */
export const create = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = req.body as bannerService.BannerCreateInput
    res.json({ code: 0, data: await bannerService.createBanner(siteOf(req), body) })
  } catch (err) {
    next(err)
  }
}

/** PUT /shop/banners/:id —— 编辑 */
export const update = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = Number((req.params as Record<string, unknown>).id)
    const body = req.body as bannerService.BannerUpdateInput
    res.json({ code: 0, data: await bannerService.updateBanner(siteOf(req), id, body) })
  } catch (err) {
    next(err)
  }
}

/** DELETE /shop/banners/:id —— 删除 */
export const remove = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = Number((req.params as Record<string, unknown>).id)
    res.json({ code: 0, data: await bannerService.deleteBanner(siteOf(req), id) })
  } catch (err) {
    next(err)
  }
}
