import type { QueryInterface } from 'sequelize'
import { DataTypes, Op, QueryTypes } from 'sequelize'
import Menu from '../models/Menu.js'
import { PLATFORM_TENANT_ID } from '../modules/tenant/constants.js'
import { materializeTenantMenus } from '../modules/tenant/services/menuTemplateService.js'
import { PERMISSION_CATALOG } from '../utils/permissionCatalog.js'

/**
 * 20261109_000002_tenantize-menu-templates-and-roles
 *
 * T11 的前置：把「菜单/角色」从全局共享改造成「平台模板 + 每租户副本」。
 * 此前所有租户读同一批菜单行，任何租户改名/停用都会波及其他租户，也无法给新租户初始化。
 *
 * 做的事（全部幂等，可重复执行）：
 * 1. menus 增加 copyable 列：0 表示平台专属，永不随模板下发；
 * 2. 落库平台控制台菜单「租户管理」及其按钮权限（只授 platform_admin 角色）；
 * 3. roles 的全局 name/code 唯一索引改为租户内联合唯一（否则第二个租户无法建 admin 角色）；
 * 4. 为已有租户物化菜单副本，并把其角色授权从模板行改写到副本行。
 *
 * 已知取舍：回滚是有损的——租户副本连同其角色授权一并删除，降级后需重新执行 up 或手工
 * 重授租户角色；不做「授权映射还原」，因为回滚时无法可靠判断哪条授权来自哪一行模板。
 */

async function columnExists(qi: QueryInterface, table: string, column: string): Promise<boolean> {
  const cols = await qi.describeTable(table)
  return Object.keys(cols).includes(column)
}

async function hasIndexOn(qi: QueryInterface, table: string, columns: string[], unique?: boolean): Promise<boolean> {
  const indexes = (await qi.showIndex(table)) as any[]
  return indexes.some((idx) => {
    const fields = (idx.fields ?? []).map((f: any) => f.attribute)
    const same = fields.length === columns.length && columns.every((c, i) => fields[i] === c)
    return same && (unique === undefined || idx.unique === unique)
  })
}

async function findMenuId(qi: QueryInterface, column: 'path' | 'permission', value: string): Promise<number | null> {
  const rows = (await qi.sequelize.query(`SELECT id FROM menus WHERE ${column} = ? LIMIT 1`, {
    replacements: [value],
    type: QueryTypes.SELECT,
  })) as Array<{ id: number }>
  return rows.length ? rows[0].id : null
}

export async function up(queryInterface: QueryInterface): Promise<void> {
  if (!(await columnExists(queryInterface, 'menus', 'copyable'))) {
    await queryInterface.addColumn('menus', 'copyable', {
      type: DataTypes.TINYINT,
      allowNull: false,
      defaultValue: 1,
      comment: '租户开通时是否复制该菜单: 1=复制, 0=平台专属',
    })
  }

  // 角色名/编码从全局唯一降级为租户内唯一，否则每个租户的管理员角色都叫 admin 会撞索引
  const indexes = (await queryInterface.showIndex('roles')) as any[]
  for (const column of ['name', 'code']) {
    const globalUnique = indexes.find((idx) => (idx.fields ?? []).map((f: any) => f.attribute).join() === column && idx.unique)
    if (globalUnique) await queryInterface.removeIndex('roles', globalUnique.name)
  }
  if (!(await hasIndexOn(queryInterface, 'roles', ['tenantId', 'code'], true))) {
    await queryInterface.addIndex('roles', ['tenantId', 'code'], { unique: true })
  }
  if (!(await hasIndexOn(queryInterface, 'roles', ['tenantId', 'name'], true))) {
    await queryInterface.addIndex('roles', ['tenantId', 'name'], { unique: true })
  }

  await materializeTenantMenus()
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  console.warn('[migrate] 回滚将删除各租户的菜单副本及其角色授权，租户角色需重新授权')

  const tenantCodes = PERMISSION_CATALOG.filter((e) => e.parentPath === '/tenants').map((e) => e.code)
  await queryInterface.sequelize.query(`DELETE FROM role_menus WHERE menuId IN (SELECT id FROM menus WHERE permission IN (?))`, { replacements: [tenantCodes] })
  await queryInterface.sequelize.query(`DELETE FROM menus WHERE permission IN (?) AND type = 'F'`, { replacements: [tenantCodes] })

  const pageId = await findMenuId(queryInterface, 'path', '/tenants')
  if (pageId) {
    await queryInterface.sequelize.query('DELETE FROM role_menus WHERE menuId = ?', { replacements: [pageId] })
    await queryInterface.sequelize.query('DELETE FROM menus WHERE id = ?', { replacements: [pageId] })
  }

  const copyIds = (await Menu.findAll({ where: { tenantId: { [Op.gt]: PLATFORM_TENANT_ID } }, attributes: ['id'] })).map((m) => m.id)
  if (copyIds.length > 0) {
    await queryInterface.sequelize.query('DELETE FROM role_menus WHERE menuId IN (?)', { replacements: [copyIds] })
    await queryInterface.sequelize.query('DELETE FROM menus WHERE id IN (?)', { replacements: [copyIds] })
  }

  if (await columnExists(queryInterface, 'menus', 'copyable')) {
    await queryInterface.removeColumn('menus', 'copyable')
  }

  for (const columns of [
    ['tenantId', 'code'],
    ['tenantId', 'name'],
  ]) {
    if (await hasIndexOn(queryInterface, 'roles', columns, true)) {
      await queryInterface.removeIndex('roles', `roles_${columns.join('_')}`)
    }
  }
  for (const column of ['name', 'code']) {
    try {
      await queryInterface.addIndex('roles', [column], { unique: true })
    } catch {
      console.warn(`[migrate] 无法恢复 roles.${column} 全局唯一索引：租户间存在同名/同码角色`)
    }
  }
}
