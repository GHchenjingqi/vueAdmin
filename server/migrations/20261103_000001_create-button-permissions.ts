import { QueryTypes } from 'sequelize'
import type { QueryInterface } from 'sequelize'
import { PERMISSION_CATALOG } from '../utils/permissionCatalog.js'

/**
 * 20261103_000001_create-button-permissions
 *
 * 背景：menus 表此前没有任何 type='F'（按钮）记录，前端 v-permission 与登录返回的
 * permissions 恒为空集，后端也没有任何权限码校验——所有写接口只验登录不验授权，
 * 直接用 curl 即可越权调用（详见 T01）。
 *
 * 本迁移建立按钮权限目录，并**按父菜单继承授权**：
 * 对每个新增按钮，把当前拥有其父页面菜单的角色全部授予该按钮。
 * 因此上线本次迁移后，任何角色的实际可达能力与之前完全一致（不会有人突然被 403），
 * 而从这一刻起「在角色管理里取消勾选某个按钮」才真正等于禁用该操作。
 *
 * 幂等：按 permission 码判重，已存在的按钮只补授权缺口；可重复执行。
 * 父菜单不存在的条目跳过，避免产生 parentId=0 的孤儿按钮记录。
 */

interface ParentRow {
  id: number
  tenantId: number | null
}

async function hasTenantColumn(qi: QueryInterface): Promise<boolean> {
  const cols = await qi.describeTable('menus')
  return Object.keys(cols).includes('tenantId')
}

async function findParentMenu(qi: QueryInterface, path: string, withTenant: boolean): Promise<ParentRow | null> {
  const sql = withTenant
    ? `SELECT id, tenantId FROM menus WHERE path = ? AND type IN ('M', 'C') LIMIT 1`
    : `SELECT id, NULL AS tenantId FROM menus WHERE path = ? AND type IN ('M', 'C') LIMIT 1`
  const rows = (await qi.sequelize.query(sql, { replacements: [path], type: QueryTypes.SELECT })) as Array<{ id: number; tenantId: number | null }>
  return rows.length ? rows[0] : null
}

async function findMenuIdByPermission(qi: QueryInterface, permission: string): Promise<number | null> {
  const rows = (await qi.sequelize.query(`SELECT id FROM menus WHERE permission = ? LIMIT 1`, {
    replacements: [permission],
    type: QueryTypes.SELECT,
  })) as Array<{ id: number }>
  return rows.length ? rows[0].id : null
}

async function insertButton(
  qi: QueryInterface,
  parentId: number,
  permission: string,
  name: string,
  sort: number,
  tenantId: number | null,
  withTenant: boolean,
): Promise<number> {
  const now = new Date()
  const row: Record<string, unknown> = {
    parentId,
    name,
    path: '',
    component: null,
    icon: null,
    type: 'F',
    permission,
    sort,
    status: 1,
    hidden: 0,
    createdAt: now,
    updatedAt: now,
  }
  if (withTenant) row.tenantId = tenantId
  await qi.bulkInsert('menus', [row])
  const id = await findMenuIdByPermission(qi, permission)
  if (!id) throw new Error(`按钮权限菜单插入失败: ${permission}`)
  return id
}

/** 把按钮授予当前已拥有父菜单的全部角色（跳过已有授权，保证幂等） */
async function inheritGrantsFromParent(qi: QueryInterface, parentMenuId: number, buttonMenuId: number): Promise<void> {
  const roleRows = (await qi.sequelize.query(`SELECT DISTINCT roleId FROM role_menus WHERE menuId = ?`, {
    replacements: [parentMenuId],
    type: QueryTypes.SELECT,
  })) as Array<{ roleId: number }>
  if (roleRows.length === 0) return

  const ids = roleRows.map((r) => r.roleId)
  const existing = (await qi.sequelize.query(`SELECT roleId FROM role_menus WHERE menuId = ? AND roleId IN (?)`, {
    replacements: [buttonMenuId, ids],
    type: QueryTypes.SELECT,
  })) as Array<{ roleId: number }>
  const granted = new Set(existing.map((e) => e.roleId))
  const missing = ids.filter((id) => !granted.has(id))
  if (missing.length === 0) return

  const now = new Date()
  await qi.bulkInsert(
    'role_menus',
    missing.map((roleId) => ({ roleId, menuId: buttonMenuId, createdAt: now, updatedAt: now })),
  )
}

export async function up(queryInterface: QueryInterface): Promise<void> {
  const withTenant = await hasTenantColumn(queryInterface)
  const parentCache = new Map<string, ParentRow | null>()
  let sortSeq = 0

  for (const entry of PERMISSION_CATALOG) {
    if (!parentCache.has(entry.parentPath)) {
      parentCache.set(entry.parentPath, await findParentMenu(queryInterface, entry.parentPath, withTenant))
    }
    const parent = parentCache.get(entry.parentPath)
    if (!parent) continue

    sortSeq += 1
    const existingId = await findMenuIdByPermission(queryInterface, entry.code)
    if (existingId) {
      await inheritGrantsFromParent(queryInterface, parent.id, existingId)
      continue
    }

    const buttonId = await insertButton(queryInterface, parent.id, entry.code, entry.name, sortSeq, parent.tenantId, withTenant)
    await inheritGrantsFromParent(queryInterface, parent.id, buttonId)
  }
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  const codes = PERMISSION_CATALOG.map((e) => e.code)
  await queryInterface.sequelize.query(`DELETE FROM role_menus WHERE menuId IN (SELECT id FROM menus WHERE permission IN (?))`, { replacements: [codes] })
  await queryInterface.sequelize.query(`DELETE FROM menus WHERE permission IN (?) AND type = 'F'`, { replacements: [codes] })
}
