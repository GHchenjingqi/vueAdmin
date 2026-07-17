/**
 * 角色管理 Service 层
 *
 * 职责：封装角色管理的所有业务逻辑
 */

import { Op } from 'sequelize'
import Role from '../models/Role.js'
import Menu from '../models/Menu.js'
import RoleMenu from '../models/RoleMenu.js'
import { AppError } from '../middleware/errorHandler.js'
import { normalizeIds, prepareChangeLog } from '../utils/helpers.js'

const ROLE_INCLUDE = [{ model: Menu, as: 'menus', attributes: ['id'], through: { attributes: [] } }]
const ROLE_TRACK_FIELDS = ['name', 'code', 'sort', 'status', 'dataScope', 'remark']

/**
 * 获取所有启用角色（下拉选择器用）
 */
export async function getAllActiveRoles() {
  const roles = await Role.findAll({
    where: { status: 1 },
    order: [['sort', 'ASC']],
    attributes: ['id', 'name', 'code'],
  })
  return roles
}

/**
 * 获取角色列表（分页搜索）
 */
export async function listRoles(query: { page?: number; pageSize?: number; name?: string }) {
  const { page = 1, pageSize = 10, name } = query
  const offset = (Number(page) - 1) * Number(pageSize)
  const where = name ? { name: { [Op.like]: `%${name}%` } } : {}

  const { rows, count } = await Role.findAndCountAll({
    where,
    offset,
    limit: Number(pageSize),
    order: [['sort', 'ASC']],
    include: ROLE_INCLUDE,
  })

  return { rows, total: count }
}

/**
 * 获取单个角色
 */
export async function getRoleById(roleId: number) {
  const role = await Role.findByPk(roleId, { include: ROLE_INCLUDE })
  if (!role) throw new AppError(404, '角色不存在')
  return role
}

/**
 * 创建角色
 */
export async function createRole(data: {
  name: string
  code: string
  sort: number
  status: number
  dataScope: number
  remark?: string
  menuIds?: number[] | number
}) {
  const { name, code, sort, status, dataScope, remark } = data
  const menuIds = normalizeIds(data.menuIds)

  const existing = await Role.findOne({ where: { [Op.or]: [{ name }, { code }] } })
  if (existing) throw new AppError(409, '角色名称或编码已存在')

  const role = await Role.create({ name, code, sort, status, dataScope, remark })

  if (menuIds && menuIds.length > 0) {
    await RoleMenu.bulkCreate(menuIds.map(menuId => ({ roleId: role.id, menuId })))
  }

  return { id: role.id, name }
}

/**
 * 更新角色
 */
export async function updateRole(
  roleId: number,
  data: {
    name: string
    code: string
    sort: number
    status: number
    dataScope: number
    remark?: string
    menuIds?: number[] | number
  },
) {
  const role = await Role.findByPk(roleId)
  if (!role) throw new AppError(404, '角色不存在')

  const { name, code, sort, status, dataScope, remark } = data
  const menuIds = normalizeIds(data.menuIds)
  const updateData = { name, code, sort, status, dataScope, remark }
  const { changes, summary } = prepareChangeLog(role, updateData, ROLE_TRACK_FIELDS)

  await role.update(updateData)

  if (menuIds !== undefined) {
    await RoleMenu.destroy({ where: { roleId } })
    if (menuIds.length > 0) {
      await RoleMenu.bulkCreate(menuIds.map(menuId => ({ roleId, menuId })))
    }
  }

  return { changes, summary, name }
}

/**
 * 删除角色
 */
export async function deleteRole(roleId: number) {
  const role = await Role.findByPk(roleId)
  if (!role) throw new AppError(404, '角色不存在')

  const roleName = role.name
  await RoleMenu.destroy({ where: { roleId } })
  await role.destroy()

  return { id: roleId, name: roleName }
}