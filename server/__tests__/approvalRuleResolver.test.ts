import { describe, it, expect, vi } from 'vitest'

const mockUserFindByPk = vi.fn()
const mockUserFindAll = vi.fn()
const mockUserFindOne = vi.fn()
const mockDepartmentFindByPk = vi.fn()
const mockUserRoleFindAll = vi.fn()

vi.mock('../models/User.js', () => ({
  default: {
    findByPk: (...args: any[]) => mockUserFindByPk(...args),
    findAll: (...args: any[]) => mockUserFindAll(...args),
    findOne: (...args: any[]) => mockUserFindOne(...args),
  },
}))

vi.mock('../models/Department.js', () => ({
  default: {
    findByPk: (...args: any[]) => mockDepartmentFindByPk(...args),
  },
}))

vi.mock('../models/UserRole.js', () => ({
  default: {
    findAll: (...args: any[]) => mockUserRoleFindAll(...args),
  },
}))

import { resolveApprovers } from '../utils/approvalRuleResolver.js'

describe('approvalRuleResolver', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creator 规则返回发起人', async () => {
    const result = await resolveApprovers([{ ruleType: 'creator', ruleConfig: null }], { startedBy: 42 })
    expect(result).toEqual([42])
  })

  it('direct_leader 规则找到直属上级', async () => {
    mockUserFindByPk.mockResolvedValueOnce({ id: 1, deptId: 10 })
    mockDepartmentFindByPk.mockResolvedValueOnce({ id: 10, parentId: 0, leader: '领导' })
    mockUserFindOne.mockResolvedValueOnce({ id: 99 })
    const result = await resolveApprovers([{ ruleType: 'direct_leader', ruleConfig: '{"level":1}' }], { startedBy: 1 })
    expect(result).toEqual([99])
  })

  it('direct_leader 无上级时返回空', async () => {
    mockUserFindByPk.mockResolvedValueOnce({ id: 1, deptId: 10 })
    mockDepartmentFindByPk.mockResolvedValueOnce({ id: 10, parentId: 0, leader: null })
    const result = await resolveApprovers([{ ruleType: 'direct_leader', ruleConfig: '{"level":1}' }], { startedBy: 1 })
    expect(result).toEqual([])
  })

  it('role 规则返回角色下用户', async () => {
    mockUserRoleFindAll.mockResolvedValueOnce([{ userId: 10 }, { userId: 20 }])
    const result = await resolveApprovers([{ ruleType: 'role', ruleConfig: '{"roleIds":[3]}' }], { startedBy: 1 })
    expect(result).toEqual([10, 20])
  })

  it('dept 规则返回部门下用户', async () => {
    mockUserFindAll.mockResolvedValueOnce([{ id: 10 }, { id: 20 }])
    const result = await resolveApprovers([{ ruleType: 'dept', ruleConfig: '{"deptIds":[5]}' }], { startedBy: 1 })
    expect(result).toEqual([10, 20])
  })

  it('user 规则返回指定用户', async () => {
    const result = await resolveApprovers([{ ruleType: 'user', ruleConfig: '{"userIds":[7,8]}' }], { startedBy: 1 })
    expect(result).toEqual([7, 8])
  })
})