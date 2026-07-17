/**
 * 角色管理 API
 */
import request from '@/utils/request'
import type { PaginatedData, ListQueryParams } from '@/types/response'
import type { Role } from '@/types/api'

export const roleApi = {
  /** 获取角色列表 */
  list(params?: ListQueryParams) {
    return request.get<PaginatedData<Role>>('/roles', { params })
  },

  /** 获取所有角色（不分页） */
  getAll() {
    return request.get<Role[]>('/roles/all')
  },

  /** 获取单个角色 */
  getById(id: number) {
    return request.get<Role>(`/roles/${id}`)
  },

  /** 创建角色 */
  create(data: Partial<Role>) {
    return request.post<Role>('/roles', data)
  },

  /** 更新角色 */
  update(id: number, data: Partial<Role>) {
    return request.put<Role>(`/roles/${id}`, data)
  },

  /** 删除角色 */
  delete(id: number) {
    return request.delete<null>(`/roles/${id}`)
  },
}
