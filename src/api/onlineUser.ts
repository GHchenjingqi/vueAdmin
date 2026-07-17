/**
 * 在线用户 API
 */
import request from '@/utils/request'
import type { OnlineUser } from '@/types/api'

export const onlineUserApi = {
  /** 获取在线用户列表 */
  list() {
    return request.get<OnlineUser[]>('/online-users')
  },

  /** 强制踢下线 */
  kick(userId: number) {
    return request.delete<null>(`/online-users/${userId}/session`)
  },
}
