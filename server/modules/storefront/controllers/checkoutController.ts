import type { NextFunction, Request, Response } from 'express'
import { AppError } from '../../../middleware/errorHandler.js'
import { getSite } from '../middleware/siteContext.js'
import * as checkoutService from '../services/checkoutService.js'
import * as quoteService from '../services/quoteService.js'
import type { CreateOrderInput, QuoteInput } from '../../../shared/schemas/storefront.js'

export const quote = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const site = getSite(res)
    const body = req.body as QuoteInput
    const data = await quoteService.createQuote(site, {
      cartToken: body.cartToken,
      items: body.items as { skuId: number; qty: number }[] | undefined,
      shippingAddress: body.shippingAddress,
      couponCode: body.couponCode,
    })
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}

export const createOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const site = getSite(res)
    const body = req.body as CreateOrderInput
    // 登录态下以顾客身份归属（未被显式传入时）
    const customerId = body.customerId ?? req.customer?.customerId
    const data = await checkoutService.createOrder(site, {
      idempotencyKey: body.idempotencyKey,
      email: body.email,
      shippingAddress: body.shippingAddress,
      note: body.note,
      cartToken: body.cartToken,
      items: body.items as { skuId: number; qty: number }[] | undefined,
      customerId,
      couponCode: body.couponCode,
      attribution: body.attribution,
    })
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}

export const getOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const accessToken = typeof req.query.accessToken === 'string' ? req.query.accessToken : undefined
    if (!accessToken) throw new AppError(401, '缺少访问凭证')
    const data = await checkoutService.getOrderWithToken(Number(req.params.id), accessToken)
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}

/** P4-T03 GET /orders —— 当前顾客订单列表（归属来自顾客 JWT，站点租户一致性校验） */
export const listMyOrders = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const c = req.customer
    if (!c) throw new AppError(401, '请先登录')
    const site = getSite(res)
    if (c.tenantId !== site.tenantId) throw new AppError(401, 'ORDERS_SITE_MISMATCH: 顾客令牌与站点不匹配')
    const page = Number((req.query as Record<string, unknown>).page ?? 1) || 1
    const pageSize = Number((req.query as Record<string, unknown>).pageSize ?? 10) || 10
    const data = await checkoutService.listMyOrders({ tenantId: c.tenantId, customerId: c.customerId }, page, pageSize)
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}
