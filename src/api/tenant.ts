/**
 * 租户管理 API（平台超管侧 + 租户自助读取）
 */
import request from '@/utils/request'
import type { ProvisionTenantInput, UpdateTenantInput } from '@shared/schemas/tenant'

/** 列表行 = 租户字段 + 后端附带的菜单副本数量 */
export interface TenantRow {
  id: number
  name: string
  code: string
  status: number
  planId: number | null
  expiresAt: string | null
  settings: { brand?: { title?: string; logo?: string; color?: string } } | null
  createdAt?: string
  menuCount: number
  [key: string]: unknown
}

export interface TenantQuery {
  page?: number
  pageSize?: number
  name?: string
  code?: string
  status?: number | string
}

export interface CurrentTenantInfo {
  id: number
  name: string
  code: string
  status: number
  brand: { title?: string; logo?: string; color?: string }
  planCode: string | null
}

export const tenantApi = {
  list(params: TenantQuery = {}) {
    return request.get<{ rows: TenantRow[]; total: number }>('/tenants', { params })
  },

  getById(id: number) {
    return request.get<TenantRow>(`/tenants/${id}`)
  },

  provision(data: ProvisionTenantInput) {
    return request.post<{ tenantId: number; adminUserId: number; adminRoleId: number; deptId: number; planId: number }>('/tenants', data)
  },

  update(id: number, data: UpdateTenantInput) {
    return request.put<TenantRow>(`/tenants/${id}`, data)
  },

  setStatus(id: number, status: number) {
    return request.patch<{ id: number; status: number }>(`/tenants/${id}/status`, { status })
  },

  current() {
    return request.get<CurrentTenantInfo>('/tenants/current')
  },
}
