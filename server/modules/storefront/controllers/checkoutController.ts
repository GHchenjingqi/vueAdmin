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
      // 会员折扣/积分抵扣：登录态顾客身份 + 抵扣请求（服务端钳制）
      customerId: req.customer?.customerId,
      pointsToRedeem: body.pointsToRedeem,
      // 配送档位：决定在分区基础运费上叠加哪一档加价
      shippingRateId: body.shippingRateId,
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
    /**
     * 订单归属一律以认证身份为准，**忽略请求体传入的 customerId**。
     *
     * 安全整改：原实现为 `body.customerId ?? req.customer?.customerId`，
     * 请求体优先且无任何校验。POST /checkout/orders 挂 optionalCustomerAuth
     * （游客可调），故任意调用方可指定他人 customerId 建单，导致：
     *  - 冒用他人身份：套用他人会员折扣、消耗他人积分抵扣（服务端按该 customerId
     *    钳制余额并在 captured 时扣减），订单归属他人（buyer.customerId）；
     *  - 积分发放/返佣记到他人名下。
     * 其余 storefront 控制器（地址/购物车/会员/返佣/评价/RMA）均以
     * req.customer.customerId 为唯一来源，此处此前属遗漏。
     */
    const customerId = req.customer?.customerId
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
      pointsToRedeem: body.pointsToRedeem,
      shippingRateId: body.shippingRateId,
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
