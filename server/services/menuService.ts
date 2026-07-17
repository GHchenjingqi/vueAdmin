/**
 * 菜单管理 Service 层
 *
 * 职责：封装菜单管理的所有业务逻辑
 */

import { Op } from 'sequelize'
import Menu from '../models/Menu.js'
import Role from '../models/Role.js'
import RoleMenu from '../models/RoleMenu.js'
import UserRole from '../models/UserRole.js'
import { AppError } from '../middleware/errorHandler.js'
import { buildTree } from '../utils/helpers.js'

/**
 * 获取用户角色 ID 列表
 */
async function getUserRoleIds(userId: number): Promise<number[]> {
  const userRoles = await UserRole.findAll({
    where: { userId },
    attributes: ['roleId'],
  })
  return userRoles.map(ur => ur.roleId)
}

/**
 * 判断用户是否拥有管理员角色（dataScope = 1）
 */
async function hasAdminRole(roleIds: number[]): Promise<boolean> {
  if (roleIds.length === 0) return false
  const adminRole = await Role.findOne({ where: { id: { [Op.in]: roleIds }, dataScope: 1 } })
  return !!adminRole
}

/**
 * 递归收集所有父级菜单 ID
 */
function collectParentIds(allMenus: Array<{ id: number; parentId: number }>, ids: Set<number>): void {
  const menuMap = new Map(allMenus.map(m => [m.id, m]))
  for (const id of [...ids]) {
    let currentId = id
    while (currentId) {
      const menu = menuMap.get(currentId)
      if (!menu || menu.parentId === 0) break
      ids.add(menu.parentId)
      currentId = menu.parentId
    }
  }
}

/**
 * 递归清理侧边栏菜单树：移除没有子节点的目录节点
 */
function removeEmptyDirs(tree: any[]): any[] {
  return tree
    .map(node => {
      if (node.children && node.children.length > 0) {
        node.children = removeEmptyDirs(node.children)
      }
      return node
    })
    .filter(node => {
      if (node.type === 'C' && (!node.children || node.children.length === 0)) {
        return false
      }
      return true
    })
}

/**
 * 递归获取所有子菜单 ID
 */
async function getChildIds(id: number): Promise<number[]> {
  const allMenus = await Menu.findAll({ attributes: ['id', 'parentId'], order: [['id', 'ASC']] })
  const ids: number[] = []
  const collect = (parentId: number): void => {
    allMenus.filter(m => m.parentId === parentId).forEach(m => {
      ids.push(m.id)
      collect(m.id)
    })
  }
  collect(Number(id))
  return ids
}

/**
 * 获取菜单列表
 * - scope='tree' 侧边栏树（权限过滤）
 * - scope='options' 选项树（下拉用）
 * - 默认：管理后台全部菜单
 */
export async function listMenus(scope: string | undefined, userId?: number) {
  if (scope === 'options') {
    const menus = await Menu.findAll({ order: [['sort', 'ASC']] })
    return buildTree(menus)
  }

  if (scope === 'tree' && userId) {
    const roleIds = await getUserRoleIds(userId)
    if (roleIds.length === 0) return []

    if (await hasAdminRole(roleIds)) {
      const menus = await Menu.findAll({
        where: { status: 1, hidden: 0 },
        order: [['sort', 'ASC']],
      })
      return removeEmptyDirs(buildTree(menus))
    }

    const roleMenus = await RoleMenu.findAll({
      where: { roleId: { [Op.in]: roleIds } },
      attributes: ['menuId'],
    })
    const menuIds = new Set(roleMenus.map(rm => rm.menuId))
    if (menuIds.size === 0) return []

    const allPossibleMenus = await Menu.findAll({
      where: { status: 1, hidden: 0 },
      attributes: ['id', 'parentId'],
    })
    collectParentIds(allPossibleMenus, menuIds)

    const menus = await Menu.findAll({
      where: { id: { [Op.in]: [...menuIds] }, status: 1, hidden: 0 },
      order: [['sort', 'ASC']],
    })
    return removeEmptyDirs(buildTree(menus))
  }

  const menus = await Menu.findAll({ order: [['sort', 'ASC']] })
  return buildTree(menus)
}

/**
 * 获取单个菜单
 */
export async function getMenuById(id: number) {
  const menu = await Menu.findByPk(id)
  if (!menu) throw new AppError(404, '菜单不存在')
  return menu
}

/**
 * 创建菜单
 */
export async function createMenu(data: {
  parentId?: number
  name: string
  path?: string
  component?: string
  icon?: string
  sort?: number
  type?: string
  permission?: string
  status?: number
  hidden?: number
}) {
  const { parentId, name, path, component, icon, sort, type, permission, status, hidden } = data

  if (parentId && parentId !== 0) {
    const parent = await Menu.findByPk(parentId)
    if (parent) {
      const grandparent = parent.parentId ? await Menu.findByPk(parent.parentId) : null
      if (grandparent && grandparent.parentId !== 0) {
        throw new AppError(400, '菜单最多支持3级嵌套')
      }
    }
  }

  if (type === 'M' && !component) {
    throw new AppError(400, '菜单类型必须选择组件')
  }

  if (type === 'F' && !data.permission) {
    throw new AppError(400, '按钮类型必须填写权限标识')
  }

  const menu = await Menu.create({ parentId, name, path, component, icon, sort, type, permission, status, hidden })
  return { id: menu.id }
}

/**
 * 更新菜单
 */
export async function updateMenu(
  id: number,
  data: {
    parentId?: number
    name: string
    path?: string
    component?: string
    icon?: string
    sort?: number
    type?: string
    permission?: string
    status?: number
    hidden?: number
  },
) {
  const menu = await Menu.findByPk(id)
  if (!menu) throw new AppError(404, '菜单不存在')

  const { parentId, name, path, component, icon, sort, type, permission, status, hidden } = data
  const safeParentId = parentId || 0

  if (safeParentId) {
    const children = await getChildIds(id)
    if (children.includes(Number(parentId))) {
      throw new AppError(400, '不能将子菜单设为父菜单')
    }
  }

  await menu.update({ parentId: safeParentId, name, path, component, icon, sort, type, permission, status, hidden })
}

/**
 * 删除菜单
 */
export async function deleteMenu(id: number) {
  const menu = await Menu.findByPk(id)
  if (!menu) throw new AppError(404, '菜单不存在')

  const childCount = await Menu.count({ where: { parentId: id } })
  if (childCount > 0) throw new AppError(400, '请先删除子菜单')

  await menu.destroy()
}