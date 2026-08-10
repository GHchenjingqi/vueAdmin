import request from '@/utils/request'
import type { PaginatedData } from '@/types/response'
import type { KnowledgeCategory, KnowledgeTag, KnowledgeContent } from '../types'

export const knowledgeCategoryApi = {
  list() {
    return request.get<KnowledgeCategory[]>('/knowledge/categories')
  },
  options() {
    return request.get<KnowledgeCategory[]>('/knowledge/categories/options')
  },
  getById(id: number) {
    return request.get<KnowledgeCategory>(`/knowledge/categories/${id}`)
  },
  create(data: Partial<KnowledgeCategory>) {
    return request.post<KnowledgeCategory>('/knowledge/categories', data)
  },
  update(id: number, data: Partial<KnowledgeCategory>) {
    return request.put<KnowledgeCategory>(`/knowledge/categories/${id}`, data)
  },
  delete(id: number) {
    return request.delete<null>(`/knowledge/categories/${id}`)
  },
}

export const knowledgeTagApi = {
  list(params: { page?: number; pageSize?: number; keyword?: string } = {}) {
    return request.get<PaginatedData<KnowledgeTag>>('/knowledge/tags', { params })
  },
  options() {
    return request.get<KnowledgeTag[]>('/knowledge/tags/options')
  },
  getById(id: number) {
    return request.get<KnowledgeTag>(`/knowledge/tags/${id}`)
  },
  create(data: Partial<KnowledgeTag>) {
    return request.post<KnowledgeTag>('/knowledge/tags', data)
  },
  update(id: number, data: Partial<KnowledgeTag>) {
    return request.put<KnowledgeTag>(`/knowledge/tags/${id}`, data)
  },
  delete(id: number) {
    return request.delete<null>(`/knowledge/tags/${id}`)
  },
}

export const knowledgeContentApi = {
  list(params: { page?: number; pageSize?: number; keyword?: string; categoryId?: number; tagId?: number; status?: string }) {
    return request.get<PaginatedData<KnowledgeContent>>('/knowledge/contents', { params })
  },
  getById(id: number) {
    return request.get<KnowledgeContent>(`/knowledge/contents/${id}`)
  },
  create(data: Partial<KnowledgeContent>) {
    return request.post<KnowledgeContent>('/knowledge/contents', data)
  },
  update(id: number, data: Partial<KnowledgeContent>) {
    return request.put<KnowledgeContent>(`/knowledge/contents/${id}`, data)
  },
  delete(id: number) {
    return request.delete<null>(`/knowledge/contents/${id}`)
  },
}
