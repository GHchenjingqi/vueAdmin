// @vitest-environment node
/**
 * authMiddleware 中间件单元测试
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import jwt from 'jsonwebtoken'

// Mock onlineUsers
vi.mock('../utils/onlineUsers.js', () => ({
  isUserKicked: vi.fn(() => false),
  updateUserActivity: vi.fn(),
  removeOnlineUser: vi.fn(),
}))

// 子树解析要查库：这里只关心中间件是否正确地「按需、且在异步后放行」
const { mockHydrate } = vi.hoisted(() => ({
  mockHydrate: vi.fn(async (user: any) => {
    user.deptIds = [user.deptId, 111]
  }),
}))
vi.mock('../utils/dataScope.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  hydrateRequestScope: mockHydrate,
}))

const { authMiddleware } = await import('../middleware/auth.js')
const config = (await import('../config/index.js')).default

describe('authMiddleware', () => {
  let validToken: string

  beforeEach(() => {
    vi.clearAllMocks()
    validToken = jwt.sign({ id: 1, username: 'admin', nickname: '管理员' }, config.jwt.secret, { expiresIn: '1h' })
  })

  it('should reject request without Authorization header', () => {
    const req: any = { headers: {} }
    const res: any = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    }
    const next = vi.fn()

    authMiddleware(req, res, next)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 401, message: '未提供认证令牌' }))
    expect(next).not.toHaveBeenCalled()
  })

  it('should reject request without Bearer prefix', () => {
    const req: any = { headers: { authorization: 'Token abc123' } }
    const res: any = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    }
    const next = vi.fn()

    authMiddleware(req, res, next)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('should reject invalid token', () => {
    const req: any = { headers: { authorization: 'Bearer invalid_token' } }
    const res: any = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    }
    const next = vi.fn()

    authMiddleware(req, res, next)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 401, message: '无效的认证令牌' }))
  })

  it('should reject expired token', () => {
    const expiredToken = jwt.sign({ id: 1, username: 'admin' }, config.jwt.secret, { expiresIn: '0s' })
    const req: any = { headers: { authorization: `Bearer ${expiredToken}` } }
    const res: any = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    }
    const next = vi.fn()

    authMiddleware(req, res, next)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 401, expired: true }))
  })

  it('should pass valid token and call next', () => {
    const req: any = {
      headers: { authorization: `Bearer ${validToken}`, 'x-forwarded-for': '127.0.0.1', 'user-agent': 'test' },
      socket: { remoteAddress: '127.0.0.1' },
    }
    const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() }
    const next = vi.fn()

    authMiddleware(req, res, next)

    expect(next).toHaveBeenCalledOnce()
    expect(req.user).toBeDefined()
    expect(req.user.id).toBe(1)
    expect(req.user.username).toBe('admin')
  })

  it('should reject kicked user', async () => {
    const { isUserKicked } = await import('../utils/onlineUsers.js')
    vi.mocked(isUserKicked).mockReturnValue(true)

    const req: any = {
      headers: { authorization: `Bearer ${validToken}` },
      socket: { remoteAddress: '127.0.0.1' },
    }
    const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() }
    const next = vi.fn()

    authMiddleware(req, res, next)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 401, kicked: true }))
    expect(next).not.toHaveBeenCalled()
  })

  describe('dataScope=3 子树补齐', () => {
    const scopeToken = (payload: Record<string, unknown>) =>
      jwt.sign({ id: 2, username: 'lead', nickname: '主管', ...payload }, config.jwt.secret, { expiresIn: '1h' })

    // 上一个用例把 isUserKicked 置为 true，且 clearAllMocks 不会清掉该实现
    beforeEach(async () => {
      const { isUserKicked } = await import('../utils/onlineUsers.js')
      vi.mocked(isUserKicked).mockReturnValue(false)
    })

    it('本级及以下：解析子树后才放行，且 req.user 带上可见部门', async () => {
      const req: any = { headers: { authorization: `Bearer ${scopeToken({ deptId: 11, dataScope: 3, tenantId: 1 })}` }, socket: { remoteAddress: '1' } }
      const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() }
      const next = vi.fn()

      authMiddleware(req, res, next)
      await Promise.resolve()
      await Promise.resolve()

      expect(mockHydrate).toHaveBeenCalledTimes(1)
      expect(next).toHaveBeenCalledOnce()
      expect(req.user.deptIds).toEqual([11, 111])
    })

    it('仅本部门：不查库，同步放行', () => {
      const req: any = { headers: { authorization: `Bearer ${scopeToken({ deptId: 11, dataScope: 2, tenantId: 1 })}` }, socket: { remoteAddress: '1' } }
      const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() }
      const next = vi.fn()

      authMiddleware(req, res, next)

      expect(mockHydrate).not.toHaveBeenCalled()
      expect(next).toHaveBeenCalledOnce()
    })
  })
})
