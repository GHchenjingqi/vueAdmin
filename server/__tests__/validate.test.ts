// @vitest-environment node
/**
 * validate 中间件单元测试
 */
import { describe, it, expect, vi } from 'vitest'
import { z } from 'zod'
import { validate } from '../middleware/validate.js'

function createMockReqRes(target: 'body' | 'query' | 'params', data: any) {
  const req: any = { body: {}, query: {}, params: {} }
  req[target] = data
  const res: any = {}
  const next = vi.fn()
  return { req, res, next }
}

describe('validate middleware', () => {
  it('should pass valid body data', () => {
    const schema = z.object({ username: z.string().min(2) })
    const { req, res, next } = createMockReqRes('body', { username: 'admin' })
    validate(schema, 'body')(req, res, next)
    expect(next).toHaveBeenCalledOnce()
    expect(next).toHaveBeenCalledWith()
    expect(req.body.username).toBe('admin')
  })

  it('should reject invalid body data with 400', () => {
    const schema = z.object({ username: z.string().min(2) })
    const { req, res, next } = createMockReqRes('body', { username: 'a' })
    validate(schema, 'body')(req, res, next)
    expect(next).toHaveBeenCalledOnce()
    const err = next.mock.calls[0][0]
    expect(err.statusCode).toBe(400)
    expect(err.message).toContain('username')
  })

  it('should pass valid query params', () => {
    const schema = z.object({ page: z.coerce.number().int().positive() })
    const { req, res, next } = createMockReqRes('query', { page: '1' })
    validate(schema, 'query')(req, res, next)
    expect(next).toHaveBeenCalledWith()
    expect(req.query.page).toBe(1)
  })

  it('should reject invalid query params', () => {
    const schema = z.object({ page: z.coerce.number().int().positive() })
    const { req, res, next } = createMockReqRes('query', { page: '-1' })
    validate(schema, 'query')(req, res, next)
    const err = next.mock.calls[0][0]
    expect(err.statusCode).toBe(400)
  })

  it('should pass valid URL params', () => {
    const schema = z.object({ id: z.coerce.number().int().positive() })
    const { req, res, next } = createMockReqRes('params', { id: '42' })
    validate(schema, 'params')(req, res, next)
    expect(next).toHaveBeenCalledWith()
    expect(req.params.id).toBe(42)
  })

  it('should reject missing required fields', () => {
    const schema = z.object({ email: z.string().email() })
    const { req, res, next } = createMockReqRes('body', {})
    validate(schema, 'body')(req, res, next)
    const err = next.mock.calls[0][0]
    expect(err.statusCode).toBe(400)
    expect(err.message).toContain('email')
  })

  it('should pass ZodError with 400 for non-Zod errors', () => {
    const schema = z.object({ name: z.string() })
    const { req, res, next } = createMockReqRes('body', { name: 123 })
    validate(schema, 'body')(req, res, next)
    const err = next.mock.calls[0][0]
    expect(err.statusCode).toBe(400)
  })
})