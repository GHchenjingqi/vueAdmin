/**
 * 定时任务 API
 */
import request from '@/utils/request'
import type { PaginatedData, ListQueryParams } from '@/types/response'
import type { Task } from '@/types/api'

export const taskApi = {
  /** 获取任务列表 */
  list(params?: ListQueryParams) {
    return request.get<PaginatedData<Task>>('/tasks', { params })
  },

  /** 获取单个任务 */
  getById(id: number) {
    return request.get<Task>(`/tasks/${id}`)
  },

  /** 创建任务 */
  create(data: Partial<Task>) {
    return request.post<Task>('/tasks', data)
  },

  /** 更新任务 */
  update(id: number, data: Partial<Task>) {
    return request.put<Task>(`/tasks/${id}`, data)
  },

  /** 删除任务 */
  delete(id: number) {
    return request.delete<null>(`/tasks/${id}`)
  },

  /** 执行任务 */
  execute(id: number) {
    return request.post<null>(`/tasks/${id}/execute`)
  },

  /** 启停任务 */
  toggleStatus(id: number) {
    return request.patch<Task>(`/tasks/${id}/status`)
  },
}
