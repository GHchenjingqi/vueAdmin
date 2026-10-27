import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.mock 工厂会被提升，需用 vi.hoisted 声明其中引用的 mock（否则访问顶层 const 会 TDZ 报错）
const { mockCheckQuota } = vi.hoisted(() => ({ mockCheckQuota: vi.fn() }))
vi.mock('../modules/billing/services/usageService.js', () => ({
  checkQuota: mockCheckQuota,
}))

vi.mock('../config/database.js', () => ({ default: {} }))

import { quotaGuard } from '../modules/billing/middleware/quotaGuard.js'

describe('quotaGuard', () => {
  let req: any, res: any, next: any

  beforeEach(() => {
    vi.clearAllMocks()
    req = { user: { tenantId: 1 } }
    res = { status: vi.fn().mockReturnThis(), json: vi.fn() }
    next = vi.fn()
  })

  it('无租户时返回 403', async () => {
    req.user = {}
    const guard = quotaGuard('users')
    await guard(req, res, next)
    expect(res.status).toHaveBeenCalledWith(403)
    expect(next).not.toHaveBeenCalled()
  })

  it('超限时返回 402', async () => {
    mockCheckQuota.mockResolvedValue({ allowed: false, used: 5, limit: 5 })
    const guard = quotaGuard('users')
    await guard(req, res, next)
    expect(res.status).toHaveBeenCalledWith(402)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 402, data: expect.objectContaining({ metric: 'users', used: 5, limit: 5 }) }))
    expect(next).not.toHaveBeenCalled()
  })

  it('未超限时放行', async () => {
    mockCheckQuota.mockResolvedValue({ allowed: true, used: 3, limit: 5 })
    const guard = quotaGuard('users')
    await guard(req, res, next)
    expect(next).toHaveBeenCalled()
  })
})