/**
 * Origin / Referer 校验中间件（CSRF 纵深防御）
 *
 * 对非 GET 请求校验 Origin 头：
 * - 无 Origin 的请求（服务器/爬虫/同源）放行
 * - Origin 不在白名单内且 Referer 不匹配时拒绝
 *
 * 与 Cookie SameSite=Strict 配合，形成双重 CSRF 防御。
 */
import type { Request, Response, NextFunction } from 'express'
import config from '../config/index.js'

// 允许的 Origin（默认：同源 + 常见内网 Vite 端口）
const ALLOWED_ORIGINS = new Set<string>([
  ...new Set((config.app.allowedOrigins || ['http://localhost:5174', 'https://localhost:5174', 'http://127.0.0.1:5174', 'https://127.0.0.1:5174']).filter(Boolean)),
])

/**
 * 判断 Origin 是否在白名单
 */
function isOriginAllowed(origin: string): boolean {
  if (!origin) return true // 无 Origin（服务器间请求/同源）放行
  return ALLOWED_ORIGINS.has(origin)
}

/**
 * 判断 Referer 是否与允许域名一致（兜底校验）
 */
function isRefererAllowed(referer: string, origin: string | null): boolean {
  if (!referer) return true
  try {
    const refUrl = new URL(referer)
    return ALLOWED_ORIGINS.has(`${refUrl.protocol}//${refUrl.host}`)
  } catch {
    return true // 无法解析则放行（避免误杀）
  }
}

export default function originValidator(req: Request, res: Response, next: NextFunction) {
  // GET / HEAD / OPTIONS 不校验（幂等、不改变状态）
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    return next()
  }

  const origin = req.headers.origin as string | null
  const referer = req.headers.referer as string | null

  if (isOriginAllowed(origin!)) {
    return next()
  }

  if (isRefererAllowed(referer!, origin)) {
    return next()
  }

  // Origin 不在白名单且 Referer 也不匹配 → 拒绝
  res.status(403).json({ code: 403, message: '请求来源不受信任' })
}
