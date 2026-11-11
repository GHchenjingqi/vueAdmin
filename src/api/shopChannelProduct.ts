import request from '@/utils/request'

export interface ChannelProductItem {
  id: number
  channelId: number
  shopId: number
  spuId: number
  skuId: number | null
  externalId: string | null
  status: 'listed' | 'published'
  createdAt: string
  updatedAt: string
}

export interface ChannelProductListResult {
  list: ChannelProductItem[]
  total: number
  page: number
  pageSize: number
}

export interface ChannelProductPublishPayload {
  spuId: number
  channelId: number
  shopId: number
  skuId?: number | null
  requiredQualifications?: string[]
}

export const shopChannelProductApi = {
  list(params: { channelId?: number; shopId?: number; spuId?: number; page?: number; pageSize?: number } = {}) {
    return request.get<ChannelProductListResult>('/shop/channel-products', { params })
  },
  publish(payload: ChannelProductPublishPayload) {
    return request.post<ChannelProductItem>('/shop/channel-products', payload)
  },
}
