/**
 * 通知公告 API
 */
import request from '@/utils/request'
import type { PaginatedData, ListQueryParams } from '@/types/response'
import type { Notice } from '@/types/api'

export const noticeApi = {
  /** 获取通知列表 */
  list(params: ListQueryParams & { type?: string }) {
    return request.get<PaginatedData<Notice>>('/notices', { params })
  },

  /** 获取单个通知 */
  getById(id: number) {
    return request.get<Notice>(`/notices/${id}`)
  },

  /** 创建通知 */
  create(data: Partial<Notice>) {
    return request.post<Notice>('/notices', data)
  },

  /** 更新通知 */
  update(id: number, data: Partial<Notice>) {
    return request.put<Notice>(`/notices/${id}`, data)
  },

  /** 删除通知 */
  delete(id: number) {
    return request.delete<null>(`/notices/${id}`)
  },

  /** 标记已读 */
  markRead(id: number) {
    return request.patch<null>(`/notices/${id}`, { isRead: true })
  },

  /** 全部标记已读 */
  markAllRead() {
    return request.patch<null>('/notices')
  },

  /** 获取未读通知数 */
  getUnreadCount() {
    return request.get<{ count: number }>('/notices/unread/count')
  },
}
