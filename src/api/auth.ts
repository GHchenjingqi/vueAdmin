/**
 * 认证 API
 */
import request from '@/utils/request'
import type { User } from '@/types/api'

/** 登录参数 */
export interface LoginParams {
  username: string
  password: string
  captchaKey?: string
  captchaText?: string
  rememberMe?: boolean
}

/** 登录响应 */
export interface LoginResult {
  accessToken: string
  refreshToken: string
  user: User
  roles?: string[]
  permissions?: string[]
  passwordResetRequired?: boolean
}

/** 验证码响应 */
export interface CaptchaResult {
  enabled: boolean
  svg?: string
  key?: string
}

export const authApi = {
  /** 获取验证码 */
  captcha() {
    return request.get<CaptchaResult>('/auth/captcha', { params: { _t: Date.now() } })
  },

  /** 登录 */
  login(data: LoginParams) {
    return request.post<LoginResult>('/auth/login', data)
  },

  /** 刷新 Token */
  refresh() {
    return request.post<{ accessToken: string }>('/auth/token')
  },

  /** 登出 */
  logout() {
    return request.delete<null>('/auth/session')
  },

  /** 获取当前用户信息 */
  profile() {
    return request.get<User>('/auth/profile')
  },

  /** 修改密码 */
  changePassword(data: { oldPassword?: string; newPassword: string }) {
    return request.patch<null>('/auth/password', data)
  },

  /** 忘记密码 */
  forgotPassword(email: string) {
    return request.post<null>('/auth/password/forgot', { email })
  },

  /** 重置密码 */
  resetPassword(token: string, newPassword: string) {
    return request.post<null>('/auth/password/reset', { token, newPassword })
  },

  /** 获取 SSE 一次性连接票据 */
  sseTicket() {
    return request.post<{ ticket: string }>('/auth/sse-ticket')
  },
}
