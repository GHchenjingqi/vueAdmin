/**
 * 仪表盘 API
 */
import request from '@/utils/request'

export interface DashboardStats {
  promptTotal: number
  promptPublished: number
  promptPending: number
  promptSequence: number
  userTotal: number
  userTodayNew: number
  userActive: number
  userContributors: number
  [key: string]: unknown
}

export const dashboardApi = {
  /** 获取仪表盘统计数据 */
  getStats() {
    return request.get<DashboardStats>('/dashboard/stats')
  },
}
