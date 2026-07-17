/**
 * 全局错误处理中间件
 * @module errorHandler
 */

import { Request, Response, NextFunction } from 'express'
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

  const statusCode = err.statusCode || 500
  const message = process.env.NODE_ENV === 'production' && statusCode === 500
    ? '服务器内部错误'
    : err.message || '服务器内部错误'
  res.status(statusCode).json({
    code: statusCode,
    message,
  })
}

export default errorHandler