// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockGetUserGrants } = vi.hoisted(() => ({ mockGetUserGrants: vi.fn() }))

vi.mock('../services/permissionService.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/permissionService.js')>()
  return { ...actual, getUserGrants: mockGetUserGrants }
})

import { requirePermission } from '../middleware/permissionGuard.js'
import { isAdminGrants } from '../services/permissionService.js'

function makeRes() {
  return { status: vi.fn().mockReturnThis(), json: vi.fn() }
}

describe('requirePermission', () => {
  let res: any
  let next: any

  beforeEach(() => {
    vi.clearAllMocks()
    res = makeRes()
    next = vi.fn()
  })

  it('未登录返回 401', async () => {
    await requirePermission('system:user:add')({} as any, res, next)
    expect(res.status).toHaveBeenCalledWith(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('平台超管直接放行，不查授权', async () => {
    const req = { user: { id: 9, isPlatformAdmin: true } } as any
    await requirePermission('system:user:add')(req, res, next)
    expect(next).toHaveBeenCalled()
    expect(mockGetUserGrants).not.toHaveBeenCalled()
  })

  it('管理角色码放行', async () => {
    mockGetUserGrants.mockResolvedValue({ roleCodes: ['admin'], permissions: [] })
    const req = { user: { id: 2 } } as any
    await requirePermission('system:user:add')(req, res, next)
    expect(next).toHaveBeenCalled()
  })

  it('拥有任一声明码放行（any-of）', async () => {
    mockGetUserGrants.mockResolvedValue({ roleCodes: ['auditor'], permissions: ['system:user:export'] })
    const req = { user: { id: 3 } } as any
    await requirePermission('system:user:add', 'system:user:export')(req, res, next)
    expect(next).toHaveBeenCalled()
  })

  it('无对应码返回 403 并提示缺失权限', async () => {
    mockGetUserGrants.mockResolvedValue({ roleCodes: ['user'], permissions: ['message:publish:send'] })
    const req = { user: { id: 4 } } as any
    await requirePermission('system:user:delete')(req, res, next)
    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(403)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 403, message: expect.stringContaining('system:user:delete') }))
  })

  it('授权解析失败时不放行（失败关闭）', async () => {
    mockGetUserGrants.mockRejectedValue(new Error('db down'))
    const req = { user: { id: 5 } } as any
    const errNext = vi.fn()
    await requirePermission('system:user:add')(req, res, errNext)
    expect(res.status).not.toHaveBeenCalled()
    expect(errNext).toHaveBeenCalledWith(expect.any(Error))
  })

  it('按用户 id 解析授权', async () => {
    mockGetUserGrants.mockResolvedValue({ roleCodes: ['x'], permissions: ['system:user:add'] })
    await requirePermission('system:user:add')({ user: { id: 77 } } as any, res, next)
    expect(mockGetUserGrants).toHaveBeenCalledWith(77)
  })
})

describe('isAdminGrants', () => {
  it('isPlatformAdmin=true 视为管理员', () => {
    expect(isAdminGrants({ roleCodes: [], permissions: [] }, true)).toBe(true)
  })

  it('super_admin 角色码视为管理员', () => {
    expect(isAdminGrants({ roleCodes: ['super_admin'], permissions: [] }, false)).toBe(true)
  })

  it('普通角色码不因拥有权限码而成为管理员', () => {
    expect(isAdminGrants({ roleCodes: ['ops'], permissions: ['system:user:add'] }, undefined)).toBe(false)
  })
})
