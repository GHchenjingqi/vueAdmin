/**
 * 慢查询日志中间件
 *
 * 记录处理时间超过阈值的 HTTP 请求，帮助发现性能瓶颈。
 *
 * 配置：
 * - SLOW_QUERY_THRESHOLD_MS：慢查询阈值（毫秒），默认 1000ms
 *
 * 日志格式：
 * [SLOW] GET /api/users/list 1523ms
 */
import { Request, Response, NextFunction } from 'express'
import { logWarn } from '../utils/fileLogger.js'

const DEFAULT_THRESHOLD_MS = 1000

export function slowQueryLogMiddleware(
  thresholdMs: number = DEFAULT_THRESHOLD_MS
): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction): void => {
    const start = Date.now()

    // 监听响应完成事件
    res.on('finish', () => {
      const duration = Date.now() - start
      if (duration > thresholdMs) {
        logWarn(
          `[SLOW] ${req.method} ${req.originalUrl} ${duration}ms - ${res.statusCode}`
        )
      }
    })

    next()
  }
}