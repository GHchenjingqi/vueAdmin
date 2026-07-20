/**
 * dataScope.ts 单元测试
 *
 * 覆盖：resolveDataScope, getDescendantDeptIds, applyDataScopeWhere, isTargetInScope
 *
 * 说明：由于 dataScope 依赖 sequelize 模型（Department / Role），
 * 这里通过 mock sequelize 的 findAll 来隔离外部依赖，专注于逻辑分支。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Op } from 'sequelize'
import type { ResolvedScope } from '../utils/dataScope.js'

// Mock sequelize 模型
vi.mock('../models/Department.js', () => ({
  default: {
    findAll: vi.fn(),
  },
}))

vi.mock('../models/Role.js', () => ({
  default: {
    findAll: vi.fn(),
  },
}))

vi.mock('../config/database.js', () => ({
  default: {},
}))

// 延迟 import 以确保 mock 生效
const { resolveDataScope, getDescendantDeptIds, applyDataScopeWhere, isTargetInScope } = await import('../utils/dataScope.js')

const Department = (await import('../models/Department.js')).default as any
const Role = (await import('../models/Role.js')).default as any

describe('dataScope.ts - resolveDataScope', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('无角色时回退为仅本部门（当有 deptId）', async () => {
    const scope = await resolveDataScope(5, [])
    expect(scope).toEqual({ dataScope: 2, deptId: 5, deptIds: [5] })
  })

  it('无角色且无 deptId 时默认为全部', async () => {
    const scope = await resolveDataScope(null, [])
    expect(scope).toEqual({ dataScope: 1, deptId: 0, deptIds: [] })
  })

  it('全部角色为 1（全部）时返回全部', async () => {
    Role.findAll.mockResolvedValueOnce([{ dataScope: 1 }, { dataScope: 1 }])
    const scope = await resolveDataScope(5, [1, 2])
    expect(scope.dataScope).toBe(1)
    expect(scope.deptIds).toEqual([])
  })

  it('混合角色取最宽松（min），任一角色为 1 即整体为 1', async () => {
    Role.findAll.mockResolvedValueOnce([{ dataScope: 1 }, { dataScope: 2 }, { dataScope: 3 }])
    const scope = await resolveDataScope(5, [1, 2, 3])
    expect(scope.dataScope).toBe(1)
  })

  it('所有角色为 2（本部门）时返回仅本部门', async () => {
    Role.findAll.mockResolvedValueOnce([{ dataScope: 2 }, { dataScope: 2 }])
    const scope = await resolveDataScope(5, [1, 2])
    expect(scope).toEqual({ dataScope: 2, deptId: 5, deptIds: [5] })
  })

  it('角色为 3（本级及以下）时调用 getDescendantDeptIds', async () => {
    Role.findAll.mockResolvedValueOnce([{ dataScope: 3 }, { dataScope: 3 }])
    // getDescendantDeptIds will be called internally; let it use the real Department mock
    Department.findAll.mockResolvedValueOnce([])
    const scope = await resolveDataScope(5, [1])
    expect(scope.dataScope).toBe(3)
    expect(scope.deptIds).toContain(5)
  })

  it('dataScope=3 且无 deptId 时返回空 deptIds', async () => {
    Role.findAll.mockResolvedValueOnce([{ dataScope: 3 }])
    const scope = await resolveDataScope(null, [1])
    expect(scope).toEqual({ dataScope: 3, deptId: 0, deptIds: [] })
  })
})

describe('dataScope.ts - getDescendantDeptIds', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('单节点（无子部门）返回自身', async () => {
    Department.findAll.mockResolvedValueOnce([
      { id: 5, parentId: 0 },
    ])
    const ids = await getDescendantDeptIds(5)
    expect(ids).toEqual([5])
  })

  it('返回含子部门的整棵子树', async () => {
    Department.findAll.mockResolvedValueOnce([
      { id: 1, parentId: 0 },
      { id: 2, parentId: 1 },
      { id: 3, parentId: 1 },
      { id: 4, parentId: 2 },
      { id: 5, parentId: 0 }, // 非子树
    ])
    const ids = await getDescendantDeptIds(1)
    expect(ids.sort()).toEqual([1, 2, 3, 4])
  })

  it('不返回无关部门', async () => {
    Department.findAll.mockResolvedValueOnce([
      { id: 1, parentId: 0 },
      { id: 9, parentId: 0 },
    ])
    const ids = await getDescendantDeptIds(1)
    expect(ids).toEqual([1])
    expect(ids).not.toContain(9)
  })
})

describe('dataScope.ts - applyDataScopeWhere', () => {
  it('scope=1 时不约束 WHERE', () => {
    const where: any = { username: { [Op.like]: '%admin%' } }
    applyDataScopeWhere(where, { dataScope: 1, deptId: 5, deptIds: [5] })
    expect(where.deptId).toBeUndefined()
    expect(where.username).toEqual({ [Op.like]: '%admin%' })
  })

  it('scope 缺失（旧 token）时不约束 WHERE', () => {
    const where: any = { username: { [Op.like]: '%admin%' } }
    applyDataScopeWhere(where, {})
    expect(where.deptId).toBeUndefined()
  })

  it('scope=2 时注入 deptId IN 条件', () => {
    const where: any = {}
    applyDataScopeWhere(where, { dataScope: 2, deptId: 5, deptIds: [5] })
    expect(where.deptId).toEqual({ [Op.in]: [5] })
  })

  it('scope=3 时注入所有子部门 deptIds', () => {
    const where: any = {}
    applyDataScopeWhere(where, { dataScope: 3, deptId: 1, deptIds: [1, 2, 3] })
    expect(where.deptId).toEqual({ [Op.in]: [1, 2, 3] })
  })

  it('前端指定 deptId 在范围内时取交集（仅该部门）', () => {
    const where: any = {}
    applyDataScopeWhere(where, { dataScope: 3, deptId: 1, deptIds: [1, 2, 3] }, 2)
    expect(where.deptId).toEqual({ [Op.in]: [2] })
  })

  it('前端指定 deptId 不在范围内时返回空集', () => {
    const where: any = {}
    applyDataScopeWhere(where, { dataScope: 3, deptId: 1, deptIds: [1, 2, 3] }, 99)
    expect(where.id).toEqual({ [Op.eq]: -1 })
    expect(where.deptId).toBeUndefined()
  })

  it('允许部门列表为空时返回空集', () => {
    const where: any = {}
    applyDataScopeWhere(where, { dataScope: 2, deptId: 0, deptIds: [] })
    expect(where.id).toEqual({ [Op.eq]: -1 })
  })

  it('前端指定 deptId 时合并到现有 WHERE（不覆盖其他条件）', () => {
    const where: any = { username: { [Op.like]: '%test%' } }
    applyDataScopeWhere(where, { dataScope: 2, deptId: 5, deptIds: [5] }, 5)
    expect(where.deptId).toEqual({ [Op.in]: [5] })
    expect(where.username).toEqual({ [Op.like]: '%test%' })
  })
})

describe('dataScope.ts - isTargetInScope', () => {
  it('scope=1 时始终允许', () => {
    expect(isTargetInScope(99, { dataScope: 1, deptId: 1, deptIds: [1] })).toBe(true)
  })

  it('scope 缺失时始终允许', () => {
    expect(isTargetInScope(99, {} as any)).toBe(true)
  })

  it('scope=2 且目标部门在范围内时允许', () => {
    expect(isTargetInScope(5, { dataScope: 2, deptId: 5, deptIds: [5] })).toBe(true)
  })

  it('scope=2 且目标部门不在范围内时拒绝', () => {
    expect(isTargetInScope(99, { dataScope: 2, deptId: 5, deptIds: [5] })).toBe(false)
  })

  it('scope=3 且目标部门在子树内时允许', () => {
    expect(isTargetInScope(3, { dataScope: 3, deptId: 1, deptIds: [1, 2, 3] })).toBe(true)
  })

  it('scope=3 且目标部门不在子树内时拒绝', () => {
    expect(isTargetInScope(99, { dataScope: 3, deptId: 1, deptIds: [1, 2, 3] })).toBe(false)
  })

  it('允许列表为空时拒绝', () => {
    expect(isTargetInScope(5, { dataScope: 2, deptId: 0, deptIds: [] })).toBe(false)
  })

  it('目标 deptId 为 null/undefined 时拒绝（除 scope=1）', () => {
    expect(isTargetInScope(null, { dataScope: 2, deptId: 5, deptIds: [5] })).toBe(false)
    expect(isTargetInScope(undefined, { dataScope: 2, deptId: 5, deptIds: [5] })).toBe(false)
  })
})
