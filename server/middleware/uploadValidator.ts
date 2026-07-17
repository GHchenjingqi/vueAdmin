/**
 * 文件上传服务端校验中间件
 * @module uploadValidator
 *
 * 设计要点：
 * 1. 白名单 + 黑名单双重校验（白名单为核心，黑名单为快速拒绝层）。
 * 2. 按扩展名推导分类（image / document / archive），分级大小限制。
 * 3. 图片额外做「魔数（文件头）」校验，防止修改扩展名 / MIME 欺骗。
 * 4. 校验失败时删除已写入磁盘的临时文件，避免产生孤儿文件。
 *
 * 说明：分类完全由扩展名推导，不信任客户端传入的 type 字段，
 * 避免前端未传 type 时把文档误判为图片而拒绝（见前端 uploadApi 不发送 type）。
 */

import { openSync, readSync, closeSync, unlinkSync, existsSync } from 'fs'
import { extname } from 'path'
import { AppError } from './errorHandler.js'

export type UploadCategory = 'image' | 'document' | 'archive'

interface CategoryRule {
  label: string
  extensions: string[]
  maxSize: number
}

/** 允许上传的文件类型与分级大小限制 */
const ALLOWED: Record<UploadCategory, CategoryRule> = {
  image: {
    label: '图片',
    extensions: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.ico', '.svg'],
    maxSize: 5 * 1024 * 1024, // 5MB
  },
  document: {
    label: '文档',
    extensions: [
      '.pdf',
      '.doc',
      '.docx',
      '.xls',
      '.xlsx',
      '.ppt',
      '.pptx',
      '.txt',
      '.md',
      '.csv',
    ],
    maxSize: 20 * 1024 * 1024, // 20MB
  },
  archive: {
    label: '压缩包',
    extensions: ['.zip', '.rar', '.7z', '.tar', '.gz'],
    maxSize: 100 * 1024 * 1024, // 100MB
  },
}

/** 扩展名 -> 分类 扁平映射 */
const EXT_CATEGORY: Record<string, UploadCategory> = {}
for (const [cat, rule] of Object.entries(ALLOWED)) {
  for (const ext of rule.extensions) EXT_CATEGORY[ext] = cat as UploadCategory
}

/** 读取文件头 N 字节（用于魔数校验） */
function readFileHeader(filePath: string, bytes = 16): Buffer {
  const fd = openSync(filePath, 'r')
  try {
    const buf = Buffer.alloc(bytes)
    const n = readSync(fd, buf, 0, bytes, 0)
    return buf.subarray(0, n)
  } finally {
    closeSync(fd)
  }
}

/** 校验图片文件的真实内容是否与扩展名匹配 */
function checkImageMagicBytes(ext: string, buf: Buffer): boolean {
  const head = buf.subarray(0, 8).toString('hex')
  switch (ext) {
    case '.png':
      return head.startsWith('89504e47')
    case '.jpg':
    case '.jpeg':
      return head.startsWith('ffd8ff')
    case '.gif':
      return head.startsWith('474946')
    case '.bmp':
      return head.startsWith('424d')
    case '.ico':
      return head.startsWith('00000100')
    case '.webp': {
      // RIFF....WEBP：偏移 0-3 为 RIFF，偏移 8-11 为 WEBP
      const full = buf.subarray(0, 12).toString('hex')
      return full.startsWith('52494646') && full.slice(16) === '57454250'
    }
    case '.svg': {
      // SVG 为文本格式，宽松校验：以 <?xml 或 <svg 开头
      const s = buf.subarray(0, 64).toString('utf8').trimStart().toLowerCase()
      return s.startsWith('<?xml') || s.includes('<svg')
    }
    default:
      return false
  }
}

function formatSize(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(0)}MB`
}

/** 所有允许扩展名（用于错误提示） */
const ALLOWED_EXTENSIONS = Object.values(ALLOWED)
  .flatMap((r) => r.extensions)
  .join(', ')

/**
 * 校验单个已上传文件对象（来自 multer 的 req.file / req.files[i]）。
 * 校验失败抛出 AppError，不负责清理磁盘文件。
 */
export function validateUploadFile(file: {
  originalname: string
  size: number
  path: string
}): void {
  const ext = extname(file.originalname).toLowerCase()

  const category = EXT_CATEGORY[ext]
  if (!category) {
    throw new AppError(
      400,
      `不支持的文件类型 ${ext || '(无扩展名)'}，允许的类型：${ALLOWED_EXTENSIONS}`,
    )
  }

  const rule = ALLOWED[category]
  if (file.size > rule.maxSize) {
    throw new AppError(
      400,
      `${rule.label}文件大小不能超过 ${formatSize(rule.maxSize)}，当前文件 ${formatSize(file.size)}`,
    )
  }

  // 图片额外做魔数校验（文档/压缩包按扩展名+大小即可，避免误伤合法文件）
  if (category === 'image' && existsSync(file.path)) {
    const header = readFileHeader(file.path, 16)
    if (!checkImageMagicBytes(ext, header)) {
      throw new AppError(400, '文件内容与扩展名不匹配，可能不是合法的图片文件')
    }
  }
}

/** 删除已写入磁盘的上传临时文件，避免校验失败时留下孤儿文件 */
function cleanupFiles(files: Array<{ path?: string }>): void {
  for (const f of files) {
    if (f.path && existsSync(f.path)) {
      try {
        unlinkSync(f.path)
      } catch {
        // 忽略清理失败
      }
    }
  }
}

/**
 * 从请求中收集已上传文件并逐个校验。
 * 任一文件不合法时：清理本次已写入的全部文件并抛出 AppError。
 * @param req Express 请求（包含 req.file 或 req.files）
 */
export function validateUploadFiles(req: {
  file?: { originalname: string; size: number; path: string } | null
  files?: Array<{ originalname: string; size: number; path: string }> | null
}): void {
  const files = req.files?.length
    ? req.files
    : req.file
      ? [req.file]
      : []

  if (files.length === 0) return // 无文件交给控制器处理（缺文件 400）

  try {
    for (const f of files) {
      validateUploadFile(f)
    }
  } catch (err) {
    cleanupFiles(files)
    throw err
  }
}

/**
 * Express 中间件形态（适用于把 multer 前置到路由层时使用）。
 * 若保留控制器内调用 multer 的现状，请直接用 validateUploadFiles(req)。
 */
export function uploadValidator(
  req: any,
  _res: any,
  next: (err?: unknown) => void,
): void {
  try {
    validateUploadFiles(req)
    next()
  } catch (err) {
    next(err)
  }
}
