/**
 * 字典管理 API
 */
import request from '@/utils/request'
import type { PaginatedData, ListQueryParams } from '@/types/response'
import type { DictType, DictData } from '@/types/api'

export const dictApi = {
  // ==================== 字典类型 ====================

  /** 获取字典类型列表 */
  getTypes(params: ListQueryParams) {
    return request.get<PaginatedData<DictType>>('/dict/types', { params })
  },

  /** 获取所有字典类型 */
  getAllTypes() {
    return request.get<DictType[]>('/dict/types/all')
  },

  /** 创建字典类型 */
  createType(data: Partial<DictType>) {
    return request.post<DictType>('/dict/types', data)
  },

  /** 更新字典类型 */
  updateType(id: number, data: Partial<DictType>) {
    return request.put<DictType>(`/dict/types/${id}`, data)
  },

  /** 删除字典类型 */
  deleteType(id: number) {
    return request.delete<null>(`/dict/types/${id}`)
  },

  // ==================== 字典数据 ====================

  /** 根据字典类型编码获取字典数据（下拉选择器用，走缓存） */
  getDataByType(dictType: string) {
    return request.get<DictData[]>('/dict/data', { params: { scope: 'options', type: dictType } })
  },

  /** 获取字典数据列表 */
  getDataList(params: { dictType?: string } & ListQueryParams) {
    return request.get<PaginatedData<DictData>>('/dict/data', { params })
  },

  /** 创建字典数据 */
  createData(data: Partial<DictData>) {
    return request.post<DictData>('/dict/data', data)
  },

  /** 更新字典数据 */
  updateData(id: number, data: Partial<DictData>) {
    return request.put<DictData>(`/dict/data/${id}`, data)
  },

  /** 删除字典数据 */
  deleteData(id: number) {
    return request.delete<null>(`/dict/data/${id}`)
  },

  // ==================== 缓存管理 ====================

  /** 刷新字典缓存（清空后端内存缓存，下次查询从数据库重新加载） */
  refreshCache() {
    return request.post<null>('/dict/cache/refresh')
  },
}
