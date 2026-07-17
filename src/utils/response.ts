/**
 * Unified Response Utilities
 * 统一响应工具函数
 *
 * 提供标准化的 API 响应处理函数，确保前后端交互格式一致。
 * 配合 request.ts 拦截器使用，减少重复的 error handling 代码。
 */

import type { ApiResponse, PaginatedResponse, PaginatedData, VoidResponse } from '@/types/response'

/** 成功响应 */
export function success<T = unknown>(data: T, message = '操作成功'): ApiResponse<T> {
  return { code: 0, data, message }
}

/** 失败响应 */
export function fail(message = '请求失败', code = 1): ApiResponse<null> {
  return { code, data: null, message }
}

/** 分页响应 */
export function paginate<T>(rows: T[], total: number): PaginatedResponse<T> {
  return { code: 0, data: { rows, total } }
}

/** 空成功响应 */
export function ok(message = '操作成功'): VoidResponse {
  return { code: 0, data: null, message }
}

/** 判断 API 响应是否成功 */
export function isSuccess<T>(res: ApiResponse<T>): boolean {
  return res.code === 0
}

/** 从响应中安全提取数据 */
export function extractData<T>(res: ApiResponse<T>): T {
  if (res.code !== 0) {
    throw new Error(res.message || '请求失败')
  }
  return res.data
}

/** 从分页响应中提取数据 */
export function extractPaginatedData<T>(res: PaginatedResponse<T>): PaginatedData<T> {
  if (res.code !== 0) {
    throw new Error(res.message || '请求失败')
  }
  return res.data
}

/**
 * 解析后端错误消息
 * 处理不同类型的错误响应格式
 */
export function parseErrorMessage(err: unknown): string {
  if (typeof err === 'string') return err
  if (err && typeof err === 'object') {
    const e = err as Record<string, unknown>
    if (e.message && typeof e.message === 'string') return e.message
    if (e.msg && typeof e.msg === 'string') return e.msg
    if (e.error && typeof e.error === 'string') return e.error
  }
  return '未知错误'
}
