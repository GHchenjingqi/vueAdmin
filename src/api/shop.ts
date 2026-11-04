/**
 * 商城后台 API
 *
 * 跨境商城运营中台接口，统一前缀 /shop（阶段 0 先提供健康检查，
 * 阶段 1 起按域扩展：category / brand / attribute / product / channel ...）
 */
import request from '@/utils/request'

export interface ShopHealth {
  ok: boolean
  service: string
  time: string
}

export const shopApi = {
  /** 商城模块健康检查 */
  health() {
    return request.get<ShopHealth>('/shop/health')
  },
}
