import type { NextFunction, Request, Response } from 'express'
import * as wishlistService from '../services/wishlistService.js'
import { getSite } from '../middleware/siteContext.js'

/**
 * Storefront 收藏夹接口（顾客 JWT）：
 * - GET    /wishlist                       我的收藏（分页；返回 productId 列表，商品详情由前端 catalog ids 批量取）
 * - GET    /wishlist/ids                   我的收藏 productId 集合（详情页心形图标状态用，轻量）
 * - POST   /wishlist                       收藏一个商品（幂等）
 * - DELETE /wishlist/:productId            取消收藏
 * - PATCH  /wishlist/:productId/notify     开关降价提醒
 * - DELETE /wishlist                       清空收藏
 */

export const list = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tenantId, customerId } = req.customer!
    const q = req.query as Record<string, unknown>
    const page = Number(q.page) > 0 ? Number(q.page) : 1
    const pageSize = Number(q.pageSize) > 0 ? Math.min(Number(q.pageSize), 60) : 20
    const notifyOnSale = q.notifyOnSale === 'true' ? true : q.notifyOnSale === 'false' ? false : undefined
    const data = await wishlistService.listWishlist(customerId, { page, pageSize, notifyOnSale })
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}

export const ids = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { customerId } = req.customer!
    const data = await wishlistService.listWishlist(customerId, { page: 1, pageSize: 60 })
    res.json({ code: 0, data: { productIds: data.items.map((i) => i.productId) } })
  } catch (err) {
    next(err)
  }
}

export const add = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tenantId, customerId } = req.customer!
    const site = getSite(res)
    const body = req.body as { productId: number; notifyOnSale?: boolean }
    const result = await wishlistService.addWishlist(customerId, body.productId, {
      notifyOnSale: body.notifyOnSale,
      siteId: site.shopId,
    })
    res.json({ code: 0, data: result })
  } catch (err) {
    next(err)
  }
}

export const remove = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { customerId } = req.customer!
    const productId = Number((req.params as Record<string, unknown>).productId)
    const data = await wishlistService.removeWishlist(customerId, productId)
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}

export const notify = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { customerId } = req.customer!
    const productId = Number((req.params as Record<string, unknown>).productId)
    const body = req.body as { notifyOnSale: boolean }
    const data = await wishlistService.setNotifyOnSale(customerId, productId, body.notifyOnSale)
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}

export const clear = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { customerId } = req.customer!
    const data = await wishlistService.clearWishlist(customerId)
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}
