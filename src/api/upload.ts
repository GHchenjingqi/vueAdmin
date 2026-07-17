/**
 * 文件上传 API
 */
import request from '@/utils/request'

export interface UploadResult {
  url: string
  filename: string
  originalName: string
  size: number
  path: string
}

/** 上传文件记录（列表接口返回） */
export interface UploadFileItem {
  name: string
  url: string
  path: string
  ext: string
  size: number
  mtime: string
}

export const uploadApi = {
  /** 获取已上传文件列表 */
  list() {
    return request.get<UploadFileItem[]>('/upload')
  },

  /** 上传单个文件 */
  upload(file: File, dir?: string) {
    const formData = new FormData()
    formData.append('file', file)
    if (dir) formData.append('dir', dir)
    return request.post<UploadResult>('/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },

  /** 上传单个文件（与 upload 相同，兼容 FileManager 调用） */
  uploadFile(file: File, dir?: string) {
    return this.upload(file, dir)
  },

  /** 批量上传文件 */
  uploadBatch(files: File[], dir?: string) {
    const formData = new FormData()
    files.forEach((file) => formData.append('files', file))
    if (dir) formData.append('dir', dir)
    return request.post<UploadResult[]>('/upload/batch', formData, {
      headers: { 'Content-Type': 'multipart/form-data', 'X-Upload-Batch': 'true' },
    })
  },

  /** 删除文件（id 为文件相对路径，如 "2025/01/abc.jpg"） */
  remove(id: string) {
    return request.delete<null>(`/upload/${id}`)
  },
}
