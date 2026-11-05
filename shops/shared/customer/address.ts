import { getToken } from './auth'

/**
 * P4-T02 地址簿前端接线（顾客 JWT 登录态）
 *
 * - 归属字段（customerId / tenantId）**不从前端发送**，服务端一律取 JWT；
 * - 兼容两种响应：BFF 直通解包后的裸数据，以及后端原生 {code:0,data} 信封；
 * - 所有请求带 Authorization: Bearer，token 缺失直接本地拒绝（不发出无权限请求）。
 */

export interface CustomerAddress {
  id: number
  fullName: string
  phone: string
  country: string
  province: string
  city: string
  address1: string
  address2: string | null
  postcode: string
  isDefault: boolean
  createdAt?: string
  updatedAt?: string
}

export interface AddressForm {
  fullName: string
  phone: string
  country: string
  province: string
  city: string
  address1: string
  address2?: string
  postcode: string
  isDefault?: boolean
}

export interface AddressPatch extends Partial<AddressForm> {}

/** 构造请求体：trim + 国家码大写 + 空 address2 归一化为 null + 剥离越权/未知字段 */
export function buildAddressPayload(form: AddressForm | AddressPatch, partial = false): Record<string, unknown> {
  const text = (v: unknown): string | undefined => (typeof v === 'string' ? v.trim() : undefined)
  const out: Record<string, unknown> = {}
  const fields = ['fullName', 'phone', 'country', 'province', 'city', 'address1', 'postcode'] as const
  for (const key of fields) {
    const value = text((form as unknown as Record<string, unknown>)[key])
    if (value !== undefined && (!partial || value !== '')) out[key] = key === 'country' ? value.toUpperCase() : value
  }
  const address2 = text(form.address2)
  if (address2 !== undefined) out.address2 = address2 === '' ? null : address2
  if (typeof form.isDefault === 'boolean') out.isDefault = form.isDefault
  return out
}

async function addressRequest<T>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = getToken()
  if (!token) throw new Error('请先登录')
  const res = await fetch(path, {
    method: opts.method || 'GET',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  })
  const raw = await res.text()
  let parsed: unknown = null
  try {
    parsed = raw ? JSON.parse(raw) : null
  } catch {
    parsed = null
  }
  const env = parsed && typeof parsed === 'object' ? (parsed as { code?: number; data?: unknown; message?: string }) : null
  if (!res.ok || (env && typeof env.code === 'number' && env.code !== 0)) {
    throw new Error(env?.message || `请求失败（${res.status}）`)
  }
  return (env && 'data' in env ? env.data : parsed) as T
}

const BASE = '/api/addresses'

export function listAddresses(): Promise<CustomerAddress[]> {
  return addressRequest<CustomerAddress[]>(BASE)
}

export function createAddress(form: AddressForm): Promise<CustomerAddress> {
  return addressRequest<CustomerAddress>(BASE, { method: 'POST', body: buildAddressPayload(form) })
}

export function updateAddress(id: number, patch: AddressPatch): Promise<CustomerAddress> {
  return addressRequest<CustomerAddress>(`${BASE}/${id}`, { method: 'PATCH', body: buildAddressPayload(patch, true) })
}

export function deleteAddress(id: number): Promise<{ id: number; promotedId: number | null }> {
  return addressRequest<{ id: number; promotedId: number | null }>(`${BASE}/${id}`, { method: 'DELETE' })
}

export function setDefaultAddress(id: number): Promise<CustomerAddress> {
  return addressRequest<CustomerAddress>(`${BASE}/${id}/default`, { method: 'POST' })
}
