/**
 * 用户 API
 */
import request from '@/utils/request'
import type { PaginatedData } from '@/types/response'
import type { User } from '@/types/api'

export interface UserQueryParams {
  page?: number
  pageSize?: number
  username?: string
  nickname?: string
  phone?: string
  deptId?: number
  startDate?: string
  endDate?: string
}

export const userApi = {
  /** 获取用户列表 */
  list(params: UserQueryParams) {
    return request.get<PaginatedData<User>>('/users', { params })
  },

  /** 获取单个用户 */
  getById(id: number) {
    return request.get<User>(`/users/${id}`)
  },

  /** 创建用户 */
  create(data: Partial<User>) {
    return request.post<User>('/users', data)
  },

  /** 更新用户 */
  update(id: number, data: Partial<User>) {
    return request.put<User>(`/users/${id}`, data)
  },

  /** 修改密码 */
  changePassword(id: number, data: { oldPassword?: string; password: string; reset?: boolean }) {
    return request.patch<null>(`/users/${id}/password`, data)
  },

  /** 删除用户 */
  delete(id: number) {
    return request.delete<null>(`/users/${id}`)
  },

  /** 下载导入模板 */
  downloadTemplate() {
    return request.get('/users/template', { responseType: 'blob' })
  },

  /** 批量导入用户 */
  importUsers(formData: FormData) {
    return request.post<{ success: number; failed: number }>('/users/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },

  /** 批量删除用户 */
  batchDelete(ids: number[]) {
    return request.delete<null>('/users/batch', { data: { ids } })
  },
}
