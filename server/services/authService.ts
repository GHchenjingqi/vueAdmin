/**
 * 认证鉴权 Service 层
 *
 * 职责：封装认证相关的所有业务逻辑，Controller 仅做请求/响应编排
 *
 * 设计原则：
 * - 所有 public 方法均为 async，返回结构化数据（不直接操作 res）
 * - 异常通过 AppError 抛出，由全局 errorHandler 统一转换
 */
import jwt from 'jsonwebtoken'
import sequelize from '../config/database.js'
import { Op } from 'sequelize'
import User from '../models/User.js'
import RefreshToken from '../models/RefreshToken.js'
import Role from '../models/Role.js'
import RoleMenu from '../models/RoleMenu.js'
import UserRole from '../models/UserRole.js'
import Menu from '../models/Menu.js'
import Setting from '../models/Setting.js'
import config from '../config/index.js'
import { AppError } from '../middleware/errorHandler.js'
import { checkForgotRateLimit, createResetToken, consumeResetToken } from '../utils/resetToken.js'
import { logLogin, logLoginFailure } from '../utils/logger.js'
import { generate, verify } from '../utils/captcha.js'
import { checkRateLimit, recordAttempt, clearAttempts } from '../middleware/rateLimiter.js'
import { clearKickRecord, isUserKicked } from '../utils/onlineUsers.js'
import crypto from 'crypto'

// ==================== 常量 ====================

const ACCESS_TOKEN_EXPIRES = '15m'
const REFRESH_TOKEN_EXPIRES_REMEMBER = 7 * 24 * 60 * 60 * 1000 // 7 天
const REFRESH_TOKEN_EXPIRES_SESSION = 24 * 60 * 60 * 1000 // 1 天
const MAX_LOGIN_ATTEMPTS = 5
const LOCKOUT_DURATION = 30 * 60 * 1000 // 30 分钟
const REFRESH_GRACE_PERIOD = 30 * 1000 // 多标签页刷新宽限期 30 秒

// ==================== SSE Ticket 管理 ====================

interface SseTicketRecord {
  userId: number
  username: string
  nickname: string
  expiresAt: number
}

/** SSE 一次性 ticket 存储（ticket -> { userId, expiresAt }） */
const sseTickets = new Map<string, SseTicketRecord>()

// 定期清理过期 ticket（每 30 秒）
setInterval(() => {
  const now = Date.now()
  for (const [ticket, record] of sseTickets) {
    if (now >= record.expiresAt) {
      sseTickets.delete(ticket)
    }
  }
}, 30 * 1000)

/**
 * 生成 SSE 一次性 ticket（30 秒有效，一次使用）
 */
export async function createSseTicket(userId: number, username: string, nickname: string): Promise<{ ticket: string }> {
  const ticket = crypto.randomBytes(24).toString('hex')
  sseTickets.set(ticket, {
    userId,
    username,
    nickname,
    expiresAt: Date.now() + 30 * 1000,
  })
  return { ticket }
}

/**
 * 消费 SSE ticket，返回关联的用户信息
 */
export function consumeSseTicket(ticket: string): SseTicketRecord | null {
  const record = sseTickets.get(ticket)
  if (!record) return null
  sseTickets.delete(ticket) // 一次性使用，立即删除
  if (Date.now() >= record.expiresAt) return null
  return record
}

// ==================== 密码校验 ====================

/**
 * 校验密码复杂度
 * @returns 错误信息字符串，通过则返回 null
 */
export function validatePasswordStrength(password: string): string | null {
  if (!password || password.length < 8) {
    return '密码长度不能少于8位'
  }
  if (!/[A-Z]/.test(password)) {
    return '密码必须包含至少一个大写字母'
  }
  if (!/[a-z]/.test(password)) {
    return '密码必须包含至少一个小写字母'
  }
  if (!/[0-9]/.test(password)) {
    return '密码必须包含至少一个数字'
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    return '密码必须包含至少一个特殊字符'
  }
  return null
}

// ==================== 验证码 ====================

interface CaptchaResult {
  enabled: boolean
  svg?: string
  key?: string
}

/**
 * 获取验证码配置
 */
export async function getCaptcha(): Promise<CaptchaResult> {
  const captchaSetting = await Setting.findOne({ where: { optionKey: 'captcha_enabled' } })
  const enabled = captchaSetting ? captchaSetting.optionValue === '1' : false

  if (enabled) {
    const result = generate()
    return { ...result, enabled: true }
  }
  return { enabled: false }
}

// ==================== Token 工具 ====================

interface TokenPayload {
  id: number
  username: string
  nickname: string
}

function signAccessToken(payload: TokenPayload): string {
  return jwt.sign(payload, config.jwt.secret, { expiresIn: ACCESS_TOKEN_EXPIRES })
}

interface LoginResult {
  accessToken: string
  passwordResetRequired: boolean
  user: {
    id: number
    username: string
    nickname: string
    email: string
    avatar: string
  }
}

// ==================== 登录 ====================

/**
 * 聚合用户角色编码与按钮级权限标识
 * - roles: 角色 code 列表（含 admin / 普通角色）
 * - permissions: 用户所属角色关联的 F 类型菜单的 permission 标识
 */
async function getUserRolesAndPermissions(userId: number): Promise<{ roles: string[]; permissions: string[] }> {
  // 通过 user_roles 关联表取用户角色（避免 Role↔User 关联别名问题）
  const userRoles = await UserRole.findAll({ where: { userId }, attributes: ['roleId'] })
  const roleIds = [...new Set(userRoles.map((ur) => ur.roleId))]
  if (roleIds.length === 0) return { roles: [], permissions: [] }

  const roles = await Role.findAll({ where: { id: { [Op.in]: roleIds } }, attributes: ['code'] })
  const roleCodes = roles.map((r) => (r as unknown as { code: string }).code).filter(Boolean)

  const roleMenus = await RoleMenu.findAll({ where: { roleId: { [Op.in]: roleIds } }, attributes: ['menuId'] })
  const menuIds = [...new Set(roleMenus.map((rm) => rm.menuId))]
  if (menuIds.length === 0) return { roles: roleCodes, permissions: [] }

  const menus = await Menu.findAll({ where: { id: { [Op.in]: menuIds } }, attributes: ['type', 'permission'] })
  const permissions = menus
    .filter((m) => m.type === 'F' && m.permission)
    .map((m) => m.permission as string)

  return { roles: roleCodes, permissions: [...new Set(permissions)] }
}

/**
 * 用户登录
 */
export async function login(
  username: string,
  password: string,
  ip: string,
  req: { headers: Record<string, string | undefined>; ip: string },
  captchaInput?: { key?: string; text?: string },
  rememberMe?: boolean,
): Promise<LoginResult> {
  if (!username || !password) {
    throw new AppError(400, '用户名和密码不能为空')
  }

  // 验证码检查
  const captchaSetting = await Setting.findOne({ where: { optionKey: 'captcha_enabled' } })
  if (captchaSetting && captchaSetting.optionValue === '1') {
    if (!captchaInput?.key || !captchaInput?.text) {
      throw new AppError(400, '请输入验证码')
    }
    if (!verify(captchaInput.key, captchaInput.text)) {
      throw new AppError(400, '验证码错误或已过期')
    }
  }

  // 登录频率限制（基于 IP + 用户名）
  const limit = await checkRateLimit(ip, username)
  if (!limit.allowed) {
    throw new AppError(429, `登录尝试过于频繁，请 ${limit.retryAfter} 秒后再试`)
  }

  // 统一错误响应，不暴露用户是否存在
  const genericAuthError = '用户名或密码错误'
  const user = await User.findOne({ where: { username } })

  if (!user) {
    await recordAttempt(ip, username)
    logLoginFailure(username, '用户不存在', req)
    throw new AppError(401, genericAuthError)
  }

  // 检查账号是否被锁定
  if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
    const remaining = Math.ceil((new Date(user.lockedUntil) - new Date()) / 1000)
    throw new AppError(423, `账号已被锁定，请 ${remaining} 秒后再试`)
  }

  // 验证密码
  const isPasswordValid = await user.verifyPassword(password)
  if (!isPasswordValid) {
    await recordAttempt(ip, username)

    const [affected] = await User.update(
      { loginAttempts: sequelize.literal('loginAttempts + 1') },
      { where: { id: user.id } },
    )

    if (affected > 0) {
      const updated = await User.findByPk(user.id, { attributes: ['loginAttempts'] })
      if (updated && updated.loginAttempts >= MAX_LOGIN_ATTEMPTS) {
        await User.update(
          { lockedUntil: new Date(Date.now() + LOCKOUT_DURATION), loginAttempts: 0 },
          { where: { id: user.id } },
        )
        logLoginFailure(username, '密码错误次数过多，账号已锁定', req)
        throw new AppError(423, `密码错误次数过多，账号已锁定 ${LOCKOUT_DURATION / 60000} 分钟`)
      }
    }

    logLoginFailure(username, '密码错误', req)
    throw new AppError(401, genericAuthError)
  }

  // 检查用户状态
  if (user.status !== 1) {
    logLoginFailure(username, '账号已被禁用', req)
    throw new AppError(403, '账号已被禁用')
  }

  // 登录成功，重置失败计数和速率限制
  await User.update({ loginAttempts: 0, lockedUntil: null }, { where: { id: user.id } })
  await clearAttempts(ip, username)
  clearKickRecord(user.id)

  // 清理旧 refresh token
  await RefreshToken.destroy({ where: { userId: user.id } })

  // 生成 Access Token
  const accessToken = signAccessToken({
    id: user.id,
    username: user.username,
    nickname: user.nickname,
  })

  // 生成 Refresh Token
  const rtExpires = rememberMe ? REFRESH_TOKEN_EXPIRES_REMEMBER : REFRESH_TOKEN_EXPIRES_SESSION
  const refreshTokenValue = RefreshToken.generateToken()
  await RefreshToken.create({
    userId: user.id,
    token: refreshTokenValue,
    expiresAt: new Date(Date.now() + rtExpires),
    rememberMe: rememberMe ? 1 : 0,
  })

  logLogin(user, req)

  const { roles, permissions } = await getUserRolesAndPermissions(user.id)

  return {
    accessToken,
    passwordResetRequired: !!user.passwordResetRequired,
    roles,
    permissions,
    user: {
      id: user.id,
      username: user.username,
      nickname: user.nickname,
      email: user.email || '',
      avatar: user.avatar || '',
    },
    _refreshToken: refreshTokenValue,
    _rtExpires: rtExpires,
  } as LoginResult & { _refreshToken: string; _rtExpires: number }
}

/**
 * 获取 Refresh Token 的 Cookie 配置
 */
export function getRefreshCookieConfig(rtExpires: number) {
  return {
    httpOnly: true,
    sameSite: 'strict' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/api',
    maxAge: rtExpires,
  }
}

// ==================== Token 刷新 ====================

interface RefreshResult {
  accessToken: string
  passwordResetRequired: boolean
  newRefreshToken?: string
  rtExpires?: number
}

/**
 * 刷新 Access Token
 */
export async function refresh(token: string): Promise<RefreshResult> {
  if (!token) {
    throw new AppError(401, '未找到 Refresh Token')
  }

  const record = await RefreshToken.findOne({ where: { token, purpose: 'auth' } })

  if (!record || new Date(record.expiresAt) <= new Date()) {
    if (record) {
      await record.update({ revoked: 1, revokedAt: new Date() })
    }
    throw new AppError(401, 'Refresh Token 无效或已过期')
  }

  // 如果 token 已被撤销，检查是否在宽限期内（多标签页兼容）
  if (record.revoked) {
    const now = new Date()
    if (record.revokedAt && (now.getTime() - new Date(record.revokedAt).getTime()) < REFRESH_GRACE_PERIOD) {
      const latestValid = await RefreshToken.findOne({
        where: { userId: record.userId, revoked: 0, purpose: 'auth' },
        order: [['id', 'DESC']],
      })
      if (latestValid) {
        const user = await User.findByPk(record.userId, {
          attributes: ['id', 'username', 'nickname', 'status', 'passwordResetRequired'],
        })
        if (user && user.status === 1) {
          return {
            accessToken: signAccessToken({
              id: user.id,
              username: user.username,
              nickname: user.nickname,
            }),
            passwordResetRequired: !!user.passwordResetRequired,
          }
        }
      }
    }
    throw new AppError(401, 'Refresh Token 已过期，请重新登录')
  }

  const user = await User.findByPk(record.userId, {
    attributes: ['id', 'username', 'nickname', 'status', 'passwordResetRequired'],
  })

  if (!user || user.status !== 1) {
    await record.update({ revoked: 1, revokedAt: new Date() })
    throw new AppError(401, '用户不存在或已被禁用')
  }

  // 检查是否已被管理员强制下线
  if (isUserKicked(user.id, Math.floor(new Date(record.createdAt).getTime() / 1000))) {
    await record.update({ revoked: 1, revokedAt: new Date() })
    await RefreshToken.destroy({ where: { userId: user.id } })
    throw new AppError(401, '您的账号已被管理员强制下线，请重新登录')
  }

  // 撤销旧 Refresh Token
  await record.update({ revoked: 1, revokedAt: new Date() })

  // 签发新 Token
  const accessToken = signAccessToken({
    id: user.id,
    username: user.username,
    nickname: user.nickname,
  })

  const rtExpires = record.rememberMe ? REFRESH_TOKEN_EXPIRES_REMEMBER : REFRESH_TOKEN_EXPIRES_SESSION
  const newRefreshToken = RefreshToken.generateToken()
  await RefreshToken.create({
    userId: user.id,
    token: newRefreshToken,
    expiresAt: new Date(Date.now() + rtExpires),
    rememberMe: record.rememberMe,
  })

  return {
    accessToken,
    passwordResetRequired: !!user.passwordResetRequired,
    newRefreshToken,
    rtExpires,
  }
}

// ==================== 登出 ====================

/**
 * 退出登录
 */
export async function logout(refreshToken: string | undefined): Promise<void> {
  if (refreshToken) {
    await RefreshToken.update({ revoked: 1, revokedAt: new Date() }, { where: { token: refreshToken } })
  }
}

// ==================== 个人信息 ====================

/**
 * 获取当前用户个人信息
 */
export async function getProfile(userId: number) {
  const user = await User.findByPk(userId, {
    attributes: [
      'id', 'username', 'nickname', 'email', 'phone', 'avatar',
      'bio', 'status', 'deptId', 'passwordResetRequired', 'createdAt', 'updatedAt',
    ],
  })
  if (!user) {
    throw new AppError(404, '用户不存在')
  }
  return user
}

// ==================== 修改密码 ====================

/**
 * 修改密码（含强制修改）
 */
export async function changePassword(userId: number, oldPassword: string | undefined, newPassword: string): Promise<void> {
  const strengthError = validatePasswordStrength(newPassword)
  if (strengthError) {
    throw new AppError(400, strengthError)
  }

  const user = await User.findByPk(userId)
  if (!user) {
    throw new AppError(404, '用户不存在')
  }

  // 强制改密场景免验原密码
  if (!user.passwordResetRequired) {
    if (!oldPassword) {
      throw new AppError(400, '原密码不能为空')
    }
    const valid = await user.verifyPassword(oldPassword)
    if (!valid) {
      throw new AppError(400, '原密码不正确')
    }
  }

  user.password = newPassword
  user.passwordResetRequired = 0
  await user.save()
}

// ==================== 忘记密码 ====================
// 邮箱限流与一次性 Token 由 server/utils/resetToken.ts 统一处理（Redis 优先，DB 回退）

/**
 * 发送密码重置邮件
 */
export async function forgotPassword(email: string, baseUrl: string): Promise<void> {
  if (!email) {
    throw new AppError(400, '请输入邮箱地址')
  }

  // 邮箱限流：5 分钟内同一邮箱只允许发一次（防枚举 + 防刷）
  const allowed = await checkForgotRateLimit(email)
  if (!allowed) {
    return // 不抛异常，防止枚举邮箱
  }

  const user = await User.findOne({ where: { email } })
  if (!user) {
    return // 不抛异常，防止枚举邮箱
  }

  const resetToken = await createResetToken(user.id)

  // 尝试发送邮件（失败不阻塞）
  try {
    const { default: transporter } = await import('../utils/mailer.js')
    if (transporter) {
      await transporter.sendMail({
        to: email,
        subject: '密码重置',
        html: `<p>请点击以下链接重置密码（15分钟内有效）：</p>
             <p><a href="${baseUrl}/reset-password?token=${resetToken}">重置密码</a></p>
             <p>如果不是您本人操作，请忽略此邮件。</p>`,
      })
    }
  } catch {
    console.warn('密码重置邮件发送失败:', email)
  }
}

// ==================== 重置密码 ====================

/**
 * 使用重置令牌重置密码
 */
export async function resetPassword(token: string, newPassword: string): Promise<void> {
  if (!token || !newPassword) {
    throw new AppError(400, '参数不完整')
  }

  const strengthError = validatePasswordStrength(newPassword)
  if (strengthError) {
    throw new AppError(400, strengthError)
  }

  // 一次性消费：成功返回 userId 并立即失效；失败/已用/过期返回 null
  const userId = await consumeResetToken(token)
  if (userId == null) {
    throw new AppError(400, '重置链接已失效或已被使用')
  }

  const user = await User.findByPk(userId)
  if (!user) {
    throw new AppError(404, '用户不存在')
  }

  user.password = newPassword
  user.passwordResetRequired = 1
  await user.save()
}