/**
 * 个人中心增强 API（P2-10）：登录安全历史 + 通知偏好
 */
import request from '@/utils/request'
import type { ActiveChannel } from '@/api/notificationChannel'

export interface LoginHistoryItem {
  id: number
  time: string
  action: string
  ip: string
  userAgent: string
  device: string
}

export interface NotificationPreferences {
  channels: ActiveChannel[]
  disabledIds: number[]
}

export const profileApi = {
  /** 当前用户的登录历史（仅本人，最多 50 条） */
  loginHistory: (limit = 20) => request.get<LoginHistoryItem[]>('/profile/login-history', { params: { limit } }),
  /** 当前用户的通知偏好：已启用渠道 + 已关闭渠道 ID */
  getNotificationPreferences: () => request.get<NotificationPreferences>('/profile/notification-preferences'),
  /** 保存通知偏好（传入被关闭的渠道 ID 列表） */
  saveNotificationPreferences: (disabledIds: number[]) => request.put<NotificationPreferences>('/profile/notification-preferences', { disabledIds }),
}
