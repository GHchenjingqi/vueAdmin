/**
 * 用户管理 Controller
 *
 * 职责：仅做 HTTP 请求/响应编排，业务逻辑委托给 userService
 */
import type { Request, Response, NextFunction } from 'express'
import multer from 'multer'
import { existsSync, mkdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import * as userService from '../services/userService.js'
import { AppError } from '../middleware/errorHandler.js'
import { logOperation } from '../utils/logger.js'

/**
 * 获取用户列表（分页搜索）
 * GET /api/users
 */
export const list = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page = 1, pageSize = 10 } = req.query
    const result = await userService.listUsers(
      req.query as any,
      Number(page),
      Number(pageSize),
      req.user,
    )
    res.json({ code: 0, data: result })
  } catch (err) {
    next(err)
  }
}

/**
 * 获取单个用户
 * GET /api/users/:id
 */
export const getById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await userService.getUserById(Number(req.params.id), req.user)
    res.json({ code: 0, data: user })
  } catch (err) {
    next(err)
  }
}

/**
 * 创建用户
 * POST /api/users
 */
export const create = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await userService.createUser(req.body, req.user!)
    logOperation(req, '创建用户', `ID: ${result.id} 用户名 ${req.body.username}`,
      JSON.stringify({ id: result.id, ...req.body }))
    res.status(201).json({ code: 0, data: result, message: '创建成功' })
  } catch (err) {
    next(err)
  }
}

/**
 * 更新用户信息
 * PUT /api/users/:id
 */
export const update = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { changes, summary } = await userService.updateUser(Number(req.params.id), req.body, req.user!)
    logOperation(req, '更新用户', `ID: ${req.params.id} 用户名 ${req.body.username}`,
      JSON.stringify({ changes, summary }))
    res.json({ code: 0, message: '更新成功' })
  } catch (err) {
    next(err)
  }
}

/**
 * 修改密码（管理员重置 / 自助改密）
 * PUT /api/users/:id/password
 */
export const changePassword = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await userService.changePassword(Number(req.params.id), req.body)
    logOperation(req, '重置密码', `ID: ${req.params.id}`,
      JSON.stringify({ id: req.params.id }))
    res.json({ code: 0, data: result, message: result.password ? '密码已重置' : '密码修改成功' })
  } catch (err) {
    next(err)
  }
}

/**
 * 删除用户
 * DELETE /api/users/:id
 */
export const remove = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id, username } = await userService.deleteUser(Number(req.params.id), req.user)
    logOperation(req, '删除用户', `ID: ${id} 用户名 ${username}`, JSON.stringify({ id, username }))
    res.json({ code: 0, message: '删除成功' })
  } catch (err) {
    next(err)
  }
}

/**
 * 批量删除用户
 * POST /api/users/batch-delete
 */
export const batchRemove = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { ids } = req.body
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      throw new AppError(400, '请选择要删除的用户')
    }
    const result = await userService.batchDeleteUsers(ids, req.user)
    logOperation(req, '批量删除用户', `删除 ${result.count} 条`, JSON.stringify({ ids }))
    res.json({ code: 0, data: { count: result.count }, message: `成功删除 ${result.count} 条` })
  } catch (err) {
    next(err)
  }
}

/**
 * 导出用户列表 Excel
 * GET /api/users/export
 */
export const exportUsers = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { buffer, filename } = await userService.exportUsers(req.user)
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename=${encodeURIComponent(filename)}`)
    res.send(buffer)
    logOperation(req, '导出用户', `导出用户列表`)
  } catch (err) {
    next(err)
  }
}

// ==================== 导入相关 ====================

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const IMPORT_TEMP_DIR = resolve(__dirname, '../uploads/import')

function ensureImportDir() {
  if (!existsSync(IMPORT_TEMP_DIR)) {
    mkdirSync(IMPORT_TEMP_DIR, { recursive: true })
  }
}

const importUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      ensureImportDir()
      cb(null, IMPORT_TEMP_DIR)
    },
    filename: (_req, file, cb) => {
      const ext = file.originalname.split('.').pop()
      cb(null, `import-${Date.now()}.${ext}`)
    },
  }),
  fileFilter: (_req, file, cb) => {
    const ext = file.originalname.toLowerCase().split('.').pop()
    if (ext === 'xlsx' || ext === 'xls') {
      cb(null, true)
    } else {
      cb(new Error('仅支持 .xlsx 或 .xls 格式的 Excel 文件'))
    }
  },
  limits: { fileSize: 5 * 1024 * 1024 },
})

/**
 * 下载用户导入模板
 * GET /api/users/template
 */
export const downloadTemplate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const buffer = await userService.downloadTemplate()
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename=${encodeURIComponent('用户导入模板.xlsx')}`)
    res.send(buffer)
  } catch (err) {
    next(err)
  }
}

/**
 * 导入用户（Excel 批量导入）
 * POST /api/users/import
 */
export const importUsers = async (req: Request, res: Response, next: NextFunction) => {
  const singleUpload = importUpload.single('file')
  singleUpload(req, res, async (err: any) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        return next(new AppError(400, '文件大小不能超过 5MB'))
      }
      return next(new AppError(400, err.message))
    }
    if (!req.file) {
      return next(new AppError(400, '请选择要导入的文件'))
    }

    try {
      const result = await userService.importUsers(req.file.path, req.user!)
      logOperation(req, '导入用户', `成功 ${result.success} 条，失败 ${result.failed.length} 条`)
      res.json({
        code: 0,
        data: result,
        message: `导入完成：成功 ${result.success} 条，失败 ${result.failed.length} 条`,
      })
    } catch (e) {
      next(e)
    }
  })
}