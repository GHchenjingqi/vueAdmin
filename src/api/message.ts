/**
 * 站内消息 API
 */
import request from '@/utils/request'
import type { PaginatedData, ListQueryParams } from '@/types/response'
import type { Message } from '@/types/api'

export const messageApi = {
  /** 获取消息列表 */
  list(params: ListQueryParams) {
    return request.get<PaginatedData<Message>>('/messages', { params })
  },

  /** 获取单个消息 */
  getById(id: number) {
    return request.get<Message>(`/messages/${id}`)
  },

  /** 发送消息 */
  send(data: { title: string; content: string; receiverId: number }) {
    return request.post<Message>('/messages', data)
  },

  /** 标记已读 */
  markRead(id: number) {
    return request.patch<null>(`/messages/${id}`, { isRead: true })
  },

  /** 全部标记已读 */
  markAllRead() {
    return request.patch<null>('/messages')
  },

  /** 删除消息 */
  delete(id: number) {
    return request.delete<null>(`/messages/${id}`)
  },
}
