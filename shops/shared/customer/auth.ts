import { scrub } from '@shared/errors/report'

/**
 * P4-T01 → PLAN 5.2：顾客账户（注册/登录/登出/me）。
 *
 * 会话优先级：httpOnly Cookie（后端登录时下发，JS 读不到，XSS 无法窃取）
 * → localStorage 的 Bearer（兼容旧会话/旧部署）。
 *
 * 这里不再把新拿到的 token 写入 localStorage：只要后端下发了 Cookie，
 * 后续请求带上 `credentials: 'include'` 即可。保留读取逻辑是为了不打断
 * 已登录用户（升级前存入的 token 仍可用，直到过期）。
 */

const TOKEN_KEY = 'sb_customer_token'
const CUSTOMER_KEY = 'sb_customer'

export interface CustomerPublic {
  id: number
  email: string
  nickname?: string
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(TOKEN_KEY)
}

/**
 * 是否已登录（PLAN 5.2）。
 *
 * 不能再用 `!!getToken()` 判断：Cookie 模式下 JS 读不到 token，会恒为 null。
 * 判据改为「有本地顾客信息」；真正的鉴权仍由后端 Cookie/Bearer 校验，
 * 本地标记只用于决定 UI 展示（失败时各接口会返回 401，由调用方兜底）。
 */
export function isAuthenticated(): boolean {
  if (typeof window === 'undefined') return false
  return !!getToken() || !!getStoredCustomer()
}

export function getStoredCustomer(): CustomerPublic | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(CUSTOMER_KEY)
    return raw ? (JSON.parse(raw) as CustomerPublic) : null
  } catch {
    return null
  }
}

/**
 * 会话保存：只保存"展示用的顾客信息"，不再持久化 token。
 * token 由 httpOnly Cookie 承载（JS 无法读取），这是 5.2 的核心变更。
 * 旧版本已存在 localStorage 的 token 仍会被 getToken() 读到并继续可用。
 */
function saveSession(_token: string, customer: CustomerPublic): void {
  try {
    localStorage.setItem(CUSTOMER_KEY, JSON.stringify(customer))
  } catch {
    /* 隐私模式下 localStorage 不可用：仅影响刷新后的展示，不影响功能 */
  }
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(CUSTOMER_KEY)
}

async function api<T>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = getToken()
  const res = await fetch(path, {
    method: opts.method || 'GET',
    // 带上 httpOnly Cookie（同源 BFF，无需 CORS 预检）
    credentials: 'same-origin',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  })
  const body = (await res.json()) as { code: number; data: T; message?: string }
  if (!res.ok || body.code !== 0) throw new Error(body.message || 'request failed')
  return body.data
}

export async function register(email: string, password: string, nickname?: string): Promise<void> {
  await api('/api/auth/register', { method: 'POST', body: { email, password, nickname } })
}

export async function login(email: string, password: string): Promise<CustomerPublic> {
  const data = await api<{ customer: CustomerPublic; token: string }>('/api/auth/login', {
    method: 'POST',
    body: { email, password },
  })
  saveSession(data.token, data.customer)
  return data.customer
}

export async function logout(): Promise<void> {
  // 后端暂无 /auth/logout 端点（撤销式 JWT 待并行方补充）；本地清理即时生效
  clearSession()
}

export async function me(): Promise<CustomerPublic> {
  return await api<{ customer: CustomerPublic }>('/api/auth/me').then((d) => (d as { customer: CustomerPublic }).customer)
}

/** P4-T05/T06：RMA 退货（登录态；归属校验在服务端） */
export interface RmaItem {
  orderItemId: number
  skuId: number
  qty: number
}

export async function submitRma(orderId: number, items: RmaItem[], reason?: string): Promise<unknown> {
  return await api('/api/rma', { method: 'POST', body: { orderId, items, reason } })
}

export async function listMyRmas(): Promise<unknown[]> {
  return await api<unknown[]>('/api/rma')
}

/** P4-T14 之外的安全兜底：错误上报复用 scrub（避免本地敏感信息外传） */
export function scrubLocal(text: string): string {
  return scrub(text)
}
