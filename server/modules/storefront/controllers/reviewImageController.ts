import { existsSync } from 'fs'
import { resolve, dirname, extname, basename } from 'path'
import { fileURLToPath } from 'url'
import { mkdir } from 'fs/promises'
import multer from 'multer'
import type { NextFunction, Request, Response } from 'express'
import { AppError } from '../../../middleware/errorHandler.js'
import { validateReviewImages, REVIEW_IMAGE_EXTENSIONS } from '../../../middleware/uploadValidator.js'
import { deleteUploadedFile } from '../../../services/uploadService.js'

/**
 * 评价图片上传（P4-T08）
 *
 * 与通用 /api/upload 分开：评价图片**仅允许图片类型**，并叠加分辨率校验，
 * 杜绝把文档/压缩包当作评价图、或超大分辨率图片耗尽资源。
 * 存储使用随机文件名（时间戳+随机串+原始扩展名），路径完全由服务端生成，
 * 不掺杂用户传入内容，天然防目录遍历；删除复用 uploadService.deleteUploadedFile
 * （已做 startsWith 校验，再次兜底防遍历）。
 */

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const REVIEW_UPLOAD_DIR = resolve(__dirname, '../../../uploads/reviews')

let dirReady = false
async function ensureDir(): Promise<void> {
  if (!dirReady) {
    if (!existsSync(REVIEW_UPLOAD_DIR)) await mkdir(REVIEW_UPLOAD_DIR, { recursive: true })
    dirReady = true
  }
}

function generateName(original: string): string {
  const ts = Date.now()
  const rand = Math.random().toString(36).substring(2, 8)
  return `${ts}-${rand}${extname(original).toLowerCase()}`
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    ensureDir()
      .then(() => cb(null, REVIEW_UPLOAD_DIR))
      .catch((e) => cb(e as Error, ''))
  },
  filename: (_req, file, cb) => cb(null, generateName(file.originalname)),
})

const imageFilter = (_req: unknown, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const ext = extname(file.originalname).toLowerCase()
  if (!REVIEW_IMAGE_EXTENSIONS.includes(ext)) {
    cb(new AppError(400, `评价仅支持图片文件，不支持 ${ext || '(无扩展名)'}`))
  } else {
    cb(null, true)
  }
}

const upload = multer({ storage, fileFilter: imageFilter, limits: { fileSize: 5 * 1024 * 1024, files: 9 } })

/** POST /reviews/images —— 上传评价图片（图片专用，含魔数 + 分辨率校验） */
export const uploadReviewImages = (req: Request, res: Response, next: NextFunction): void => {
  const multi = upload.array('images', 9)
  multi(req, res, (err: unknown) => {
    if (err) {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        return next(new AppError(400, '单张图片大小不能超过 5MB'))
      }
      return next(err instanceof AppError ? err : new AppError(400, (err as Error).message))
    }
    try {
      validateReviewImages(req as never)
    } catch (e) {
      return next(e)
    }
    const files = (req.files as Express.Multer.File[]) ?? []
    const data = mapReviewFiles(files)
    res.json({ code: 0, data, message: `成功上传 ${data.length} 张图片` })
  })
}

/** DELETE /reviews/images/:id —— 删除评价图片（id 为上传返回的 relative 路径，防遍历） */
export const removeReviewImage = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const raw = String((req.params as Record<string, unknown>).id ?? '')
    // 只取文件名部分，杜绝任何目录穿越；相对路径固定为 reviews/<name>
    const id = 'reviews/' + basename(raw)
    await deleteUploadedFile(id)
    res.json({ code: 0, message: '删除成功' })
  } catch (err) {
    next(err)
  }
}

/** 将已落盘的上传文件映射为对外结构（id 为 relative 路径，url 为 /uploads/...）；供测试与控制器复用 */
export function mapReviewFiles(files: Array<{ originalname: string; path: string; size: number; mimetype: string }>): Array<{
  id: string
  url: string
  name: string
  size: number
  mimetype: string
}> {
  return files.map((f) => {
    const name = basename(f.path)
    return { id: `reviews/${name}`, url: `/uploads/reviews/${name}`, name: f.originalname, size: f.size, mimetype: f.mimetype }
  })
}
