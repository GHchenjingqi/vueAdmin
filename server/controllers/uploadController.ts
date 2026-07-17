/**
 * 文件上传管理控制器
 * @module uploadController
 */

import { existsSync } from 'fs'
import { resolve, dirname, extname, relative } from 'path'
import { fileURLToPath } from 'url'
import { mkdir } from 'fs/promises'
import multer from 'multer'
import { AppError } from '../middleware/errorHandler.js'
import { validateUploadFiles } from '../middleware/uploadValidator.js'
import { listUploadedFiles, deleteUploadedFile } from '../services/uploadService.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const UPLOAD_DIR = resolve(__dirname, '../uploads')

let dirReady = false

/**
 * 确保上传目录存在
 */
async function ensureUploadDir() {
  if (!dirReady) {
    if (!existsSync(UPLOAD_DIR)) {
      await mkdir(UPLOAD_DIR, { recursive: true })
    }
    dirReady = true
  }
}

/**
 * 生成唯一文件名
 */
function generateFileName(originalName: string) {
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 8)
  const ext = extname(originalName).toLowerCase()
  return `${timestamp}-${random}${ext}`
}

/**
 * 将文件相对路径转为 URL
 */
function toUrl(relativePath: string) {
  return '/uploads/' + relativePath.replace(/\\/g, '/')
}

const BLOCKED_EXTENSIONS = [
  '.exe', '.bat', '.cmd', '.sh', '.msi', '.reg', '.vbs', '.ps1',
  '.jar', '.dll', '.scr', '.com', '.pif', '.vb', '.wsf', '.hta',
]

const fileFilter = (_req: unknown, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const ext = extname(file.originalname).toLowerCase()
  if (BLOCKED_EXTENSIONS.includes(ext)) {
    cb(new Error('禁止上传可执行文件或脚本文件'))
  } else {
    cb(null, true)
  }
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    ensureUploadDir().then(() => cb(null, UPLOAD_DIR))
  },
  filename: (_req, file, cb) => {
    cb(null, generateFileName(file.originalname))
  },
})

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 100 * 1024 * 1024 },
})

/**
 * 处理 multer 错误
 */
function handleMulterError(err: Error, next: (err: unknown) => void) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return next(new AppError(400, '文件大小不能超过 100MB'))
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return next(new AppError(400, '单次最多上传20个文件'))
    }
    return next(new AppError(400, err.message))
  }
  next(new AppError(400, err.message))
}

/**
 * 上传文件
 * POST /api/upload
 */
export const uploadFile = async (req, res, next) => {
  await ensureUploadDir()

  const isBatch = req.headers['x-upload-batch'] === 'true'

  if (isBatch) {
    const multiUpload = upload.array('files', 20)
    return multiUpload(req, res, async (err) => {
      if (err) return handleMulterError(err, next)
      if (!req.files || req.files.length === 0) {
        return next(new AppError(400, '请选择要上传的文件'))
      }
      try {
        validateUploadFiles(req)
      } catch (e) {
        return next(e)
      }
      const files = (req.files as Express.Multer.File[]).map((f) => {
        const relPath = relative(UPLOAD_DIR, f.path)
        return {
          id: relPath.replace(/\\/g, '/'),
          url: toUrl(relPath),
          name: f.originalname,
          size: f.size,
          mimetype: f.mimetype,
        }
      })
      return res.json({ code: 0, data: files, message: `成功上传 ${files.length} 个文件` })
    })
  }

  const singleUpload = upload.single('file')
  singleUpload(req, res, (err) => {
    if (err) return handleMulterError(err, next)
    if (!req.file) {
      return next(new AppError(400, '请选择要上传的文件'))
    }
    try {
      validateUploadFiles(req)
    } catch (e) {
      return next(e)
    }
    const relPath = relative(UPLOAD_DIR, req.file.path)
    res.json({
      code: 0,
      data: {
        id: relPath.replace(/\\/g, '/'),
        url: toUrl(relPath),
        name: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype,
      },
      message: '上传成功',
    })
  })
}

/**
 * 获取已上传的文件列表
 */
export const listFiles = (_req, res, next) => {
  try {
    const data = listUploadedFiles()
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}

/**
 * 删除上传的文件
 */
export const removeFile = async (req, res, next) => {
  try {
    await deleteUploadedFile(req.params.id || '')
    res.json({ code: 0, message: '删除成功' })
  } catch (err) {
    if (err.code === 'ENOENT') {
      return next(new AppError(404, '文件不存在'))
    }
    next(err)
  }
}