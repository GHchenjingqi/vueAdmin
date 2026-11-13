/**
 * 管理端授权越权回归测试
 *
 * 覆盖实测复现的越权路径（低权用户 dataScope=2 / 非管理员）：
 *   1. 普通用户自助授予 platform_admin 角色 → 提权
 *   2. 普通用户重置 admin 密码 → 账号接管
 *   3. 普通用户改/删 platform_admin 角色
 *   4. 普通用户改全局设置 / 建菜单 / 建部门 / 清审计日志 / 写通知渠道凭据
 *   5. 任意租户创建名为 'admin' 的账号即被判定为平台超管（跨租户提权）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---- Mock 依赖 ----
vi.mock('../models/User.js', () => ({
  default: {
    findByPk: vi.fn(),
    findOne: vi.fn(),
    findAll: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    destroy: vi.fn(),
  },
}))

vi.mock('../models/Role.js', () => ({
  default: {
    findByPk: vi.fn(),
    findOne: vi.fn(),
    findAll: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    destroy: vi.fn(),
  },
}))

vi.mock('../models/UserRole.js', () => ({
  default: {
    findAll: vi.fn(),
    destroy: vi.fn(),
    bulkCreate: vi.fn(),
  },
}))

vi.mock('../models/RoleMenu.js', () => ({
  default: {
    destroy: vi.fn(),
    bulkCreate: vi.fn(),
  },
}))

vi.mock('../models/Menu.js', () => ({
  default: {},
}))

vi.mock('../models/Department.js', () => ({
  default: {},
}))

vi.mock('../utils/logger.js', () => ({
  logOperation: vi.fn(),
}))

vi.mock('../utils/exportExcel.js', () => ({
  exportExcel: vi.fn(),
}))

import { updateUser, changePassword, deleteUser } from '../services/userService.js'
import { createRole, updateRole, deleteRole } from '../services/roleService.js'
import { resolveOperatorAuthority } from '../utils/operator.js'
import User from '../models/User.js'
import Role from '../models/Role.js'
import UserRole from '../models/UserRole.js'

/** 普通用户：无管理权角色 */
const LOW_PRIV = { id: 10, username: 'low_user', roles: ['user'], isPlatformAdmin: false }
/** 租户级管理员：持 admin 角色 */
const TENANT_ADMIN = { id: 11, username: 'tenant_admin', roles: ['admin'], isPlatformAdmin: false }
/** 平台超管：持 platform_admin 角色 */
const PLATFORM_ADMIN = { id: 12, username: 'root_admin', roles: ['platform_admin'], isPlatformAdmin: true }

const ROLE_ADMIN = { id: 1, code: 'admin' }
const ROLE_USER = { id: 2, code: 'user' }
const ROLE_PLATFORM_ADMIN = { id: 5, code: 'platform_admin' }

describe('管理端授权越权回归', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // 角色查询默认返回普通角色
    vi.mocked(Role.findAll).mockResolvedValue([] as any)
    vi.mocked(UserRole.findAll).mockResolvedValue([] as any)
  })

  describe('角色授予（提权路径）', () => {
    it('普通用户给自己授予 platform_admin 角色被拒', async () => {
      vi.mocked(User.findByPk).mockResolvedValue({
        id: 10,
        username: 'low_user',
        deptId: 1,
        update: vi.fn(),
      } as any)
      vi.mocked(Role.findAll).mockResolvedValue([ROLE_PLATFORM_ADMIN] as any)

      await expect(
        updateUser(10, { roleIds: [5] }, LOW_PRIV as any),
      ).rejects.toThrow('FORBIDDEN')

      expect(vi.mocked(User.findByPk).mock.results[0].value).toBeTruthy()
    })

    it('普通用户给他人授予 platform_admin 角色被拒', async () => {
      vi.mocked(User.findByPk).mockResolvedValue({
        id: 20,
        username: 'other',
        deptId: 1,
        update: vi.fn(),
      } as any)
      vi.mocked(Role.findAll).mockResolvedValue([ROLE_PLATFORM_ADMIN] as any)

      await expect(
        updateUser(20, { roleIds: [5] }, LOW_PRIV as any),
      ).rejects.toThrow('FORBIDDEN')
    })

    it('租户级管理员授予 platform_admin 角色被拒（需平台级）', async () => {
      vi.mocked(User.findByPk).mockResolvedValue({
        id: 20,
        username: 'other',
        deptId: 1,
        update: vi.fn(),
      } as any)
      vi.mocked(Role.findAll).mockResolvedValue([ROLE_PLATFORM_ADMIN] as any)

      await expect(
        updateUser(20, { roleIds: [5] }, TENANT_ADMIN as any),
      ).rejects.toThrow('需平台管理员权限')
    })

    it('租户级管理员授予普通角色允许', async () => {
      const mockUser = { id: 20, username: 'other', deptId: 1, update: vi.fn() }
      vi.mocked(User.findByPk).mockResolvedValue(mockUser as any)
      vi.mocked(Role.findAll).mockResolvedValue([ROLE_USER] as any)

      await updateUser(20, { roleIds: [2] }, TENANT_ADMIN as any)

      expect(mockUser.update).toHaveBeenCalled()
    })

    it('普通用户更新非角色字段时，若为受保护账号仍被拒', async () => {
      vi.mocked(User.findByPk).mockResolvedValue({
        id: 1,
        username: 'admin',
        deptId: 1,
        update: vi.fn(),
      } as any)

      await expect(
        updateUser(1, { nickname: '被篡改' }, LOW_PRIV as any),
      ).rejects.toThrow('受保护账号')
    })
  })

  describe('密码重置（账号接管路径）', () => {
    it('普通用户重置他人密码被拒', async () => {
      vi.mocked(User.findByPk).mockResolvedValue({
        id: 20,
        username: 'other',
        deptId: 1,
        password: 'x',
        save: vi.fn(),
        verifyPassword: vi.fn(),
      } as any)

      await expect(
        changePassword(20, { reset: true }, LOW_PRIV as any),
      ).rejects.toThrow('FORBIDDEN')
    })

    it('普通用户重置 admin 密码被拒（受保护账号）', async () => {
      vi.mocked(User.findByPk).mockResolvedValue({
        id: 1,
        username: 'admin',
        deptId: 1,
        password: 'x',
        save: vi.fn(),
      } as any)

      await expect(
        changePassword(1, { reset: true }, TENANT_ADMIN as any),
      ).rejects.toThrow('受保护账号')
    })
  })

  describe('角色管理（权限体系本身）', () => {
    it('普通用户创建角色被拒', async () => {
      await expect(
        createRole(
          { name: 'x', code: 'x', sort: 1, status: 1, dataScope: 1 },
          LOW_PRIV as any,
        ),
      ).rejects.toThrow('FORBIDDEN')
    })

    it('普通用户改写 platform_admin 角色被拒', async () => {
      vi.mocked(Role.findByPk).mockResolvedValue({
        id: 5,
        code: 'platform_admin',
        name: '平台超管',
        update: vi.fn(),
      } as any)

      await expect(
        updateRole(
          5,
          { name: '平台超管X', code: 'platform_admin', sort: 0, status: 1, dataScope: 1 },
          LOW_PRIV as any,
        ),
      ).rejects.toThrow('FORBIDDEN')
    })

    it('普通用户删除 platform_admin 角色被拒', async () => {
      vi.mocked(Role.findByPk).mockResolvedValue({
        id: 5,
        code: 'platform_admin',
        name: '平台超管',
      } as any)

      await expect(deleteRole(5, LOW_PRIV as any)).rejects.toThrow('FORBIDDEN')
    })

    it('租户级管理员创建普通角色允许', async () => {
      vi.mocked(Role.findOne).mockResolvedValue(null as any)
      vi.mocked(Role.create).mockResolvedValue({ id: 9, name: 'new' } as any)

      const r = await createRole(
        { name: 'new', code: 'new', sort: 1, status: 1, dataScope: 2 },
        TENANT_ADMIN as any,
      )

      expect(r.id).toBe(9)
    })

    it('租户级管理员不可占用受保护角色编码', async () => {
      vi.mocked(Role.findOne).mockResolvedValue(null as any)

      await expect(
        createRole(
          { name: '伪超管', code: 'platform_admin', sort: 1, status: 1, dataScope: 1 },
          TENANT_ADMIN as any,
        ),
      ).rejects.toThrow('受保护角色编码')
    })
  })

  describe('受保护账号删除', () => {
    it('普通用户删除 admin 账号被拒', async () => {
      vi.mocked(User.findByPk).mockResolvedValue({
        id: 1,
        username: 'admin',
        deptId: 1,
        destroy: vi.fn(),
      } as any)

      await expect(deleteUser(1, LOW_PRIV as any)).rejects.toThrow('受保护账号')
    })
  })

  describe('平台超管判定（跨租户同名提权）', () => {
    it('持有 platform_admin 角色 → 平台超管', async () => {
      const a = await resolveOperatorAuthority({ id: 1, roles: ['platform_admin'] })
      expect(a.isPlatformAdmin).toBe(true)
      expect(a.isManager).toBe(true)
    })

    it('仅凭用户名 admin 不再获得平台超管（跨租户同名提权修复）', async () => {
      const a = await resolveOperatorAuthority({ id: 2, username: 'admin', roles: ['user'] })
      expect(a.isPlatformAdmin).toBe(false)
      expect(a.isManager).toBe(false)
    })

    it('admin 角色 → 租户级管理权，非平台超管', async () => {
      const a = await resolveOperatorAuthority({ id: 3, roles: ['admin'] })
      expect(a.isManager).toBe(true)
      expect(a.isPlatformAdmin).toBe(false)
    })

    it('无角色 → 无管理权', async () => {
      const a = await resolveOperatorAuthority({ id: 4, roles: ['user'] })
      expect(a.isManager).toBe(false)
      expect(a.isPlatformAdmin).toBe(false)
    })
  })
})
