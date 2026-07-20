/**
 * 全局错误处理中间件
 * @module errorHandler
 */

import { type Request, type Response, type NextFunction } from 'express'
import { ValidationError as SequelizeValidationError, UniqueConstraintError } from 'sequelize'
import { logError } from '../utils/fileLogger.js'

/**
 * 自定义错误类，方便抛出带状态码的错误
 */
export class AppError extends Error {
  public statusCode: number

  constructor(statusCode: number, message: string) {
    super(message)
    this.statusCode = statusCode
    this.name = 'AppError'
  }
}

interface ErrorWithStatus extends Error {
  statusCode?: number
}

/**
 * 将底层错误分类为合适的 HTTP 状态码与可读信息。
 *
 * - Zod / 输入校验类错误：已通过 validate 中间件标记为 statusCode 400
 * - Sequelize 唯一约束冲突：映射为 409（便于前端提示“用户名已存在”等）
 * - Sequelize 其它校验错误：映射为 400
 * - 其余未明确状态码的错误：视为 500 服务器错误
 *
 * 返回 [statusCode, message]
 */
function classifyError(err: ErrorWithStatus): { statusCode: number; message: string } {
  // 已由上游（如 validate 中间件）标记了业务状态码
  if (err.statusCode && err.statusCode !== 500) {
    return { statusCode: err.statusCode, message: err.message || '请求失败' }
  }

  if (err instanceof UniqueConstraintError) {
    const detail = err.errors?.map((e) => e.message).join('; ') || err.message
    return { statusCode: 409, message: detail || '数据已存在，请勿重复创建' }
  }

  if (err instanceof SequelizeValidationError) {
    const detail = err.errors?.map((e) => e.message).join('; ') || err.message
    return { statusCode: 400, message: detail || '请求参数校验失败' }
  }

  return { statusCode: err.statusCode || 500, message: err.message || '服务器内部错误' }
}

/**
 * 全局错误处理中间件
 * 统一捕获并格式化错误响应
 */
const errorHandler = (err: ErrorWithStatus, req: Request | null, res: Response, _next: NextFunction): void => {
  // 写入文件日志
  const reqInfo = req ? `${req.method} ${req.originalUrl} | IP: ${req.ip}` : ''
  logError(err.message, err.stack, reqInfo)

  // 控制台输出
  console.error(`[${new Date().toISOString()}] Error:`, err.message)
  if (err.stack) console.error(err.stack)

  const { statusCode, message } = classifyError(err)

  // 生产环境对 500 服务器错误脱敏，避免泄露内部实现细节
  const safeMessage =
    process.env.NODE_ENV === 'production' && statusCode === 500 ? '服务器内部错误' : message

  res.status(statusCode).json({
    code: statusCode,
    message: safeMessage,
  })
}

export default errorHandler
