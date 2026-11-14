import type { NextFunction, Request, Response } from 'express'
import { AppError } from '../../../middleware/errorHandler.js'
import type { LoginInput, RegisterInput } from '../../../shared/schemas/customer.js'
import * as customerService from '../../shop/services/customerService.js'
import * as cartService from '../services/cartService.js'
import * as membershipService from '../../shop/services/membershipService.js'
import { getSite } from '../middleware/siteContext.js'
import { CUSTOMER_COOKIE } from '../middleware/customerAuth.js'

/**
 * 下发顾客会话 Cookie（PLAN 5.2）
 *
 * httpOnly 让 JS 读不到 token（XSS 无法直接窃取）；SameSite=Lax 允许顶级导航携带，
 * 同时挡掉跨站 POST 的自动携带（CSRF 基本面）。
 * 生产必须 Secure（HTTPS）；开发环境若强制 Secure，浏览器在 http 下会丢弃该 Cookie，
 * 因此按 NODE_ENV 决定，而不是无条件 true。
 */
function setCustomerCookie(res: Response, token: string): void {
  res.cookie(CUSTOMER_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: '/',
  })
}

/** 清除会话 Cookie（注销/登出） */
function clearCustomerCookie(res: Response): void {
  res.clearCookie(CUSTOMER_COOKIE, { path: '/' })
}

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
    // 注册即登录：同样下发 httpOnly Cookie，避免前端各处再自行存 token
    setCustomerCookie(res, result.token)
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
      // 登录失败限流的 IP 维度（req.socket 在部分非标准适配器下可能缺失）
      ip: (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket?.remoteAddress || '',
    })
    // P3-T03：登录后合并游客购物车（前端在后续请求用返回的 cartToken 替换本地购物车 cookie）
    const merged = await cartService.mergeCartOnLogin(site, result.customer.id, body.cartToken)
    // 会员分级维度三：登录频率（异常隔离，不阻断登录）
    void membershipService.recordLogin(site.tenantId, result.customer.id)
    setCustomerCookie(res, result.token)
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

/**
 * DELETE /auth/me —— 注销账号（PLAN 5.3）
 *
 * 要求提供当前密码：会话被劫持时不能仅凭 JWT 就毁号。
 * 实现为「匿名化 + 停用」而非物理删除：订单/退款/积分流水是财务凭证需保留，
 * 但邮箱、昵称、地址、收藏、浏览历史等直接标识会被清除。
 * 前端收到成功后必须清除本地 token。
 */
export const deleteAccount = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.customer) throw new AppError(401, '未认证')
    const body = (req.body ?? {}) as { password?: string }
    const password = typeof body.password === 'string' ? body.password : ''
    if (!password) throw new AppError(400, '请提供密码以确认注销')

    // 复用登录校验：密码错误与"账号不存在"返回同一提示，避免探测
    const ok = await customerService.verifyCustomerPassword(req.customer.tenantId, req.customer.customerId, password)
    if (!ok) throw new AppError(401, '密码不正确')

    const { deleteAccount: doDelete } = await import('../services/customerDataService.js')
    const data = await doDelete(req.customer.customerId)
    clearCustomerCookie(res)
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}

/**
 * GET /auth/me/export —— 导出本人数据（PLAN 5.3，GDPR 可携带权）
 * 返回结构化 JSON，仅含该顾客本人数据。
 */
export const exportMyData = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.customer) throw new AppError(401, '未认证')
    const { exportCustomerData } = await import('../services/customerDataService.js')
    const data = await exportCustomerData(req.customer.customerId)
    // 个人数据不落 CDN/浏览器缓存
    res.set('Cache-Control', 'private, no-store')
    res.set('Content-Disposition', `attachment; filename="my-data-${req.customer.customerId}.json"`)
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}
