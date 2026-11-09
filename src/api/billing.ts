/**
 * 计费/配额 API
 */
import request from '@/utils/request'

export type QuotaMetric = 'users' | 'files' | 'storage' | 'apiCalls' | 'workflowRuns'

export interface QuotaSnapshot {
  planCode: string | null
  periodEnd: string | null
  metrics: Array<{ metric: QuotaMetric; period: 'day' | 'month' | 'total'; used: number; limit: number }>
}

export interface PlanSummary {
  id: number
  code: string
  name: string
  priceMonthly: number
}

export const billingApi = {
  /** 租户首页配额卡：一次请求拿全部「已用/上限」 */
  getQuotaSnapshot() {
    return request.get<QuotaSnapshot>('/billing/usage')
  },

  getPlans() {
    return request.get<PlanSummary[]>('/billing/plans')
  },

  subscribe(planId: number) {
    return request.post<{ invoiceId: number; amount: number }>('/billing/subscribe', { planId })
  },
}
