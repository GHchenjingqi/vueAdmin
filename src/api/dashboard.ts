/**
 * 仪表盘 API
 */
import request from '@/utils/request'

export interface DashboardStats {
  totalUsers: number
  todayNewUsers: number
  activeUsers: number
  totalNotices: number
  loginCount?: number
  operationCount?: number
  [key: string]: unknown
}

export const dashboardApi = {
  /** 获取仪表盘统计数据 */
  getStats() {
    return request.get<DashboardStats>('/dashboard/stats')
  },
}
