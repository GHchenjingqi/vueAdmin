/**
 * {{moduleTitle}} API
 */
import request from '@/utils/request'
import type { PaginatedData } from '@/types/response'

export interface {{moduleNameCapital}} {
  id: number
  name: string
  description: string
  status: number
  sort: number
  createdAt: string
  updatedAt: string
}

export interface {{moduleNameCapital}}QueryParams {
  page?: number
  pageSize?: number
  keyword?: string
  status?: number
  startDate?: string
  endDate?: string
}

export const {{moduleName}}Api = {
  /** 获取{{moduleTitle}}列表 */
  list(params: {{moduleNameCapital}}QueryParams) {
    return request.get<PaginatedData<{{moduleNameCapital}}>>('/{{moduleNamePlural}}', { params })
  },

  /** 获取单个{{moduleTitle}} */
  getById(id: number) {
    return request.get<{{moduleNameCapital}}>(`/{{moduleNamePlural}}/${id}`)
  },

  /** 创建{{moduleTitle}} */
  create(data: Partial<{{moduleNameCapital}}>) {
    return request.post<{{moduleNameCapital}}>('/{{moduleNamePlural}}', data)
  },

  /** 更新{{moduleTitle}} */
  update(id: number, data: Partial<{{moduleNameCapital}}>) {
    return request.put<{{moduleNameCapital}}>(`/{{moduleNamePlural}}/${id}`, data)
  },

  /** 删除{{moduleTitle}} */
  delete(id: number) {
    return request.delete<null>(`/{{moduleNamePlural}}/${id}`)
  },
}