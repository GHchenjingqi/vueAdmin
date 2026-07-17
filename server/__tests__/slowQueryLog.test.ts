// @vitest-environment node
/**
 * slowQueryLog 中间件单元测试
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'events'

const mockLogWarn = vi.fn()

vi.mock('../utils/fileLogger.js', () => ({
  logWarn: mockLogWarn,
}))

const { slowQueryLogMiddleware } = await import('../middleware/slowQueryLog.js')

describe('slowQueryLogMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function createRes() {
    const emitter = new EventEmitter()
    const res: any = emitter
    res.statusCode = 200
    return res
  }

  it('should call next()', () => {
    const middleware = slowQueryLogMiddleware()
    const req: any = { method: 'GET', originalUrl: '/api/test' }
    const res = createRes()
    const next = vi.fn()

    middleware(req, res, next)

    expect(next).toHaveBeenCalled()
  })

  it('should log slow query when duration exceeds default threshold (1000ms)', () => {
    const middleware = slowQueryLogMiddleware()
    const req: any = { method: 'GET', originalUrl: '/api/slow' }
    const res = createRes()
    const next = vi.fn()

    middleware(req, res, next)

    vi.advanceTimersByTime(1500)
    res.emit('finish')

    expect(mockLogWarn).toHaveBeenCalledWith(
      '[SLOW] GET /api/slow 1500ms - 200',
    )
  })

  it('should not log when duration is under threshold', () => {
    const middleware = slowQueryLogMiddleware()
    const req: any = { method: 'POST', originalUrl: '/api/fast' }
    const res = createRes()
    const next = vi.fn()

    middleware(req, res, next)

    vi.advanceTimersByTime(500)
    res.emit('finish')

    expect(mockLogWarn).not.toHaveBeenCalled()
  })

  it('should respect custom threshold', () => {
    const middleware = slowQueryLogMiddleware(500)
    const req: any = { method: 'PUT', originalUrl: '/api/update' }
    const res = createRes()
    const next = vi.fn()

    middleware(req, res, next)

    vi.advanceTimersByTime(600)
    res.emit('finish')

    expect(mockLogWarn).toHaveBeenCalledWith(
      '[SLOW] PUT /api/update 600ms - 200',
    )
  })

  it('should not log when duration equals threshold', () => {
    const middleware = slowQueryLogMiddleware(1000)
    const req: any = { method: 'GET', originalUrl: '/api/equal' }
    const res = createRes()
    const next = vi.fn()

    middleware(req, res, next)

    vi.advanceTimersByTime(1000)
    res.emit('finish')

    expect(mockLogWarn).not.toHaveBeenCalled()
  })
})