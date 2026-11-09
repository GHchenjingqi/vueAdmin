// @vitest-environment node
/**
 * 数据权限覆盖面测试（T02）
 *
 * 判据：受部门范围限制的角色，在部门与实例上同样看不到、也改不到范围外数据；
 * dataScope=3（本级及以下）必须在查询层真正展开成子树，而不是退化成仅本部门。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Op } from 'sequelize'

vi.mock('../models/Department.js', () => ({ default: { findAll: vi.fn(), findByPk: vi.fn(), findOne: vi.fn(), create: vi.fn(), destroy: vi.fn() } }))
vi.mock('../models/Role.js', () => ({ default: { findAll: vi.fn() } }))
vi.mock('../models/User.js', () => ({
  default: { findAll: vi.fn(), findAndCountAll: vi.fn(), findByPk: vi.fn(), findOne: vi.fn(), create: vi.fn(), destroy: vi.fn() },
}))
vi.mock('../models/UserRole.js', () => ({ default: { findAll: vi.fn(), destroy: vi.fn(), bulkCreate: vi.fn() } }))
vi.mock('../config/database.js', () => ({ default: {} }))
vi.mock('../utils/logger.js', () => ({ logOperation: vi.fn(), logLogin: vi.fn(), logLoginFailure: vi.fn() }))
vi.mock('../utils/exportExcel.js', () => ({ exportExcel: vi.fn() }))
vi.mock('../services/permissionService.js', () => ({ invalidateUserGrants: vi.fn() }))

const { scopedDeptIds, needsScopeHydration, hydrateRequestScope, applyDataScopeWhere } = await import('../utils/dataScope.js')
const deptService = await import('../services/deptService.js')
const userService = await import('../services/userService.js')
const Department = (await import('../models/Department.js')).default as any
const User = (await import('../models/User.js')).default as any

/** 部门树：1 → 11 → 111；2 为另一棵 */
const DEPT_ROWS = [
  { id: 1, parentId: 0, name: '总公司', status: 1, toJSON: () => ({ id: 1, parentId: 0, name: '总公司', status: 1 }) },
  { id: 11, parentId: 1, name: '研发部', status: 1, toJSON: () => ({ id: 11, parentId: 1, name: '研发部', status: 1 }) },
  { id: 111, parentId: 11, name: '后端组', status: 1, toJSON: () => ({ id: 111, parentId: 11, name: '后端组', status: 1 }) },
  { id: 2, parentId: 0, name: '市场部', status: 1, toJSON: () => ({ id: 2, parentId: 0, name: '市场部', status: 1 }) },
]

function mockDeptTree() {
  Department.findAll.mockResolvedValue(DEPT_ROWS)
}

beforeEach(() => {
  vi.clearAllMocks()
  mockDeptTree()
})

describe('scopedDeptIds', () => {
  it('dataScope=1 与旧 token（未携带范围）均不限制', () => {
    expect(scopedDeptIds({ dataScope: 1, deptId: 11 })).toBeNull()
    expect(scopedDeptIds({ deptId: 11 })).toBeNull()
    expect(scopedDeptIds(undefined)).toBeNull()
  })

  it('dataScope=2 只放开本部门', () => {
    expect(scopedDeptIds({ dataScope: 2, deptId: 11 })).toEqual([11])
  })

  it('dataScope=3 使用已解析的子树', () => {
    expect(scopedDeptIds({ dataScope: 3, deptId: 1, deptIds: [1, 11, 111] })).toEqual([1, 11, 111])
  })

  it('受限但没有任何部门时返回空集（调用方须给出空结果）', () => {
    expect(scopedDeptIds({ dataScope: 2 })).toEqual([])
  })
})

describe('dataScope=3 的子树解析', () => {
  it('仅 dataScope=3 且尚未解析才需要查库', () => {
    expect(needsScopeHydration({ dataScope: 3, deptId: 1 })).toBe(true)
    expect(needsScopeHydration({ dataScope: 2, deptId: 1 })).toBe(false)
    expect(needsScopeHydration({ dataScope: 1, deptId: 1 })).toBe(false)
    expect(needsScopeHydration({ dataScope: 3, deptId: 1, deptIds: [1, 11] })).toBe(false)
    expect(needsScopeHydration({ dataScope: 3 })).toBe(false)
  })

  it('补齐后 applyDataScopeWhere 真正按子树放行（而不是退化成仅本部门）', async () => {
    const user: any = { dataScope: 3, deptId: 11 }
    await hydrateRequestScope(user)

    expect(user.deptIds).toEqual([11, 111])

    const where: Record<string, unknown> = {}
    applyDataScopeWhere(where, user)
    expect((where.deptId as any)[Op.in]).toEqual([11, 111])
  })

  it('解析失败时保持不解析，由仅本部门兜底（宁可少看不可多看）', async () => {
    Department.findAll.mockRejectedValueOnce(new Error('db down'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const user: any = { dataScope: 3, deptId: 11 }

    await hydrateRequestScope(user)

    expect(user.deptIds).toBeUndefined()
    const where: Record<string, unknown> = {}
    applyDataScopeWhere(where, user)
    expect((where.deptId as any)[Op.in]).toEqual([11])
    warn.mockRestore()
  })
})

describe('deptService 数据权限', () => {
  const restricted = { dataScope: 3, deptId: 11, deptIds: [11, 111] }

  it('列表只返回可见子树', async () => {
    const tree = await deptService.listDepts(undefined, restricted)
    expect(tree.map((n: any) => n.id)).toEqual([11])
    expect(tree[0].children.map((c: any) => c.id)).toEqual([111])
  })

  it('不受限时返回整棵树', async () => {
    const tree = await deptService.listDepts(undefined, { dataScope: 1, deptId: 1 })
    expect(tree).toHaveLength(2)
  })

  it('下拉选项同样按范围裁剪', async () => {
    const tree = await deptService.getDeptOptions(restricted)
    expect(JSON.stringify(tree)).not.toContain('市场部')
  })

  it('详情对范围外部门返回 403', async () => {
    Department.findByPk.mockResolvedValue({ id: 2, parentId: 0, name: '市场部', toJSON: () => ({ id: 2 }) })
    await expect(deptService.getDeptById(2, restricted)).rejects.toThrow('无权访问该部门')
  })

  it('不能在别人的部门下建子部门', async () => {
    await expect(deptService.createDept({ parentId: 2, name: '越权部门' }, restricted)).rejects.toThrow('无权在该部门下创建子部门')
    expect(Department.create).not.toHaveBeenCalled()
  })

  it('受限用户不得新建顶级部门，管理员可以', async () => {
    await expect(deptService.createDept({ parentId: 0, name: '顶级' }, restricted)).rejects.toThrow('无权创建顶级部门')

    Department.create.mockResolvedValue({ id: 9, name: '顶级' } as any)
    const created = await deptService.createDept({ parentId: 0, name: '顶级' }, { dataScope: 1, deptId: 1 })
    expect(created.id).toBe(9)
  })

  it('可以在自己的子树内建子部门', async () => {
    Department.create.mockResolvedValue({ id: 112, name: '新组' } as any)
    const created = await deptService.createDept({ parentId: 11, name: '新组' }, restricted)
    expect(created).toEqual({ id: 112, name: '新组' })
  })

  it('改父级时新父级必须在范围内', async () => {
    Department.findByPk.mockResolvedValue({ id: 111, parentId: 11, name: '后端组', toJSON: () => ({ id: 111, parentId: 11, name: '后端组' }) })
    await expect(deptService.updateDept(111, { parentId: 2 }, restricted)).rejects.toThrow('无权将部门移至该上级部门')
  })

  it('不能删除别人的部门', async () => {
    Department.findByPk.mockResolvedValue({ id: 2, parentId: 0, name: '市场部', toJSON: () => ({ id: 2 }) })
    await expect(deptService.deleteDept(2, restricted)).rejects.toThrow('无权操作该部门')
  })
})

describe('用户写入侧的部门校验', () => {
  const restricted = { id: 7, username: 'lead', dataScope: 2, deptId: 11, deptIds: [11] }
  const inScopeUser = { id: 1, username: 'u1', nickname: 'u1', email: 'a@b.c', phone: '13800000000', status: 1, deptId: 11 }

  it('受限用户不能在范围外部门建号', async () => {
    await expect(userService.createUser({ ...inScopeUser, deptId: 2 }, restricted)).rejects.toThrow('无权在该部门下创建用户')
    expect(User.create).not.toHaveBeenCalled()
  })

  it('受限用户不能把用户移到范围外部门', async () => {
    const target = { ...inScopeUser, toJSON: () => ({ ...inScopeUser }), update: vi.fn() } as any
    vi.mocked(User.findByPk).mockResolvedValueOnce(target)

    await expect(userService.updateUser(1, { deptId: 2 }, restricted)).rejects.toThrow('无权将该用户调整至该部门')
    expect(target.update).not.toHaveBeenCalled()
  })

  it('范围内调整部门允许', async () => {
    const target = { ...inScopeUser, deptId: 11, toJSON: () => ({ ...inScopeUser }), update: vi.fn(async () => undefined) } as any
    vi.mocked(User.findByPk).mockResolvedValueOnce(target)

    await expect(userService.updateUser(1, { deptId: 11 }, restricted)).resolves.toBeTruthy()
  })
})
