import type { NextFunction, Request, Response } from 'express'
import { AppError } from '../../../middleware/errorHandler.js'
import { verifyCustomerToken } from '../../shop/services/customerService.js'

/** 经顾客 JWT 认证后注入请求的身份信息 */
export interface CustomerAuthInfo {
  customerId: number
  tenantId: number
  email: string
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      customer?: CustomerAuthInfo
    }
  }
}

/**
 * 顾客 JWT 认证中间件（storefront 专用）
 *
 * 使用与 admin 不同的 secret 签发/校验，payload.type 必须为 'customer'，
 * 即使拿到 admin 令牌也无法通过（secret 不同 + type 校验双重隔离）。
 * 失败时以 AppError(401) 交给全局错误处理器统一返回。
 */
export function customerAuth(req: Request, _res: Response, next: NextFunction): void {
  const auth = req.headers.authorization
  if (!auth || !auth.startsWith('Bearer ')) {
    next(new AppError(401, '未提供认证令牌'))
    return
  }

  try {
    const payload = verifyCustomerToken(auth.split(' ')[1])
    req.customer = {
      customerId: payload.sub,
      tenantId: payload.tenantId,
      email: payload.email,
    }
    next()
  } catch (err) {
    next(err)
  }
}

/**
 * 可选顾客身份：有 Bearer 令牌则解析注入 req.customer，无/无效令牌静默放行（游客）。
 * 用于 quote/build 等游客与登录顾客共用的接口（会员折扣/积分抵扣按登录态可选启用）。
 */
export function optionalCustomerAuth(req: Request, _res: Response, next: NextFunction): void {
  const auth = req.headers.authorization
  if (!auth || !auth.startsWith('Bearer ')) {
    next()
    return
  }
  try {
    const payload = verifyCustomerToken(auth.split(' ')[1])
    req.customer = {
      customerId: payload.sub,
      tenantId: payload.tenantId,
      email: payload.email,
    }
  } catch {
    // 无效令牌按游客处理（不阻断）
  }
  next()
}
