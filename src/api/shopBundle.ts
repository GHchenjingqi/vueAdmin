import request from '@/utils/request'

export interface BundleComponent {
  skuId: number
  qty: number
}

export interface BundleItem {
  id: number
  name: Record<string, string>
  currency: string
  components: BundleComponent[]
  discountType: 'fixed' | 'percent'
  discountValue: number
  active: boolean
  startAt: string
  endAt: string
  placement: string | null
  createdAt: string
  updatedAt: string
}

export interface BundleListResult {
  list: BundleItem[]
  total: number
  page: number
  pageSize: number
}

export interface BundlePayload {
  name: Record<string, string>
  currency: string
  components: BundleComponent[]
  discountType: 'fixed' | 'percent'
  discountValue: number
  active?: boolean
  startAt: string
  endAt: string
  placement?: string | null
}

export const shopBundleApi = {
  list(params: { page?: number; pageSize?: number; active?: boolean } = {}) {
    return request.get<BundleListResult>('/shop/bundles', { params })
  },
  get(id: number) {
    return request.get<BundleItem>(`/shop/bundles/${id}`)
  },
  create(payload: BundlePayload) {
    return request.post<BundleItem>('/shop/bundles', payload)
  },
  update(id: number, payload: Partial<BundlePayload>) {
    return request.put<BundleItem>(`/shop/bundles/${id}`, payload)
  },
  remove(id: number) {
    return request.delete<null>(`/shop/bundles/${id}`)
  },
}
