/**
 * 认证鉴权 Controller
 *
 * 职责：仅做 HTTP 请求/响应编排，业务逻辑委托给 authService
 */
import type { Request, Response, NextFunction } from 'express'
import * as authService from '../services/authService.js'

/**
 * 生成 SSE 一次性 ticket
 * POST /api/auth/sse-ticket
 */
export const createSseTicket = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await authService.createSseTicket(req.user!.id, req.user!.username, req.user!.nickname || '')
    res.json({ code: 0, data: result })
  } catch (err) {
    next(err)
  }
}

/**
 * 消费 SSE ticket（供 sseManager 使用）
 */
export const consumeSseTicket = authService.consumeSseTicket

/**
 * 获取验证码
 * GET /api/auth/captcha
 */
export const captcha = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await authService.getCaptcha()
    res.json({ code: 0, data: result })
  } catch (err) {
    next(err)
  }
}

/**
 * 用户登录
 * POST /api/auth/login
 */
export const login = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { username, password, captchaKey, captchaText, rememberMe } = req.body
    const result = await authService.login(
      username,
      password,
      req.ip,
      req,
      { key: captchaKey, text: captchaText },
      rememberMe,
    )

    const { _refreshToken, _rtExpires, ...responseData } = result as any

    // 设置 httpOnly Cookie
    res.cookie('refreshToken', _refreshToken, authService.getRefreshCookieConfig(_rtExpires))

    res.json({
      code: 0,
      data: responseData,
      message: '登录成功',
    })
  } catch (err) {
    next(err)
  }
}

/**
 * 刷新 Access Token
 * POST /api/auth/refresh
 */
export const refresh = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = req.cookies?.refreshToken
    const result = await authService.refresh(token)

    if (result.newRefreshToken && result.rtExpires) {
      res.cookie('refreshToken', result.newRefreshToken, authService.getRefreshCookieConfig(result.rtExpires))
    }

    res.json({
      code: 0,
      data: {
        accessToken: result.accessToken,
        passwordResetRequired: result.passwordResetRequired,
      },
    })
  } catch (err) {
    next(err)
  }
}

/**
 * 退出登录
 * POST /api/auth/logout
 */
export const logout = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = req.cookies?.refreshToken
    await authService.logout(token)
    res.clearCookie('refreshToken', { path: '/api' })
    res.json({ code: 0, message: '已退出登录' })
  } catch (err) {
    next(err)
  }
}

/**
 * 获取当前用户个人信息
 * GET /api/auth/profile
 */
export const profile = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await authService.getProfile(req.user!.id)
    res.json({ code: 0, data: user })
  } catch (err) {
    next(err)
  }
}

/**
 * 修改密码（含强制修改）
 * POST /api/auth/change-password
 */
export const changePassword = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { oldPassword, newPassword } = req.body
    await authService.changePassword(req.user!.id, oldPassword, newPassword)
    res.json({ code: 0, message: '密码修改成功' })
  } catch (err) {
    next(err)
  }
}

/**
 * 发送密码重置邮件
 * POST /api/auth/forgot-password
 */
export const forgotPassword = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email } = req.body
    const baseUrl = `${req.protocol}://${req.get('host')}`
    await authService.forgotPassword(email, baseUrl)
    res.json({ code: 0, message: '如果该邮箱已注册，重置邮件已发送' })
  } catch (err) {
    next(err)
  }
}

/**
 * 使用重置令牌重置密码
 * POST /api/auth/reset-password
 */
export const resetPassword = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token, newPassword } = req.body
    await authService.resetPassword(token, newPassword)
    res.json({ code: 0, message: '密码重置成功，请使用新密码登录' })
  } catch (err) {
    next(err)
  }
}