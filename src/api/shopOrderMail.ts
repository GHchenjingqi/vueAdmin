import request from '@/utils/request'

export type OrderMailStatus = 'pending' | 'sent' | 'failed' | 'dead'

export interface OrderMailItem {
  id: number
  orderId: number
  orderNo: string
  type: string
  dedupeKey: string
  toEmail: string
  subject: string
  bodyText: string
  currency: string
  amountCents: number
  status: OrderMailStatus
  attempts: number
  nextAttemptAt: string | null
  lastError: string | null
  sentAt: string | null
}

export interface DrainResult {
  scanned: number
  sent: number
  failed: number
  dead: number
}

export const shopOrderMailApi = {
  list(orderId: number) {
    return request.get<OrderMailItem[]>('/shop/order-mails', { params: { orderId } })
  },
  drain(limit?: number) {
    return request.post<DrainResult>('/shop/order-mails/drain', { limit })
  },
  retry(id: number) {
    return request.post<OrderMailItem>(`/shop/order-mails/${id}/retry`)
  },
}
