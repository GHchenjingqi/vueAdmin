/**
 * 部门管理 API
 */
import request from '@/utils/request'
import type { Department } from '@/types/api'

export const deptApi = {
  /** 获取部门树（后端 list 默认返回树形结构） */
  getTree() {
    return request.get<Department[]>('/departments')
  },

  /** 获取部门列表 */
  list() {
    return request.get<Department[]>('/departments')
  },

  /** 获取单个部门 */
  getById(id: number) {
    return request.get<Department>(`/departments/${id}`)
  },

  /** 创建部门 */
  create(data: Partial<Department>) {
    return request.post<Department>('/departments', data)
  },

  /** 更新部门 */
  update(id: number, data: Partial<Department>) {
    return request.put<Department>(`/departments/${id}`, data)
  },

  /** 删除部门 */
  delete(id: number) {
    return request.delete<null>(`/departments/${id}`)
  },
}
