/**
 * API 响应类型定义
 *
 * 统一所有 API 交互的响应数据结构，配合 utils/response.ts 使用。
 */

/** 通用响应结构 */
export interface ApiResponse<T = unknown> {
  code: number
  data: T
  message?: string
}

/** 分页数据结构 */
export interface PaginatedData<T> {
  rows: T[]
  total: number
}

/** 分页响应 */
export type PaginatedResponse<T> = ApiResponse<PaginatedData<T>>

/** 空响应（无数据） */
export type VoidResponse = ApiResponse<null>

/** 通用列表查询参数 */
export interface ListQueryParams {
  page?: number
  pageSize?: number
  keyword?: string
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  [key: string]: unknown
}
