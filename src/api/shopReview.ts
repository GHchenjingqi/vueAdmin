import request from '@/utils/request'

/** 商品评价状态 */
export type ReviewStatus = 'pending' | 'approved' | 'rejected'
/** 商品问答状态 */
export type QaStatus = 'pending' | 'answered' | 'hidden'

/** 商品评价条目 */
export interface ReviewItem {
  id: number
  tenantId: number
  spuId: number
  skuId: number | null
  customerId: number | null
  orderId: number | null
  rating: number
  title: string | null
  content: string
  images: string[] | null
  status: ReviewStatus
  verified: boolean
  isAnonymous: boolean
  helpfulCount: number
  locale: string | null
  createdAt: string
  updatedAt: string
}

/** 商品问答条目 */
export interface QaItem {
  id: number
  tenantId: number
  spuId: number
  skuId: number | null
  customerId: number | null
  question: string
  answer: string | null
  answeredBy: string | null
  answeredAt: string | null
  status: QaStatus
  locale: string | null
  createdAt: string
  updatedAt: string
}

export interface ReviewListResult {
  rows: ReviewItem[]
  total: number
  limit: number
  offset: number
}

export interface QaListResult {
  rows: QaItem[]
  total: number
  limit: number
  offset: number
}

/** 商品评价 / 问答后台审核 API（对齐 server/modules/shop 的 /reviews 与 /qa 路由） */
export const shopReviewApi = {
  listReviews(params: { status?: ReviewStatus | ''; spuId?: number; limit?: number; offset?: number } = {}) {
    return request.get<ReviewListResult>('/shop/reviews', { params })
  },
  approveReview(id: number) {
    return request.post<ReviewItem>(`/shop/reviews/${id}/approve`)
  },
  rejectReview(id: number) {
    return request.post<ReviewItem>(`/shop/reviews/${id}/reject`)
  },
  listQuestions(params: { status?: QaStatus | ''; spuId?: number; limit?: number; offset?: number } = {}) {
    return request.get<QaListResult>('/shop/qa', { params })
  },
  answerQuestion(id: number, answer: string) {
    return request.post<QaItem>(`/shop/qa/${id}/answer`, { answer })
  },
  hideQuestion(id: number) {
    return request.post<QaItem>(`/shop/qa/${id}/hide`)
  },
}
