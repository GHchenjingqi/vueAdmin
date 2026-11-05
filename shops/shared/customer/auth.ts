import { scrub } from '@shared/errors/report'

/**
 * P4-T01：顾客账户（注册/登录/登出/me）。token 存 localStorage，请求带 Bearer（customerAuth 校验）。
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

export function getStoredCustomer(): CustomerPublic | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(CUSTOMER_KEY)
    return raw ? (JSON.parse(raw) as CustomerPublic) : null
  } catch {
    return null
  }
}

function saveSession(token: string, customer: CustomerPublic): void {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(CUSTOMER_KEY, JSON.stringify(customer))
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(CUSTOMER_KEY)
}

async function api<T>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = getToken()
  const res = await fetch(path, {
    method: opts.method || 'GET',
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
