/**
 * 角色管理 Service 层
 *
 * 职责：封装角色管理的所有业务逻辑
 *
 * 安全整改（越权修复）：
 *   角色定义即权限体系本身。此前角色写接口仅校验登录态，任意普通用户可
 *   创建 dataScope=1 的角色、改写/删除 platform_admin 角色（实测已复现），
 *   配合用户角色授予接口即完成提权。现要求角色写操作由平台超管执行，
 *   并禁止占用受保护角色码。
 */

import { Op } from 'sequelize'
import Role from '../models/Role.js'
import Menu from '../models/Menu.js'
import RoleMenu from '../models/RoleMenu.js'
import { AppError } from '../middleware/errorHandler.js'
import { normalizeIds, prepareChangeLog } from '../utils/helpers.js'
import { resolveOperatorAuthority, type OperatorLike } from '../utils/operator.js'

const ROLE_INCLUDE = [{ model: Menu, as: 'menus', attributes: ['id'], through: { attributes: [] } }]
const ROLE_TRACK_FIELDS = ['name', 'code', 'sort', 'status', 'dataScope', 'remark']

/** 受保护角色码：平台超管 / 管理员角色，其定义不可被普通管理角色改写或删除 */
const PROTECTED_ROLE_CODES = ['platform_admin', 'admin', 'super_admin']

/** 操作者上下文 */
export type RoleOperator = OperatorLike

/**
 * 断言操作者可执行角色写操作：需管理员权限（admin / super_admin / platform_admin）。
 * 角色体系是权限根基，任意登录用户可改写即等于允许自我提权。
 */
async function assertRoleWriteAllowed(op?: RoleOperator): Promise<void> {
  const authority = await resolveOperatorAuthority(op)
  if (!authority.isManager) {
    throw new AppError(403, 'FORBIDDEN: 角色管理仅管理员可操作')
  }
}

/**
 * 断言目标角色码未被受保护码占用（创建/改名时拦截）。
 * 受保护码的既有角色只能由平台级操作者改动。
 */
async function assertRoleCodeAllowed(code: string, op?: RoleOperator): Promise<void> {
  if (!PROTECTED_ROLE_CODES.includes(code)) return
  const authority = await resolveOperatorAuthority(op)
  if (!authority.isPlatformAdmin) {
    throw new AppError(403, 'FORBIDDEN: 受保护角色编码仅平台管理员可使用')
  }
}

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
export async function createRole(
  data: {
    name: string
    code: string
    sort: number
    status: number
    dataScope: number
    remark?: string
    menuIds?: number[] | number
  },
  op?: RoleOperator,
) {
  await assertRoleWriteAllowed(op)
  const { name, code, sort, status, dataScope, remark } = data
  const menuIds = normalizeIds(data.menuIds)

  // 受保护角色码不可被占用（避免伪造 platform_admin）
  await assertRoleCodeAllowed(code, op)

  const existing = await Role.findOne({ where: { [Op.or]: [{ name }, { code }] } })
  if (existing) throw new AppError(409, '角色名称或编码已存在')

  const role = await Role.create({ name, code, sort, status, dataScope, remark })

  if (menuIds && menuIds.length > 0) {
    await RoleMenu.bulkCreate(menuIds.map((menuId) => ({ roleId: role.id, menuId })))
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
  op?: RoleOperator,
) {
  await assertRoleWriteAllowed(op)
  const role = await Role.findByPk(roleId)
  if (!role) throw new AppError(404, '角色不存在')

  const { name, code, sort, status, dataScope, remark } = data
  // 改名不得占用受保护角色码
  await assertRoleCodeAllowed(code, op)
  // 受保护角色的既有定义仅平台级可改写
  if (PROTECTED_ROLE_CODES.includes(role.code)) {
    const authority = await resolveOperatorAuthority(op)
    if (!authority.isPlatformAdmin) {
      throw new AppError(403, 'FORBIDDEN: 受保护角色仅平台管理员可修改')
    }
  }
  const menuIds = normalizeIds(data.menuIds)
  const updateData = { name, code, sort, status, dataScope, remark }
  const { changes, summary } = prepareChangeLog(role, updateData, ROLE_TRACK_FIELDS)

  await role.update(updateData)

  if (menuIds !== undefined) {
    await RoleMenu.destroy({ where: { roleId } })
    if (menuIds.length > 0) {
      await RoleMenu.bulkCreate(menuIds.map((menuId) => ({ roleId, menuId })))
    }
  }

  return { changes, summary, name }
}

/**
 * 删除角色
 */
export async function deleteRole(roleId: number, op?: RoleOperator) {
  await assertRoleWriteAllowed(op)
  const role = await Role.findByPk(roleId)
  if (!role) throw new AppError(404, '角色不存在')

  // 受保护角色（platform_admin / admin）不可删除，避免删掉后平台失去管理角色
  if (PROTECTED_ROLE_CODES.includes(role.code)) {
    const authority = await resolveOperatorAuthority(op)
    if (!authority.isPlatformAdmin) {
      throw new AppError(403, 'FORBIDDEN: 受保护角色仅平台管理员可删除')
    }
    throw new AppError(403, 'FORBIDDEN: 受保护角色不可删除')
  }

  const roleName = role.name
  await RoleMenu.destroy({ where: { roleId } })
  await role.destroy()

  return { id: roleId, name: roleName }
}
