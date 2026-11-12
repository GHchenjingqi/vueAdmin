/**
 * 分销佣金台账 API（admin）
 */
import request from '@/utils/request'

export type ReferralCommissionStatus = 'pending' | 'settled' | 'void'

export interface ReferralCommission {
  id: number
  tenantId: number
  orderId: number
  referrerCustomerId: number
  code: string
  orderCurrency: string
  orderNetAmountCents: number
  commissionRatePercent: number
  commissionCents: number
  status: ReferralCommissionStatus
  windowExpiredAt: string | null
  createdAt: string
  updatedAt: string
}

export interface ListCommissionsParams {
  page?: number
  pageSize?: number
  status?: ReferralCommissionStatus
}

export interface ListCommissionsResult {
  list: ReferralCommission[]
  total: number
  page: number
  pageSize: number
}

export const referralCommissionApi = {
  /** 分页查询佣金台账（按状态筛选） */
  list: (params: ListCommissionsParams) => request.get<ListCommissionsResult>('/shop/referral-commissions', { params }),
  /** 结算（settled）或作废（void）一条 pending 佣金 */
  settle: (id: number, status: ReferralCommissionStatus) => request.post<ReferralCommission>(`/shop/referral-commissions/${id}/settle`, { status }),
}
