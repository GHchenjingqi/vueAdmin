/**
 * 请求指标中间件（P4-T13）
 *
 * 记录每个请求的处理耗时与状态码：
 * - api_latency_ms：Storefront API 延迟样本（供 P95 告警）
 * - ssr_error_rate：SSR/页面 5xx 错误率（gauge，0..1），按最近窗口滚动统计
 * 仅观测 /api 与 /api/storefront 请求，避免静态资源噪声。
 */
import type { NextFunction, Request, Response } from 'express'
import * as monitoring from '../modules/storefront/services/monitoringService.js'

const WINDOW = 1000 // 记录最近 1000 个观测样本
let totals = 0
let errors = 0
let windowTotal = 0
let windowErrors = 0
let windowStart = Date.now()
const windowMs = 5 * 60 * 1000

function record(status: number, durationMs: number): void {
  totals += 1
  windowTotal += 1
  if (status >= 500) {
    errors += 1
    windowErrors += 1
  }
  // 窗口滚动（每 5 分钟归零重计）
  if (Date.now() - windowStart > windowMs) {
    windowStart = Date.now()
    windowTotal = 0
    windowErrors = 0
  }
  const rate = windowTotal > 0 ? windowErrors / windowTotal : 0
  monitoring.setGauge('ssr_error_rate', Number(rate.toFixed(4)))
}

export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const path = req.path ?? req.originalUrl ?? ''
  if (!path.startsWith('/api')) {
    next()
    return
  }
  const start = Date.now()
  const originalEnd = res.end.bind(res)
  res.end = function (...args: unknown[]): ReturnType<typeof originalEnd> {
    const duration = Date.now() - start
    const status = res.statusCode
    record(status, duration)
    monitoring.recordLatency('api_latency_ms', duration)
    if (req.originalUrl && req.originalUrl.includes('/storefront')) {
      monitoring.recordLatency('storefront_api_latency_ms', duration)
    }
    return originalEnd(...args as Parameters<typeof originalEnd>)
  }
  next()
}

/** 返回统计（测试/看板） */
export function stats(): { total: number; errors: number; rate: number } {
  return { total: totals, errors, rate: windowTotal > 0 ? windowErrors / windowTotal : 0 }
}
