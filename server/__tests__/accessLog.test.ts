// @vitest-environment node
/**
 * accessLog 中间件单元测试
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockLogAccess = vi.fn()

vi.mock('../utils/fileLogger.js', () => ({
  logAccess: mockLogAccess,
}))

const accessLog = (await import('../middleware/accessLog.js')).default

describe('accessLog middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should call next()', () => {
    const req: any = {
      method: 'GET',
      originalUrl: '/api/users',
      ip: '127.0.0.1',
      headers: { 'user-agent': 'test-agent' },
    }
    const res: any = {
      statusCode: 200,
      end: vi.fn(),
    }
    const next = vi.fn()

    accessLog(req, res, next)

    expect(next).toHaveBeenCalled()
  })

  it('should log access on res.end', () => {
    const req: any = {
      method: 'POST',
      originalUrl: '/api/login',
      ip: '192.168.1.1',
      headers: { 'user-agent': 'Mozilla/5.0' },
    }
    const originalEnd = vi.fn()
    const res: any = {
      statusCode: 201,
      end: originalEnd,
    }
    const next = vi.fn()

    accessLog(req, res, next)

    res.end('response body')

    expect(mockLogAccess).toHaveBeenCalledWith(
      'POST',
      '/api/login',
      201,
      expect.any(Number),
      '192.168.1.1',
      'Mozilla/5.0',
    )
    expect(originalEnd).toHaveBeenCalledWith('response body')
  })

  it('should call original end with spread args', () => {
    const req: any = {
      method: 'DELETE',
      originalUrl: '/api/users/1',
      ip: '::1',
      headers: {},
    }
    const originalEnd = vi.fn()
    const res: any = {
      statusCode: 204,
      end: originalEnd,
    }
    const next = vi.fn()

    accessLog(req, res, next)

    res.end('chunk1', 'chunk2')

    expect(mockLogAccess).toHaveBeenCalledWith(
      'DELETE',
      '/api/users/1',
      204,
      expect.any(Number),
      '::1',
      undefined,
    )
    expect(originalEnd).toHaveBeenCalledWith('chunk1', 'chunk2')
  })
})