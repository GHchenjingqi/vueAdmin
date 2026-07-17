/**
 * 系统设置 API
 */
import request from '@/utils/request'

export const siteApi = {
  /** 获取站点信息（无需认证） */
  info() {
    return request.get<Record<string, unknown>>('/site/info')
  },
}

export const settingApi = {
  /** 获取所有设置 */
  list() {
    return request.get<Record<string, unknown>>('/settings')
  },

  /** 获取单个设置 */
  getByKey(key: string) {
    return request.get<unknown>(`/settings/${key}`)
  },

  /** 批量保存设置 */
  save(data: Record<string, unknown>) {
    return request.put<null>('/settings', data)
  },
}
