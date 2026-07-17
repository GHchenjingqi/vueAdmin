/**
 * HTTP 访问日志中间件
 * @module accessLog
 */

import { logAccess } from '../utils/fileLogger.js'

/**
 * HTTP 访问日志中间件
 * 包装 res.end 方法，确保每次请求结束都被记录
 * 记录：方法、URL、状态码、响应耗时、IP、User-Agent
 * 
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const accessLog = (req, res, next) => {
  const start = Date.now()
  const { method, originalUrl } = req

  // 保存原始的 res.end 引用
  const originalEnd = res.end.bind(res)

  // 覆盖 res.end，在发送响应后记录日志
  res.end = function (...args) {
    const duration = Date.now() - start
    logAccess(
      method,
      originalUrl,
      res.statusCode,
      duration,
      req.ip,
      req.headers['user-agent'],
    )
    return originalEnd(...args)
  }

  next()
}

export default accessLog