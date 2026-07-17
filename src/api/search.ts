/**
 * 全局搜索 API
 */
import request from '@/utils/request'

export interface SearchItem {
  id: number
  label: string
  description: string
  url: string
  status?: number
  type?: string
}

export interface SearchGroup {
  module: string
  icon: string
  path: string
  items: SearchItem[]
}

export interface SearchResult {
  menus: Array<{ id: number; name: string; path: string; icon?: string }>
  users?: Array<{ id: number; username: string; nickname?: string }>
  [key: string]: unknown
}

export const searchApi = {
  /** 全局搜索（菜单/用户/部门/角色/功能） */
  search(keyword: string) {
    return request.get<SearchGroup[]>('/search', { params: { keyword } })
  },
}
