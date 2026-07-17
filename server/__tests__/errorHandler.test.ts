// @vitest-environment node
/**
 * errorHandler 中间件单元测试
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AppError } from '../middleware/errorHandler.js'

// Mock fileLogger
vi.mock('../utils/fileLogger.js', () => ({
  logError: vi.fn(),
}))

// 动态导入 errorHandler（必须在 vi.mock 之后）
const errorHandler = (await import('../middleware/errorHandler.js')).default

describe('errorHandler middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    process.env.NODE_ENV = 'development'
  })

  it('should return original error message in development', () => {
    const err = new Error('Something went wrong')
    const req = { method: 'GET', originalUrl: '/api/test', ip: '127.0.0.1' }
    const res: any = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    }
    const next = vi.fn()

    errorHandler(err, req, res, next)

    expect(res.status).toHaveBeenCalledWith(500)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 500, message: 'Something went wrong' })
    )
  })

  it('should return custom status code for AppError', () => {
    const err = new AppError(403, 'Forbidden')
    const req = { method: 'GET', originalUrl: '/api/admin', ip: '127.0.0.1' }
    const res: any = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    }
    const next = vi.fn()

    errorHandler(err, req, res, next)

    expect(res.status).toHaveBeenCalledWith(403)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 403, message: 'Forbidden' })
    )
  })

  it('should hide error details in production', () => {
    process.env.NODE_ENV = 'production'
    const err = new Error('Sensitive database error')
    const req = { method: 'POST', originalUrl: '/api/data', ip: '127.0.0.1' }
    const res: any = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    }
    const next = vi.fn()

    errorHandler(err, req, res, next)

    expect(res.status).toHaveBeenCalledWith(500)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: '服务器内部错误' })
    )
  })

  it('should handle 401 unauthorized', () => {
    const err = new AppError(401, '认证失败')
    const req = { method: 'GET', originalUrl: '/api/user', ip: '127.0.0.1' }
    const res: any = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    }
    const next = vi.fn()

    errorHandler(err, req, res, next)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 401, message: '认证失败' })
    )
  })

  it('should handle 429 rate limit', () => {
    const err = new AppError(429, '请求过于频繁')
    const req = { method: 'POST', originalUrl: '/api/auth/login', ip: '127.0.0.1' }
    const res: any = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    }
    const next = vi.fn()

    errorHandler(err, req, res, next)

    expect(res.status).toHaveBeenCalledWith(429)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 429, message: '请求过于频繁' })
    )
  })
})