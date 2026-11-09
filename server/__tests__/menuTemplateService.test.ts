// @vitest-environment node
/**
 * 菜单/角色模板复制引擎（T11）单元测试
 *
 * 这里用极简内存假模型替换 Sequelize 模型：复制算法的正确性（父先于子、
 * copyable=0 不下发、幂等、授权改写到副本）与数据库无关，用假模型反而能
 * 断言到每次 create/update 的具体载荷。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Op } from 'sequelize'

type Row = Record<string, any>

const db = {
  menus: [] as Row[],
  roles: [] as Row[],
  roleMenus: [] as Row[],
  tenants: [] as Row[],
  nextId: { menus: 1, roles: 1, roleMenus: 1 },
}

function matches(row: Row, where: Record<string, any> = {}): boolean {
  return Object.entries(where).every(([field, condition]) => {
    if (condition && typeof condition === 'object' && Op.in in condition) return (condition[Op.in] as any[]).includes(row[field])
    return row[field] === condition
  })
}

function pick(row: Row, attributes?: string[]) {
  if (!attributes) return row
  return Object.fromEntries(attributes.map((field) => [field, row[field]]))
}

const Menu = {
  async count(this: unknown, options: any = {}) {
    return db.menus.filter((row) => matches(row, options.where)).length
  },
  async findAll(this: unknown, options: any = {}) {
    const rows = db.menus.filter((row) => matches(row, options.where)).map((row) => pick(row, options.attributes))
    const order = options.order as [string, string][] | undefined
    if (order) {
      for (const [field, dir] of [...order].reverse()) {
        rows.sort((a: Row, b: Row) => (a[field] === b[field] ? 0 : dir === 'ASC' ? (a[field] > b[field] ? 1 : -1) : a[field] < b[field] ? 1 : -1))
      }
    }
    return rows
  },
  async findOne(this: unknown, options: any = {}) {
    return db.menus.find((row) => matches(row, options.where)) ?? null
  },
  async create(this: unknown, payload: Row) {
    const row = { id: db.nextId.menus++, ...payload }
    db.menus.push(row)
    return row
  },
}

const Role = {
  async findAll(this: unknown, options: any = {}) {
    const rows = db.roles.filter((row) => matches(row, options.where)).map((row) => pick(row, options.attributes))
    const order = options.order as [string, string][] | undefined
    if (order) {
      for (const [field, dir] of [...order].reverse()) {
        rows.sort((a: Row, b: Row) => (a[field] === b[field] ? 0 : dir === 'ASC' ? (a[field] > b[field] ? 1 : -1) : a[field] < b[field] ? 1 : -1))
      }
    }
    return rows
  },
  async create(this: unknown, payload: Row) {
    const row = { id: db.nextId.roles++, ...payload }
    db.roles.push(row)
    return row
  },
}

const RoleMenu = {
  async findOne(this: unknown, options: any = {}) {
    return db.roleMenus.find((row) => matches(row, options.where)) ?? null
  },
  async findAll(this: unknown, options: any = {}) {
    return db.roleMenus
      .filter((row) => matches(row, options.where))
      .map((row) => ({
        ...row,
        async update(payload: Row) {
          Object.assign(row, payload)
        },
        async destroy() {
          db.roleMenus = db.roleMenus.filter((r) => r !== row)
        },
      }))
  },
  async create(this: unknown, payload: Row) {
    const row = { id: db.nextId.roleMenus++, ...payload }
    db.roleMenus.push(row)
    return row
  },
  async bulkCreate(this: unknown, payloads: Row[]) {
    for (const payload of payloads) await RoleMenu.create(payload)
    return payloads
  },
}

const Tenant = {
  async findAll() {
    return [...db.tenants].sort((a, b) => a.id - b.id)
  },
}

vi.mock('../config/database.js', () => ({ default: {} }))
vi.mock('../models/Menu.js', () => ({ default: Menu }))
vi.mock('../models/Role.js', () => ({ default: Role }))
vi.mock('../models/RoleMenu.js', () => ({ default: RoleMenu }))
vi.mock('../modules/tenant/models/Tenant.js', () => ({ default: Tenant }))

// 服务用动态导入：保证上面的假模型在模块求值前完成赋值（vi.mock 工厂是惰性调用的）
const { cloneRolesForTenant, copyTemplateMenus, ensurePlatformConsoleMenus, menuIdentityKey, remapRoleMenusToCopies } =
  await import('../modules/tenant/services/menuTemplateService.js')
import { PERMISSION_CATALOG } from '../utils/permissionCatalog.js'

const PLATFORM = 0
const DEFAULT_TENANT = 1

/** 平台模板：系统管理(目录) → 用户管理(页面) → 新增用户(按钮)，外加一个平台专属页 */
function seedTemplates() {
  db.menus.push(
    {
      id: 1,
      tenantId: PLATFORM,
      copyable: 1,
      parentId: 0,
      name: '系统管理',
      path: '/system',
      component: null,
      icon: 'Setting',
      type: 'D',
      sort: 1,
      status: 1,
      hidden: 0,
      permission: null,
    },
    {
      id: 2,
      tenantId: PLATFORM,
      copyable: 1,
      parentId: 1,
      name: '用户管理',
      path: '/users',
      component: 'views/UserList.vue',
      icon: 'User',
      type: 'M',
      sort: 1,
      status: 1,
      hidden: 0,
      permission: null,
    },
    {
      id: 3,
      tenantId: PLATFORM,
      copyable: 1,
      parentId: 2,
      name: '新增用户',
      path: '',
      component: null,
      icon: null,
      type: 'F',
      sort: 0,
      status: 1,
      hidden: 0,
      permission: 'system:user:add',
    },
  )
  syncIds()
}

function seedDefaultTenantRoles() {
  db.roles.push(
    { id: 1, tenantId: DEFAULT_TENANT, name: '管理员', code: 'admin', sort: 1, status: 1, dataScope: 'all', remark: null },
    { id: 2, tenantId: DEFAULT_TENANT, name: '普通用户', code: 'user', sort: 2, status: 1, dataScope: 'dept', remark: null },
  )
  db.roleMenus.push({ id: 1, roleId: 1, menuId: 1 }, { id: 2, roleId: 1, menuId: 2 }, { id: 3, roleId: 1, menuId: 3 }, { id: 4, roleId: 2, menuId: 2 })
  db.tenants.push({ id: DEFAULT_TENANT })
  syncIds()
}

function resetDb() {
  db.menus = []
  db.roles = []
  db.roleMenus = []
  db.tenants = []
  db.nextId = { menus: 1, roles: 1, roleMenus: 1 }
}

/** 手工播种的行必须把自增游标推到最大 id 之后，否则 create 会分配出重复 id、断言变成假阳性 */
function syncIds() {
  db.nextId.menus = Math.max(0, ...db.menus.map((m) => m.id)) + 1
  db.nextId.roles = Math.max(0, ...db.roles.map((r) => r.id)) + 1
  db.nextId.roleMenus = Math.max(0, ...db.roleMenus.map((g) => g.id)) + 1
}

/** 假模型行是宽松 Record，传给纯函数前收窄成它的入参形状 */
const identityOf = (row: Row) => menuIdentityKey(row as Parameters<typeof menuIdentityKey>[0])

describe('menuTemplateService', () => {
  beforeEach(resetDb)

  describe('menuIdentityKey', () => {
    it('页面用 path、按钮用 permission 作为跨租户身份键', () => {
      expect(menuIdentityKey({ type: 'M', path: '/users', permission: null, name: '用户管理' })).toBe('M:/users')
      expect(menuIdentityKey({ type: 'F', path: '', permission: 'system:user:add', name: '新增用户' })).toBe('F:system:user:add')
      expect(menuIdentityKey({ type: 'D', path: '', permission: null, name: '系统管理' })).toBe('D:系统管理')
    })
  })

  describe('copyTemplateMenus', () => {
    it('按父先于子的顺序复制，并把 parentId 换算成副本自己的 id', async () => {
      seedTemplates()
      const map = await copyTemplateMenus(7)

      expect([...map.keys()]).toEqual([1, 2, 3])
      const copies = db.menus.filter((m) => m.tenantId === 7)
      expect(copies).toHaveLength(3)
      expect(copies.map((m) => m.id)).toEqual([map.get(1), map.get(2), map.get(3)])
      expect(copies.find((m) => m.name === '用户管理')!.parentId).toBe(copies.find((m) => m.name === '系统管理')!.id)
      expect(copies.find((m) => m.permission === 'system:user:add')!.parentId).toBe(copies.find((m) => m.name === '用户管理')!.id)
    })

    it('copyable=0 的平台专属菜单不下发给租户', async () => {
      seedTemplates()
      db.menus.push({
        id: 99,
        tenantId: PLATFORM,
        copyable: 0,
        parentId: 0,
        name: '租户管理',
        path: '/tenants',
        component: 'views/TenantList.vue',
        icon: '',
        type: 'M',
        sort: 200,
        status: 1,
        hidden: 0,
        permission: null,
      })

      await copyTemplateMenus(7)
      expect(db.menus.filter((m) => m.tenantId === 7 && m.path === '/tenants')).toHaveLength(0)
    })

    it('已有副本的租户不再复制（幂等）', async () => {
      seedTemplates()
      await copyTemplateMenus(7)
      const before = db.menus.length

      const again = await copyTemplateMenus(7)
      expect(again.size).toBe(0)
      expect(db.menus.length).toBe(before)
    })
  })

  describe('ensurePlatformConsoleMenus', () => {
    it('落库平台控制台页面与按钮，并只授给默认租户的 platform_admin', async () => {
      db.roles.push({ id: 5, tenantId: DEFAULT_TENANT, name: '平台超管', code: 'platform_admin', sort: 0, status: 1, dataScope: 'all', remark: null })

      const { pageId } = await ensurePlatformConsoleMenus()
      const page = db.menus.find((m) => m.id === pageId)
      expect(page).toMatchObject({ tenantId: PLATFORM, copyable: 0, path: '/tenants', type: 'M' })

      const tenantCodes = PERMISSION_CATALOG.filter((item) => item.parentPath === '/tenants').map((item) => item.code)
      expect(tenantCodes.length).toBeGreaterThan(0)
      for (const code of tenantCodes) {
        const button = db.menus.find((m) => m.permission === code)
        expect(button, `${code} 应作为平台专属按钮落库`).toMatchObject({ tenantId: PLATFORM, copyable: 0, parentId: pageId, type: 'F' })
      }
      // 页面 + 每个按钮各一条授权，且只授给 platform_admin
      expect(db.roleMenus.every((g) => g.roleId === 5)).toBe(true)
      expect(db.roleMenus).toHaveLength(1 + tenantCodes.length)
    })

    it('重复执行不会产生第二份平台菜单', async () => {
      await ensurePlatformConsoleMenus()
      const snapshot = JSON.stringify(db.menus)
      await ensurePlatformConsoleMenus()
      expect(JSON.stringify(db.menus)).toBe(snapshot)
    })
  })

  describe('remapRoleMenusToCopies', () => {
    it('把指向模板的授权改写到自己副本上', async () => {
      seedTemplates()
      seedDefaultTenantRoles()

      const remapped = await remapRoleMenusToCopies(DEFAULT_TENANT)
      expect(remapped).toBe(4)
      const copyId = (key: string) => db.menus.find((m) => m.tenantId === DEFAULT_TENANT && identityOf(m) === key)!.id
      expect(db.roleMenus.map((g) => g.menuId)).toEqual([copyId('D:/system'), copyId('M:/users'), copyId('F:system:user:add'), copyId('M:/users')])
    })

    it('平台专属菜单的授权被删除（租户拿不到平台入口）', async () => {
      seedTemplates()
      seedDefaultTenantRoles()
      db.menus.push({
        id: 99,
        tenantId: PLATFORM,
        copyable: 0,
        parentId: 0,
        name: '租户管理',
        path: '/tenants',
        component: 'views/TenantList.vue',
        icon: '',
        type: 'M',
        sort: 200,
        status: 1,
        hidden: 0,
        permission: null,
      })
      db.roleMenus.push({ id: 9, roleId: 1, menuId: 99 })

      await remapRoleMenusToCopies(DEFAULT_TENANT)
      expect(db.roleMenus.find((g) => g.menuId === 99)).toBeUndefined()
    })
  })

  describe('cloneRolesForTenant', () => {
    it('按角色模板建新租户角色，并把授权指向新租户自己的菜单副本', async () => {
      seedTemplates()
      seedDefaultTenantRoles()
      await copyTemplateMenus(7)

      const { adminRoleId, roleIds } = await cloneRolesForTenant(7)
      const created = db.roles.filter((r) => r.tenantId === 7)
      expect(created.map((r) => r.code)).toEqual(['admin', 'user'])
      expect(adminRoleId).toBe(created.find((r) => r.code === 'admin')!.id)
      expect(roleIds).toEqual(created.map((r) => r.id))

      const adminGrants = db.roleMenus.filter((g) => g.roleId === adminRoleId).map((g) => g.menuId)
      const copyIds = db.menus.filter((m) => m.tenantId === 7).map((m) => m.id)
      expect(adminGrants).toHaveLength(copyIds.length)
      expect(adminGrants.every((id) => copyIds.includes(id))).toBe(true)
    })

    it('默认租户缺少角色模板时失败，避免开通出无角色的半成品租户', async () => {
      seedTemplates()
      await expect(cloneRolesForTenant(7)).rejects.toThrow(/角色模板/)
    })
  })
})
