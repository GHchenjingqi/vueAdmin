/**
 * 系统日志 API
 */
import request from '@/utils/request'
import type { PaginatedData, ListQueryParams } from '@/types/response'
import type { LogEntry } from '@/types/api'

export interface LogQueryParams extends ListQueryParams {
  type?: string
  scope?: string
  startDate?: string
  endDate?: string
  beforeDays?: number
}

export interface LogFailureStats {
  total: number
  ipStats: Array<{ ip: string; count: number }>
  details: Array<LogEntry>
}

export const logApi = {
  /** 获取日志列表 */
  list(params: LogQueryParams) {
    return request.get<PaginatedData<LogEntry>>('/logs', { params })
  },

  /** 获取日志详情 */
  getById(id: number) {
    return request.get<LogEntry>(`/logs/${id}`)
  },

  /** 导出日志（Excel 文件流） */
  exportLogs(params: LogQueryParams) {
    return request.get<Blob>('/logs', { params: { ...params, scope: 'export' }, responseType: 'blob' })
  },

  /** 清理日志 */
  cleanup(params: { beforeDays: number }) {
    return request.delete<null>('/logs', { params })
  },

  /** 获取登录失败统计 */
  getLoginFailureStats() {
    return request.get<LogFailureStats>('/logs', { params: { scope: 'stats', type: 'login-failures' } })
  },
}
