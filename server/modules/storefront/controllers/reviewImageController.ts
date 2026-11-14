import { existsSync, unlinkSync } from 'fs'
import { resolve, dirname, extname, basename } from 'path'
import { fileURLToPath } from 'url'
import { mkdir } from 'fs/promises'
import multer from 'multer'
import type { NextFunction, Request, Response } from 'express'
import { AppError } from '../../../middleware/errorHandler.js'
import { validateReviewImages, REVIEW_IMAGE_EXTENSIONS } from '../../../middleware/uploadValidator.js'
import { deleteUploadedFile } from '../../../services/uploadService.js'
import { checkKeyedRateLimit } from '../../../middleware/rateLimiter.js'

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

// ————————————————————————————————————————————————
// 速率限制（P4-T08 安全加固）
//
// 评价图片上传/删除挂在 storefront 公开路由：无 admin 鉴权、无顾客登录要求。
// 此前两个端点**完全无节流**，导致两类真实缺陷：
//  1) CWE-770：未登录者可持续上传图片且图片与评价无绑定、无清理，磁盘被永久堆积 → DoS；
//  2) CWE-639：任意匿名者凭 reviews/<name> 即可删除他人/已公开的评价图（IDOR）。
// 复用既有 checkKeyedRateLimit（登录/支付凭据限流同款），按「动作 + 客户端 IP」
// 计桶；Redis 不可用时自动降级内存计数，多实例下由 Redis 共享计数。
// ————————————————————————————————————————————————
const RATE_WINDOW_MS = 10 * 60 * 1000 // 10 分钟窗口
const RATE_MAX_UPLOAD = 20 // 单 IP 窗口内最多上传次数
const RATE_MAX_DELETE = 30 // 单 IP 窗口内最多删除次数

/** 取客户端 IP（兼容 x-forwarded-for 与直连），限流键基础 */
function clientIp(req: Request): string {
  const xff = req.headers['x-forwarded-for']
  const first = Array.isArray(xff) ? xff[0] : (xff as string | undefined)?.split(',')[0]?.trim()
  return first || req.ip || 'unknown'
}

function reviewImgRateKey(req: Request, action: 'upload' | 'delete'): string {
  return `rate:reviewimg:${action}:${clientIp(req)}`
}

/** 命中限流时返回 429；返回 true 表示已拦截（调用方应 return） */
function rateLimited(res: Response, result: { allowed: boolean; retryAfter?: number }): boolean {
  if (result.allowed) return false
  res.status(429).json({
    code: 429,
    message: '操作过于频繁，请稍后再试',
    retryAfter: result.retryAfter ?? Math.ceil(RATE_WINDOW_MS / 1000),
  })
  return true
}

/** multer 错误时已部分落盘的文件清理，避免孤儿文件 */
function cleanupMulterFiles(req: Request): void {
  const files = (req.files as Express.Multer.File[]) ?? []
  for (const f of files) {
    if (f?.path && existsSync(f.path)) {
      try {
        unlinkSync(f.path)
      } catch {
        // 忽略清理失败
      }
    }
  }
}

/** POST /reviews/images —— 上传评价图片（图片专用，含魔数 + 分辨率校验） */
export const uploadReviewImages = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (rateLimited(res, await checkKeyedRateLimit(reviewImgRateKey(req, 'upload'), RATE_WINDOW_MS, RATE_MAX_UPLOAD))) {
      return
    }
  } catch (e) {
    return next(e)
  }
  const multi = upload.array('images', 9)
  multi(req, res, (err: unknown) => {
    if (err) {
      // multer 错误（超限/类型被拒）时已落盘的文件一并清理，杜绝孤儿文件堆积
      cleanupMulterFiles(req)
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
    if (rateLimited(res, await checkKeyedRateLimit(reviewImgRateKey(req, 'delete'), RATE_WINDOW_MS, RATE_MAX_DELETE))) {
      return
    }
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
