/**
 * 文件上传 Service 层
 *
 * 职责：封装文件上传/管理的业务逻辑
 */

import { existsSync, readdirSync, statSync } from 'fs'
import { resolve, dirname, extname, relative } from 'path'
import { fileURLToPath } from 'url'
import { unlink } from 'fs/promises'
import { AppError } from '../middleware/errorHandler.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const UPLOAD_DIR = resolve(__dirname, '../uploads')

/**
 * 将文件相对路径转为 URL
 */
function toUrl(relativePath: string): string {
  return '/uploads/' + relativePath.replace(/\\/g, '/')
}

/**
 * 递归扫描目录
 */
function scanDir(dirPath: string, files: Array<{
  id: string
  url: string
  name: string
  size: number
  mtime: Date
  ext: string
}>): void {
  const entries = readdirSync(dirPath)
  for (const entry of entries) {
    const fullPath = resolve(dirPath, entry)
    const stats = statSync(fullPath)
    if (stats.isFile()) {
      const relativePath = relative(UPLOAD_DIR, fullPath)
      const ext = extname(entry).toLowerCase()
      files.push({
        id: relativePath.replace(/\\/g, '/'),
        url: toUrl(relativePath),
        name: entry,
        size: stats.size,
        mtime: stats.mtime,
        ext,
      })
    } else if (stats.isDirectory()) {
      scanDir(fullPath, files)
    }
  }
}

/**
 * 获取已上传的文件列表
 */
export function listUploadedFiles() {
  if (!existsSync(UPLOAD_DIR)) {
    return []
  }

  const files: Array<{
    id: string
    url: string
    name: string
    size: number
    mtime: Date
    ext: string
  }> = []
  scanDir(UPLOAD_DIR, files)

  files.sort((a, b) => new Date(b.mtime).getTime() - new Date(a.mtime).getTime())

  return files
}

/**
 * 删除上传的文件
 */
export async function deleteUploadedFile(fileId: string) {
  const filePath = resolve(UPLOAD_DIR, fileId)

  if (!filePath.startsWith(UPLOAD_DIR)) {
    throw new AppError(403, '非法文件路径')
  }

  if (!existsSync(filePath)) {
    throw new AppError(404, '文件不存在')
  }

  await unlink(filePath)
}