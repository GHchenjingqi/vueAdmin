/**
 * 菜单 API
 */
import request from '@/utils/request'
import type { Menu } from '@/types/api'

export const menuApi = {
  /** 获取菜单树 */
  getTree() {
    return request.get<Menu[]>('/menus/tree')
  },

  /** 获取所有菜单列表（扁平） */
  list() {
    return request.get<Menu[]>('/menus')
  },

  /** 获取单个菜单 */
  getById(id: number) {
    return request.get<Menu>(`/menus/${id}`)
  },

  /** 创建菜单 */
  create(data: Partial<Menu>) {
    return request.post<Menu>('/menus', data)
  },

  /** 更新菜单 */
  update(id: number, data: Partial<Menu>) {
    return request.put<Menu>(`/menus/${id}`, data)
  },

  /** 删除菜单 */
  delete(id: number) {
    return request.delete<null>(`/menus/${id}`)
  },
}
