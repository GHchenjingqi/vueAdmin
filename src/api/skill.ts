/**
 * Skills 下载中心 API
 *
 * 后台管理走 /prompt/skills（管理员鉴权），前台浏览/下载走 /portal/skills（公开）。
 * 附件上传走独立的 multipart 通道，返回结构可直接作为 skill.attachments 的一项。
 */
import request from '@/utils/request'
import type { PaginatedData, ListQueryParams } from '@/types/response'

export interface SkillAttachment {
  id: string
  url: string
  name: string
  size: number
  mimetype: string
}

export interface SkillItem {
  id: number
  title: string
  description: string
  attachments: SkillAttachment[]
  status: number
  viewCount: number
  createdAt: string
  updatedAt: string
}

export interface SkillPayload {
  title: string
  description: string
  attachments: SkillAttachment[]
  status?: number
}

export type SkillUploadResult = SkillAttachment

export const skillApi = {
  /** ==================== 后台管理 ==================== */
  uploadAttachment(file: File) {
    const formData = new FormData()
    formData.append('file', file)
    return request.post<SkillUploadResult>('/prompt/skills/upload-attachment', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },

  getSkills(params?: ListQueryParams) {
    return request.get<PaginatedData<SkillItem>>('/prompt/skills', { params })
  },

  getSkill(id: number | string) {
    return request.get<SkillItem>(`/prompt/skills/${id}`)
  },

  createSkill(data: SkillPayload) {
    return request.post<SkillItem>('/prompt/skills', data)
  },

  updateSkill(id: number | string, data: SkillPayload) {
    return request.put<SkillItem>(`/prompt/skills/${id}`, data)
  },

  deleteSkill(id: number | string) {
    return request.delete<null>(`/prompt/skills/${id}`)
  },

  /** ==================== 前台公开 ==================== */
  getPortalSkills(params?: ListQueryParams) {
    return request.get<PaginatedData<SkillItem>>('/portal/skills', { params })
  },

  getPortalSkill(id: number | string) {
    return request.get<SkillItem>(`/portal/skills/${id}`)
  },

  /** 附件下载直链（浏览器触发 Content-Disposition 下载） */
  attachmentDownloadUrl(skillId: number | string, attachmentId: string): string {
    return `/api/v1/portal/skills/${skillId}/attachments/${encodeURIComponent(attachmentId)}/download`
  },
}
