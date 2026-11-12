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

export interface DashboardTrend {
  days: string[]
  newUsers: number[]
  newOrders: number[]
  revenue: number[]
}

export const dashboardApi = {
  /** 获取仪表盘统计数据 */
  getStats() {
    return request.get<DashboardStats>('/dashboard/stats')
  },
  /** 获取仪表盘时间序列（P2-12 ECharts 增强） */
  getTrends(days = 30) {
    return request.get<DashboardTrend>('/dashboard/trends', { params: { days } })
  },
}
