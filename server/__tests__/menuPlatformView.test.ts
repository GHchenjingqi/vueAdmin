// @vitest-environment node
/**
 * 平台超管菜单视图作用域（T11）
 *
 * 平台侧看的是 tenantId=0 的模板；租户侧由全局 scope 钩子自动约束。
 * 少了这层过滤，平台管理员的侧边栏会把每个租户的副本各排一遍。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { menuFindAll, roleFindAll, roleFindOne, userRoleFindAll } = vi.hoisted(() => ({
  menuFindAll: vi.fn(),
  roleFindAll: vi.fn(),
  roleFindOne: vi.fn(),
  userRoleFindAll: vi.fn(),
}))

vi.mock('../config/database.js', () => ({ default: { literal: vi.fn((v: string) => v) } }))
vi.mock('../models/Menu.js', () => ({ default: { findAll: menuFindAll, findByPk: vi.fn(), create: vi.fn(), update: vi.fn(), destroy: vi.fn() } }))
vi.mock('../models/Role.js', () => ({ default: { findAll: roleFindAll, findOne: roleFindOne } }))
vi.mock('../models/RoleMenu.js', () => ({ default: { findAll: vi.fn() } }))
vi.mock('../models/UserRole.js', () => ({ default: { findAll: userRoleFindAll } }))
vi.mock('../services/permissionService.js', () => ({ invalidateAllGrants: vi.fn() }))

const { listMenus } = await import('../services/menuService.js')
const { runInTenant } = await import('../modules/tenant/context.js')

describe('menuService 平台视图作用域', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    menuFindAll.mockResolvedValue([])
    roleFindAll.mockResolvedValue([])
    roleFindOne.mockResolvedValue(null)
  })

  it('平台超管（bypass）取选项树时限定模板租户', async () => {
    await runInTenant({ tenantId: 1, userId: 1, bypass: true }, () => listMenus('options'))
    expect(menuFindAll.mock.calls[0][0].where).toEqual({ tenantId: 0 })
  })

  it('租户用户不加额外过滤，交给全局钩子约束', async () => {
    await runInTenant({ tenantId: 7, userId: 1 }, () => listMenus('options'))
    expect(menuFindAll.mock.calls[0][0].where).toEqual({})
  })

  it('无租户上下文（脚本/迁移）同样保持原样', async () => {
    await listMenus('options')
    expect(menuFindAll.mock.calls[0][0].where).toEqual({})
  })

  it('平台超管的侧边栏树也在模板作用域内，且保留状态过滤', async () => {
    userRoleFindAll.mockResolvedValue([{ roleId: 1 }])
    roleFindOne.mockResolvedValue({ id: 1, dataScope: 1 })

    await runInTenant({ tenantId: 1, userId: 1, bypass: true }, () => listMenus('tree', 1))
    expect(menuFindAll.mock.calls[0][0].where).toEqual({ status: 1, hidden: 0, tenantId: 0 })
  })
})
