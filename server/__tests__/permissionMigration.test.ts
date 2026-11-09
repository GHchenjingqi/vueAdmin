// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { QueryInterface } from 'sequelize'
import { PERMISSION_CATALOG } from '../utils/permissionCatalog.js'
import { down, up } from '../migrations/20261103_000001_create-button-permissions.js'

interface FakeMenuRow {
  id: number
  parentId: number
  path: string
  type: string
  permission: string | null
  name?: string
  status?: number
  tenantId?: number | null
}

interface FakeRoleMenuRow {
  roleId: number
  menuId: number
}

interface FakeDb {
  menus: FakeMenuRow[]
  roleMenus: FakeRoleMenuRow[]
  menusHaveTenantColumn: boolean
  nextMenuId: number
  queries: string[]
}

function createFakeDb(): FakeDb {
  return { menus: [], roleMenus: [], menusHaveTenantColumn: true, nextMenuId: 1, queries: [] }
}

/** 只识别本迁移实际发出的那几条 SQL，其余一律抛错，避免假库悄悄放过未知语句 */
function runQuery(db: FakeDb, sql: string, replacements: unknown[] = []): Record<string, unknown>[] {
  const norm = sql.replace(/\s+/g, ' ').trim()
  db.queries.push(norm)

  if (/^SELECT id, (tenantId|NULL AS tenantId) FROM menus WHERE path = \? AND type IN \('M', 'C'\) LIMIT 1$/.test(norm)) {
    const path = replacements[0] as string
    const row = db.menus.find((m) => m.path === path && ['M', 'C'].includes(m.type))
    if (!row) return []
    const withTenant = norm.includes('SELECT id, tenantId')
    return [{ id: row.id, tenantId: withTenant ? (row.tenantId ?? null) : null }]
  }

  if (/^SELECT id FROM menus WHERE permission = \? LIMIT 1$/.test(norm)) {
    const row = db.menus.find((m) => m.permission === replacements[0])
    return row ? [{ id: row.id }] : []
  }

  if (/^SELECT DISTINCT roleId FROM role_menus WHERE menuId = \?$/.test(norm)) {
    const menuId = replacements[0] as number
    return [...new Set(db.roleMenus.filter((r) => r.menuId === menuId).map((r) => r.roleId))].map((roleId) => ({ roleId }))
  }

  if (/^SELECT roleId FROM role_menus WHERE menuId = \? AND roleId IN \(\?\)$/.test(norm)) {
    const [menuId, roleIds] = [replacements[0] as number, replacements[1] as number[]]
    return db.roleMenus.filter((r) => r.menuId === menuId && roleIds.includes(r.roleId)).map((r) => ({ roleId: r.roleId }))
  }

  if (/^DELETE FROM role_menus WHERE menuId IN \(SELECT id FROM menus WHERE permission IN \(\?\)\)$/.test(norm)) {
    const codes = replacements[0] as string[]
    const menuIds = db.menus.filter((m) => m.permission && codes.includes(m.permission)).map((m) => m.id)
    db.roleMenus = db.roleMenus.filter((r) => !menuIds.includes(r.menuId))
    return []
  }

  if (/^DELETE FROM menus WHERE permission IN \(\?\) AND type = 'F'$/.test(norm)) {
    const codes = replacements[0] as string[]
    db.menus = db.menus.filter((m) => !(codes.includes(m.permission ?? '') && m.type === 'F'))
    return []
  }

  throw new Error(`假数据库未覆盖的 SQL: ${norm}`)
}

function createQueryInterface(db: FakeDb): QueryInterface {
  return {
    describeTable: vi.fn(async () => (db.menusHaveTenantColumn ? { id: {}, tenantId: {}, parentId: {} } : { id: {}, parentId: {} })),
    bulkInsert: vi.fn(async (table: unknown, rows: Record<string, unknown>[]) => {
      if (String(table) === 'menus') {
        for (const row of rows) db.menus.push({ ...row, id: db.nextMenuId++ } as unknown as FakeMenuRow)
        return
      }
      for (const row of rows) db.roleMenus.push(row as unknown as FakeRoleMenuRow)
    }),
    sequelize: { query: async (sql: string, options?: { replacements?: unknown[] }) => runQuery(db, sql, options?.replacements ?? []) },
  } as unknown as QueryInterface
}

/** 给目录里每个父 path 造一个页面菜单，并授予指定角色 */
function seedParentMenus(db: FakeDb, options: { omitPath?: string; roleIds?: number[] } = {}): void {
  const roleIds = options.roleIds ?? [1, 2]
  const parents = [...new Set(PERMISSION_CATALOG.map((e) => e.parentPath))]
  for (const path of parents) {
    if (options.omitPath === path) continue
    const menu: FakeMenuRow = { id: db.nextMenuId++, parentId: 0, name: path, path, type: 'C', permission: null, tenantId: 7 }
    db.menus.push(menu)
    for (const roleId of roleIds) db.roleMenus.push({ roleId, menuId: menu.id })
  }
}

function buttons(db: FakeDb): FakeMenuRow[] {
  return db.menus.filter((m) => m.type === 'F')
}

let db: FakeDb

beforeEach(() => {
  vi.clearAllMocks()
  db = createFakeDb()
})

describe('迁移 20261103_000001 up()', () => {
  it('为目录中每个权限码建一个按钮，并按父菜单继承授权', async () => {
    seedParentMenus(db, { roleIds: [1, 2] })

    await up(createQueryInterface(db))

    expect(buttons(db)).toHaveLength(PERMISSION_CATALOG.length)
    for (const entry of PERMISSION_CATALOG) {
      const button = buttons(db).find((b) => b.permission === entry.code)
      const parent = db.menus.find((m) => m.path === entry.parentPath && m.type === 'C')
      expect(button?.parentId).toBe(parent?.id)
      expect(button?.status).toBe(1)
      const granted = db.roleMenus
        .filter((r) => r.menuId === button?.id)
        .map((r) => r.roleId)
        .sort()
      expect(granted).toEqual([1, 2])
    }
  })

  it('重复执行不产生重复按钮或重复授权', async () => {
    seedParentMenus(db)
    const qi = createQueryInterface(db)

    await up(qi)
    const menusAfterFirst = buttons(db).length
    const grantsAfterFirst = db.roleMenus.length

    await up(qi)

    expect(buttons(db)).toHaveLength(menusAfterFirst)
    expect(db.roleMenus).toHaveLength(grantsAfterFirst)
    const codes = buttons(db).map((b) => b.permission)
    expect(new Set(codes).size).toBe(codes.length)
  })

  it('按钮已存在时只补齐缺失的角色授权', async () => {
    const entry = PERMISSION_CATALOG[0]
    seedParentMenus(db, { roleIds: [1, 2] })
    const parent = db.menus.find((m) => m.path === entry.parentPath)!
    db.menus.push({ id: db.nextMenuId++, parentId: parent.id, name: entry.name, path: '', type: 'F', permission: entry.code, tenantId: 7 })
    const existing = buttons(db).find((b) => b.permission === entry.code)!
    db.roleMenus.push({ roleId: 1, menuId: existing.id })

    await up(createQueryInterface(db))

    expect(buttons(db).filter((b) => b.permission === entry.code)).toHaveLength(1)
    const granted = db.roleMenus.filter((r) => r.menuId === existing.id).map((r) => r.roleId)
    expect(granted.sort()).toEqual([1, 2])
  })

  it('父菜单不存在的条目跳过，不留 parentId=0 的孤儿按钮', async () => {
    const parentCounts = PERMISSION_CATALOG.reduce<Record<string, number>>((acc, e) => ({ ...acc, [e.parentPath]: (acc[e.parentPath] ?? 0) + 1 }), {})
    const omittedPath = Object.keys(parentCounts).find((p) => parentCounts[p] === 1)
    expect(omittedPath).toBeTruthy()
    seedParentMenus(db, { omitPath: omittedPath })

    await up(createQueryInterface(db))

    const expected = PERMISSION_CATALOG.filter((e) => e.parentPath !== omittedPath).length
    const omittedCodes = PERMISSION_CATALOG.filter((e) => e.parentPath === omittedPath).map((e) => e.code)
    expect(buttons(db)).toHaveLength(expected)
    expect(buttons(db).some((b) => omittedCodes.includes(b.permission ?? ''))).toBe(false)
    expect(buttons(db).every((b) => b.parentId !== 0)).toBe(true)
  })

  it('menus 无 tenantId 列时不写入该字段', async () => {
    db.menusHaveTenantColumn = false
    seedParentMenus(db)

    await up(createQueryInterface(db))

    expect(buttons(db).length).toBeGreaterThan(0)
    expect(buttons(db).every((b) => !('tenantId' in b))).toBe(true)
  })

  it('有 tenantId 列时按钮继承父菜单租户', async () => {
    seedParentMenus(db)

    await up(createQueryInterface(db))

    for (const button of buttons(db)) {
      const parent = db.menus.find((m) => m.id === button.parentId)
      expect(button.tenantId).toBe(parent?.tenantId)
    }
  })
})

describe('迁移 20261103_000001 down()', () => {
  it('回滚删除目录内的按钮及其授权', async () => {
    seedParentMenus(db)
    const qi = createQueryInterface(db)
    await up(qi)
    const pageMenuIds = db.menus.filter((m) => m.type === 'C').map((m) => m.id)
    const parentGrantsBefore = db.roleMenus.filter((r) => pageMenuIds.includes(r.menuId)).length

    await down(qi)

    expect(buttons(db)).toHaveLength(0)
    expect(db.roleMenus.filter((r) => pageMenuIds.includes(r.menuId))).toHaveLength(parentGrantsBefore)
    expect(db.menus.filter((m) => m.type === 'C')).toHaveLength(new Set(PERMISSION_CATALOG.map((e) => e.parentPath)).size)
  })
})
