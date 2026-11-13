import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import config from '../../../config/index.js'
import { AppError } from '../../../middleware/errorHandler.js'
import { checkKeyedAttempts, recordKeyedAttempt, clearKeyedAttempts } from '../../../middleware/rateLimiter.js'
import { ShopCustomer } from '../../shop/models/index.js'

const SALT_ROUNDS = 10

/** 顾客登录失败限流：15 分钟窗口内最多 10 次失败 */
const LOGIN_WINDOW_MS = 15 * 60 * 1000
const LOGIN_MAX_ATTEMPTS = 10

/** 对外暴露的顾客信息（绝不携带 passwordHash） */
export interface CustomerPublic {
  id: number
  email: string
  nickname: string | null
  status: string
  createdAt: Date
}

function toPublic(row: ShopCustomer): CustomerPublic {
  return {
    id: row.id,
    email: row.email,
    nickname: row.nickname,
    status: row.status,
    createdAt: row.createdAt,
  }
}

export interface CustomerJwtPayload {
  sub: number
  tenantId: number
  email: string
  type: 'customer'
}

export interface RegisterParams {
  tenantId: number
  email: string
  password: string
  nickname?: string
}

export interface LoginParams {
  tenantId: number
  email: string
  password: string
  /** 客户端 IP（用于登录失败限流；缺省时按未知 IP 聚合） */
  ip?: string
}

/**
 * 注册顾客。tenantId 取自站点上下文（storefront 公开接口），
 * 与 admin users 完全隔离；邮箱在同一租户内唯一。
 */
export async function registerCustomer(params: RegisterParams): Promise<{ customer: CustomerPublic; token: string }> {
  const { tenantId, email, password, nickname } = params

  const existing = await ShopCustomer.findOne({ where: { tenantId, email } })
  if (existing) throw new AppError(409, '该邮箱已注册')

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS)
  const customer = await ShopCustomer.create({
    tenantId,
    email,
    passwordHash,
    nickname: nickname ?? null,
    status: 'active',
  })
  return { customer: toPublic(customer), token: signCustomerToken(customer) }
}

/** 邮箱 + 密码登录，返回顾客信息与独立 JWT。 */
export async function authenticateCustomer(params: LoginParams): Promise<{ customer: CustomerPublic; token: string }> {
  const { tenantId, email, password } = params

  /**
   * 登录失败限流（按 IP + 邮箱，仅失败计数）。
   *
   * 安全整改：C 端登录为公开接口，此前无任何失败计数/限流（admin 侧有
   * checkRateLimit + 账号锁定），可被无限次爆破顾客密码。
   */
  const limitKey = `rate:customer-login:${tenantId}:${params.ip ?? ''}:${email.toLowerCase()}`
  const limit = await checkKeyedAttempts(limitKey, LOGIN_WINDOW_MS, LOGIN_MAX_ATTEMPTS)
  if (!limit.allowed) {
    throw new AppError(429, `登录尝试过于频繁，请 ${limit.retryAfter ?? 60} 秒后再试`)
  }

  const customer = await ShopCustomer.findOne({ where: { tenantId, email } })
  if (!customer) {
    await recordKeyedAttempt(limitKey, LOGIN_WINDOW_MS)
    throw new AppError(401, '邮箱或密码错误')
  }

  const ok = await bcrypt.compare(password, customer.passwordHash)
  if (!ok) {
    await recordKeyedAttempt(limitKey, LOGIN_WINDOW_MS)
    throw new AppError(401, '邮箱或密码错误')
  }
  if (customer.status === 'blocked') throw new AppError(403, '账号已被禁用')

  // 登录成功：清除失败计数
  await clearKeyedAttempts(limitKey)

  return { customer: toPublic(customer), token: signCustomerToken(customer) }
}

/** 按租户 + id 取顾客（用于 /auth/me），租户隔离由显式 where 保证。 */
export async function getCustomerById(tenantId: number, id: number): Promise<CustomerPublic> {
  const customer = await ShopCustomer.findOne({ where: { tenantId, id } })
  if (!customer) throw new AppError(404, '顾客不存在')
  return toPublic(customer)
}

/** 签发顾客 JWT（使用独立 secret，与 admin JWT 隔离）。 */
export function signCustomerToken(customer: ShopCustomer): string {
  const payload: CustomerJwtPayload = {
    sub: customer.id,
    tenantId: customer.tenantId,
    email: customer.email,
    type: 'customer',
  }
  return jwt.sign(payload, config.jwt.customerSecret, { expiresIn: '30d' })
}

/** 校验顾客 JWT，失败抛 401。 */
export function verifyCustomerToken(token: string): CustomerJwtPayload {
  const decoded = jwt.verify(token, config.jwt.customerSecret) as jwt.JwtPayload & CustomerJwtPayload
  if (decoded.type !== 'customer') throw new AppError(401, '无效的顾客令牌')
  return {
    sub: decoded.sub,
    tenantId: decoded.tenantId,
    email: decoded.email,
    type: 'customer',
  }
}
