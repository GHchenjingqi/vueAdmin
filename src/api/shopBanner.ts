import request from '@/utils/request'

/** 首页 Banner（营销首屏）管理接口 */
export interface BannerRow {
  id: number
  position: 'hero' | 'secondary'
  title: string
  subtitle: string | null
  linkUrl: string | null
  buttonLabel: string | null
  image: string
  enabled: boolean
  sortOrder: number
  startAt: string | null
  endAt: string | null
}

export type BannerInput = {
  position?: 'hero' | 'secondary'
  title: string
  subtitle?: string | null
  linkUrl?: string | null
  buttonLabel?: string | null
  image: string
  enabled?: boolean
  sortOrder?: number
  startAt?: string | null
  endAt?: string | null
}

export const shopBannerApi = {
  list(params: { position?: 'hero' | 'secondary' } = {}) {
    return request.get<{ list: BannerRow[] }>('/shop/banners', { params })
  },
  create(input: BannerInput) {
    return request.post<{ id: number }>('/shop/banners', input)
  },
  update(id: number, patch: Partial<BannerInput>) {
    return request.put<{ id: number }>(`/shop/banners/${id}`, patch)
  },
  remove(id: number) {
    return request.delete<{ id: number }>(`/shop/banners/${id}`)
  },
}
