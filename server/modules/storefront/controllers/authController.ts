import type { NextFunction, Request, Response } from 'express'
import { AppError } from '../../../middleware/errorHandler.js'
import type { LoginInput, RegisterInput } from '../../../shared/schemas/customer.js'
import * as customerService from '../../shop/services/customerService.js'
import * as cartService from '../services/cartService.js'
import { getSite } from '../middleware/siteContext.js'

/**
 * C 端顾客注册。tenantId 取自站点上下文（storefront 公开接口，
 * 未带 X-Site-Id 时回退默认租户 1），顾客归属到站点对应租户。
 */
export const register = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const site = getSite(res)
    const body = req.body as RegisterInput
    const result = await customerService.registerCustomer({
      tenantId: site.tenantId,
      email: body.email,
      password: body.password,
      nickname: body.nickname,
    })
    res.json({ code: 0, data: result })
  } catch (err) {
    next(err)
  }
}

/** C 端顾客登录，返回顾客信息与 JWT；若请求携带游客购物车令牌则合并到顾客购物车。 */
export const login = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const site = getSite(res)
    const body = req.body as LoginInput
    const result = await customerService.authenticateCustomer({
      tenantId: site.tenantId,
      email: body.email,
      password: body.password,
    })
    // P3-T03：登录后合并游客购物车（前端在后续请求用返回的 cartToken 替换本地购物车 cookie）
    const merged = await cartService.mergeCartOnLogin(site, result.customer.id, body.cartToken)
    res.json({ code: 0, data: { ...result, cartToken: merged.token } })
  } catch (err) {
    next(err)
  }
}

/** 当前登录顾客信息（需 customerAuth 中间件）。 */
export const me = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.customer) throw new AppError(401, '未认证')
    const customer = await customerService.getCustomerById(req.customer.tenantId, req.customer.customerId)
    res.json({ code: 0, data: { customer } })
  } catch (err) {
    next(err)
  }
}
