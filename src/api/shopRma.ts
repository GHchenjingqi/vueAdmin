import request from '@/utils/request'

/** 退货申请（RMA）状态 */
export type RmaStatus = 'pending' | 'approved' | 'rejected' | 'returned' | 'refunded' | 'cancelled'

/** 退货明细项 */
export interface RmaItemLine {
  orderItemId?: number
  skuId: number
  qty: number
}

/** 退货申请行 */
export interface RmaItem {
  id: number
  orderId: number
  customerId: number | null
  email: string
  status: RmaStatus
  reason: string | null
  items: RmaItemLine[]
  refundAmountCents: number | string | null
  refundCurrency: string | null
  trackingNo: string | null
  rejectReason: string | null
  createdAt: string
  updatedAt: string
}

/** 后台 RMA 列表返回 */
export interface RmaListResult {
  rows: RmaItem[]
  total: number
  limit: number
  offset: number
}

/** 退货审核（RMA）后台管理接口 */
export const shopRmaApi = {
  list(params: { status?: RmaStatus | ''; orderId?: number; limit?: number; offset?: number } = {}) {
    return request.get<RmaListResult>('/shop/rmas', { params })
  },
  approve(id: number) {
    return request.post<RmaItem>(`/shop/rmas/${id}/approve`)
  },
  reject(id: number, rejectReason: string) {
    return request.post<RmaItem>(`/shop/rmas/${id}/reject`, { rejectReason })
  },
}
