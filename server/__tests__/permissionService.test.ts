// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockUserRoleFindAll, mockRoleFindAll, mockRoleMenuFindAll, mockMenuFindAll } = vi.hoisted(() => ({
  mockUserRoleFindAll: vi.fn(),
  mockRoleFindAll: vi.fn(),
  mockRoleMenuFindAll: vi.fn(),
  mockMenuFindAll: vi.fn(),
}))

vi.mock('../models/UserRole.js', () => ({ default: { findAll: mockUserRoleFindAll } }))
vi.mock('../models/Role.js', () => ({ default: { findAll: mockRoleFindAll } }))
vi.mock('../models/RoleMenu.js', () => ({ default: { findAll: mockRoleMenuFindAll } }))
vi.mock('../models/Menu.js', () => ({ default: { findAll: mockMenuFindAll } }))
vi.mock('../config/database.js', () => ({ default: {} }))

import { getUserGrants, invalidateUserGrants, invalidateAllGrants } from '../services/permissionService.js'

describe('getUserGrants', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('无角色时返回空授权', async () => {
    mockUserRoleFindAll.mockResolvedValue([])
    await expect(getUserGrants(1)).resolves.toEqual({ roleCodes: [], permissions: [] })
    expect(mockRoleFindAll).not.toHaveBeenCalled()
  })

  it('停用角色不参与授权计算', async () => {
    mockUserRoleFindAll.mockResolvedValue([{ roleId: 1 }, { roleId: 2 }])
    mockRoleFindAll.mockResolvedValue([
      { id: 1, code: 'ops', status: 1 },
      { id: 2, code: 'legacy', status: 0 },
    ])
    mockRoleMenuFindAll.mockResolvedValue([{ menuId: 10 }])
    mockMenuFindAll.mockResolvedValue([{ permission: 'system:user:add' }])

    const grants = await getUserGrants(1)
    expect(grants.roleCodes).toEqual(['ops'])
    const where = mockRoleMenuFindAll.mock.calls[0][0] as { where: { roleId: unknown } }
    expect(where.where.roleId).toBeDefined()
  })

  it('角色无任何菜单时只返回角色码', async () => {
    mockUserRoleFindAll.mockResolvedValue([{ roleId: 1 }])
    mockRoleFindAll.mockResolvedValue([{ id: 1, code: 'ops', status: 1 }])
    mockRoleMenuFindAll.mockResolvedValue([])

    await expect(getUserGrants(1)).resolves.toEqual({ roleCodes: ['ops'], permissions: [] })
    expect(mockMenuFindAll).not.toHaveBeenCalled()
  })

  it('权限码去重并剔除空标识', async () => {
    mockUserRoleFindAll.mockResolvedValue([{ roleId: 1 }, { roleId: 2 }])
    mockRoleFindAll.mockResolvedValue([
      { id: 1, code: 'ops', status: 1 },
      { id: 2, code: 'auditor', status: 1 },
    ])
    mockRoleMenuFindAll.mockResolvedValue([{ menuId: 1 }, { menuId: 2 }, { menuId: 3 }])
    mockMenuFindAll.mockResolvedValue([{ permission: 'system:user:export' }, { permission: 'system:user:export' }, { permission: null }])

    await expect(getUserGrants(1)).resolves.toEqual({ roleCodes: ['ops', 'auditor'], permissions: ['system:user:export'] })
  })

  it('全部角色停用时视为无授权', async () => {
    mockUserRoleFindAll.mockResolvedValue([{ roleId: 1 }])
    mockRoleFindAll.mockResolvedValue([{ id: 1, code: 'legacy', status: 0 }])

    await expect(getUserGrants(1)).resolves.toEqual({ roleCodes: [], permissions: [] })
  })
})

describe('授权缓存失效', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('失效单个用户与全量失效均不抛错', async () => {
    expect(() => invalidateUserGrants(1)).not.toThrow()
    await expect(invalidateAllGrants()).resolves.toBeUndefined()
  })

  it('失效后重新查库（测试环境缓存自动禁用，每次均走 loader）', async () => {
    mockUserRoleFindAll.mockResolvedValue([])
    await getUserGrants(42)
    await getUserGrants(42)
    expect(mockUserRoleFindAll).toHaveBeenCalledTimes(2)
  })
})
