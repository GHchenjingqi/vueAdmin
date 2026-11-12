/**
 * 通知渠道管理 API（P2-11）
 */
import request from '@/utils/request'

export type ChannelType = 'email' | 'sms' | 'webhook'

export interface ChannelConfig {
  url?: string
  secret?: string
  host?: string
  port?: number
  secure?: boolean
  user?: string
  pass?: string
  from?: string
  provider?: string
  apiKey?: string
  signName?: string
  [key: string]: unknown
}

export interface NotificationChannel {
  id: number
  name: string
  type: ChannelType
  enabled: boolean
  config: ChannelConfig
  remark: string | null
  lastTestedAt: string | null
  lastTestResult: string | null
  createdAt: string
  updatedAt: string
}

/** 已启用渠道精简清单（不含任何配置，供个人中心通知偏好使用） */
export interface ActiveChannel {
  id: number
  name: string
  type: ChannelType
}

export interface ChannelInput {
  name?: string
  type?: ChannelType
  enabled?: boolean
  config?: ChannelConfig
  remark?: string | null
}

export interface ChannelQuery {
  keyword?: string
  type?: ChannelType
  enabled?: boolean
}

export const notificationChannelApi = {
  list: (params?: ChannelQuery) => request.get<NotificationChannel[]>('/notification-channels', { params }),
  active: () => request.get<ActiveChannel[]>('/notification-channels/active'),
  create: (data: ChannelInput) => request.post<NotificationChannel>('/notification-channels', data),
  update: (id: number, data: ChannelInput) => request.put<NotificationChannel>(`/notification-channels/${id}`, data),
  toggle: (id: number, enabled: boolean) => request.put<NotificationChannel>(`/notification-channels/${id}/toggle`, { enabled }),
  test: (id: number) => request.post<{ ok: boolean; message: string }>(`/notification-channels/${id}/test`),
  remove: (id: number) => request.delete(`/notification-channels/${id}`),
}
