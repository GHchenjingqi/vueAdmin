/**
 * 用户管理 Service 层
 *
 * 职责：封装用户管理相关的所有业务逻辑
 *
 * 安全整改（越权修复）：
 *   角色授予属于「管理权本身」。此前用户写接口仅校验登录态，任意登录用户可
 *   给自己授予 platform_admin 角色完成提权（实测已复现），也可重置 admin 密码
 *   接管账号。故在此层做归属校验：
 *   - 授予管理权角色（admin / platform_admin）需平台级权限；
 *   - 不可给自己新增高于自身权限的角色（阻断自我提权）；
 *   - 受保护账号（admin）仅平台级可变更。
 *   路由守卫（requireManage）只做粗粒度拦截，两者缺一不可。
 */

import { Op } from 'sequelize'
import crypto from 'crypto'
import ExcelJS from 'exceljs'
import { AppError } from '../middleware/errorHandler.js'
import { logOperation } from '../utils/logger.js'
import { exportExcel } from '../utils/exportExcel.js'
import { normalizeIds, prepareChangeLog } from '../utils/helpers.js'
import { applyDataScopeWhere, isTargetInScope } from '../utils/dataScope.js'
import { createCache, stableKey } from '../utils/cache.js'
import { resolveOperatorAuthority, type OperatorLike } from '../utils/operator.js'
import User from '../models/User.js'
import Department from '../models/Department.js'
import Role from '../models/Role.js'
import UserRole from '../models/UserRole.js'

const USER_PROFILE_ATTRS = ['id', 'username', 'nickname', 'email', 'phone', 'avatar', 'bio', 'status', 'deptId', 'createdAt', 'updatedAt']

/** 管理权角色码：授予这些角色等价于授予管理权 */
const ADMIN_ROLE_CODES = ['admin', 'super_admin', 'platform_admin']

/** 受保护的用户名：不可被非平台级操作者改动或停用 */
const PROTECTED_USERNAMES = ['admin']

/** 操作者上下文（由控制器从 req.user 传入） */
export type UserOperator = OperatorLike & {
  dataScope?: number
  deptId?: number
  deptIds?: number[]
}

/**
 * 断言操作者可变更目标用户的角色分配。
 *
 * 规则：
 *  1. 需具备管理级权限（admin / super_admin / platform_admin 角色）；
 *  2. 授予管理权角色（admin / platform_admin）额外需平台级权限——
 *     否则 admin 角色持有者可自授 platform_admin 完成跨租户提权；
 *  3. 不可给自己新增高于自身权限的角色（阻断自我提权这一独立路径）；
 *  4. 不可变更自己的角色分配（防止把自己降级造成不可逆锁死）。
 */
async function assertCanAssignRoles(targetUserId: number, roleIds: number[] | undefined, op?: UserOperator): Promise<void> {
  if (roleIds === undefined) return

  const authority = await resolveOperatorAuthority(op)
  if (!authority.isManager) {
    throw new AppError(403, 'FORBIDDEN: 角色分配仅管理员可操作')
  }

  if (roleIds.length > 0) {
    const roles = await Role.findAll({ where: { id: { [Op.in]: roleIds } }, attributes: ['id', 'code'] })
    const grantsAdmin = roles.some((r) => ADMIN_ROLE_CODES.includes((r as unknown as { code: string }).code))
    if (grantsAdmin && !authority.isPlatformAdmin) {
      throw new AppError(403, 'FORBIDDEN: 授予管理权角色需平台管理员权限')
    }
  }

  // 自我提权：不可给自己新增自身不具备的角色
  if (op?.id != null && op.id === targetUserId) {
    const ownRoles = await UserRole.findAll({ where: { userId: op.id }, attributes: ['roleId'] })
    const ownRoleIds = new Set(ownRoles.map((ur) => ur.roleId))
    const granted = await Role.findAll({ where: { id: { [Op.in]: roleIds } }, attributes: ['id', 'code'] })
    const escalation = granted.some((r) => {
      const row = r as unknown as { id: number; code: string }
      if (ownRoleIds.has(row.id)) return false
      return ADMIN_ROLE_CODES.includes(row.code) || !authority.roleCodes.includes(row.code)
    })
    if (escalation) {
      throw new AppError(403, 'FORBIDDEN: 不可给自己新增角色')
    }
  }
}

/**
 * 断言操作者可变更目标用户的账号属性。
 * 规则：受保护用户名（admin）的状态/用户名变更仅平台级可为。
 */
async function assertCanMutateProtectedUser(target: { username: string }, op?: UserOperator): Promise<void> {
  if (!PROTECTED_USERNAMES.includes(target.username)) return
  const authority = await resolveOperatorAuthority(op)
  if (!authority.isPlatformAdmin) {
    throw new AppError(403, 'FORBIDDEN: 受保护账号仅平台管理员可操作')
  }
}


const USER_INCLUDES = [
  { model: Department, as: 'dept', attributes: ['id', 'name'] },
  { model: Role, as: 'roles', attributes: ['id', 'name', 'code'], through: { attributes: [] } },
]

// 用户列表缓存（租户作用域已编码进 where，键含 where+分页；写操作后整命名空间失效）
const userListCache = createCache<{ rows: any[]; total: number }>({
  namespace: 'users',
  max: 200,
  maxAgeMs: 60 * 1000,
})

type UserQueryParams = {
  username?: string
  nickname?: string
  phone?: string
  deptId?: number
  startDate?: string
  endDate?: string
}

/**
 * 构建用户查询 WHERE 条件
 */
export function buildUserWhere(query: UserQueryParams) {
  const { username, nickname, phone, deptId, startDate, endDate } = query
  const where: any = {}

  if (username) where.username = { [Op.like]: `%${username}%` }
  if (nickname) where.nickname = { [Op.like]: `%${nickname}%` }
  if (phone) where.phone = { [Op.like]: `%${phone}%` }
  if (deptId) where.deptId = deptId

  if (startDate || endDate) {
    where.createdAt = {}
    if (startDate) where.createdAt[Op.gte] = new Date(startDate)
    if (endDate) where.createdAt[Op.lte] = new Date(`${endDate} 23:59:59`)
  }

  return where
}

/**
 * 获取用户列表（分页搜索）
 * @param reqUser 当前登录用户（用于数据权限过滤，可选）
 */
export async function listUsers(query: UserQueryParams, page: number, pageSize: number, reqUser?: { dataScope?: number; deptId?: number; deptIds?: number[] }) {
  const where = buildUserWhere(query)
  applyDataScopeWhere(where, reqUser || {}, query.deptId)
  const offset = (page - 1) * pageSize

  const cacheKey = stableKey({ where, offset, limit: pageSize })
  return userListCache.getOrSet(cacheKey, async () => {
    const { rows, count } = await User.findAndCountAll({
      where,
      offset,
      limit: pageSize,
      attributes: { exclude: ['password'] },
      include: USER_INCLUDES,
      order: [['id', 'DESC']],
    })
    return { rows, total: count }
  })
}

/**
 * 获取单个用户详情
 * @param reqUser 当前登录用户（用于数据权限校验，可选）
 */
export async function getUserById(userId: number, reqUser?: { dataScope?: number; deptId?: number; deptIds?: number[] }) {
  const user = await User.findByPk(userId, {
    attributes: USER_PROFILE_ATTRS,
    include: USER_INCLUDES,
  })
  if (!user) throw new AppError(404, '用户不存在')
  if (!isTargetInScope((user as any).deptId, reqUser)) {
    throw new AppError(403, '无权访问该用户数据')
  }
  return user
}

/**
 * 创建用户
 */
export async function createUser(
  data: {
    username: string
    nickname: string
    email: string
    phone: string
    password?: string
    status: number
    deptId: number
    roleIds?: number[] | number
  },
  reqUser: UserOperator,
) {
  const { username, nickname, email, phone, password, status, deptId } = data
  const roleIds = normalizeIds(data.roleIds) ?? []

  // 角色授予属管理权操作：需管理员权限；授予管理权角色额外需平台级
  if (roleIds.length > 0) {
    await assertCanAssignRoles(-1, roleIds, reqUser)
  }
  // 受保护用户名不可被非平台级操作者占用
  if (PROTECTED_USERNAMES.includes(username)) {
    const authority = await resolveOperatorAuthority(reqUser)
    if (!authority.isPlatformAdmin) {
      throw new AppError(403, 'FORBIDDEN: 受保护账号仅平台管理员可创建')
    }
  }

  const existing = await User.findOne({ where: { username } })
  if (existing) throw new AppError(409, '用户名已存在')

  const user = await User.create({
    username,
    nickname,
    email,
    phone,
    password: password || crypto.randomBytes(4).toString('hex'),
    status,
    deptId,
    passwordResetRequired: password ? 0 : 1,
  })

  if (roleIds && roleIds.length > 0) {
    await UserRole.bulkCreate(
      roleIds.map((roleId) => ({ userId: user.id, roleId })),
      { ignoreDuplicates: true },
    )
  }

  await userListCache.clear()
  return { id: user.id }
}

/**
 * 更新用户信息
 */
export async function updateUser(
  userId: number,
  data: {
    username?: string
    nickname?: string
    email?: string
    phone?: string
    avatar?: string
    status?: number
    deptId?: number
    roleIds?: number[] | number
  },
  reqUser: UserOperator & { dataScope?: number; deptId?: number; deptIds?: number[] },
) {
  const user = await User.findByPk(userId)
  if (!user) throw new AppError(404, '用户不存在')
  if (!isTargetInScope((user as any).deptId, reqUser)) {
    throw new AppError(403, '无权操作该用户数据')
  }

  const { username, nickname, email, phone, avatar, status, deptId } = data
  const roleIds = normalizeIds(data.roleIds)

  // 角色授予：需管理员权限；授予管理权角色额外需平台级；禁止自我提权
  await assertCanAssignRoles(userId, roleIds === undefined ? undefined : roleIds, reqUser)
  // 受保护账号（admin）的状态/用户名变更仅平台级可为
  await assertCanMutateProtectedUser(user as unknown as { username: string }, reqUser)
  if (username && PROTECTED_USERNAMES.includes(username)) {
    const authority = await resolveOperatorAuthority(reqUser)
    if (!authority.isPlatformAdmin) {
      throw new AppError(403, 'FORBIDDEN: 受保护账号仅平台管理员可操作')
    }
  }

  const updateData = { username, nickname, email, phone, avatar, status, deptId }
  const trackFields = ['username', 'nickname', 'email', 'phone', 'status', 'deptId']
  const { changes, summary } = prepareChangeLog(user, updateData, trackFields)

  await user.update(updateData)

  if (roleIds !== undefined) {
    await UserRole.destroy({ where: { userId: userId } })
    if (roleIds.length > 0) {
      await UserRole.bulkCreate(
        roleIds.map((roleId) => ({ userId, roleId })),
        { ignoreDuplicates: true },
      )
    }
  }

  await userListCache.clear()
  return { changes, summary }
}

/**
 * 修改密码（管理员重置 / 用户自助改密）
 *
 * 安全整改：管理员重置分支此前无任何授权校验——任意登录用户可重置 admin 的密码
 * （实测已复现，构成完整账号接管）。现要求：重置操作须为平台超管，
 * 且目标账号在自己的数据范围内（isTargetInScope）。
 */
export async function changePassword(
  userId: number,
  options: { reset: boolean; oldPassword?: string; password?: string },
  op?: UserOperator & { dataScope?: number; deptId?: number; deptIds?: number[] },
) {
  const user = await User.findByPk(userId)
  if (!user) throw new AppError(404, '用户不存在')

  // 管理员重置密码
  if (options.reset) {
    const authority = await resolveOperatorAuthority(op)
    if (!authority.isManager) {
      throw new AppError(403, 'FORBIDDEN: 重置密码仅管理员可操作')
    }
    if (!isTargetInScope((user as any).deptId, op)) {
      throw new AppError(403, '无权重置该用户密码')
    }
    // 受保护账号（admin）的密码重置需平台级权限
    await assertCanMutateProtectedUser(user as unknown as { username: string }, op)
    const newPassword = '123456'
    user.password = newPassword
    user.passwordResetRequired = 1
    await user.save()
    return { password: newPassword }
  }

  // 用户自助改密
  const { oldPassword, password: newPassword } = options
  if (
    !newPassword ||
    newPassword.length < 8 ||
    !/[A-Z]/.test(newPassword) ||
    !/[a-z]/.test(newPassword) ||
    !/[0-9]/.test(newPassword) ||
    !/[^A-Za-z0-9]/.test(newPassword)
  ) {
    throw new AppError(400, '密码需至少8位，包含大小写字母、数字和特殊字符')
  }
  if (!oldPassword) throw new AppError(400, '原密码不能为空')

  const valid = await user.verifyPassword(oldPassword)
  if (!valid) throw new AppError(400, '原密码不正确')

  user.password = newPassword
  user.passwordResetRequired = 0
  await user.save()

  return { password: newPassword }
}

/**
 * 删除单个用户
 */
export async function deleteUser(userId: number, reqUser?: UserOperator & { dataScope?: number; deptId?: number; deptIds?: number[] }) {
  const user = await User.findByPk(userId)
  if (!user) throw new AppError(404, '用户不存在')
  if (!isTargetInScope((user as any).deptId, reqUser)) {
    throw new AppError(403, '无权删除该用户')
  }
  // 受保护账号（admin / 平台超管）不可被非平台级操作者删除
  await assertCanMutateProtectedUser(user as unknown as { username: string }, reqUser)

  const username = user.username
  await UserRole.destroy({ where: { userId } })
  await user.destroy()
  await userListCache.clear()

  return { id: userId, username }
}

/**
 * 批量删除用户
 */
export async function batchDeleteUsers(ids: number[], reqUser?: UserOperator & { dataScope?: number; deptId?: number; deptIds?: number[] }) {
  const users = await User.findAll({ where: { id: { [Op.in]: ids } } })
  if (users.length === 0) {
    throw new AppError(404, '用户不存在')
  }
  const outOfScope = users.filter((u) => !isTargetInScope((u as any).deptId, reqUser))
  if (outOfScope.length > 0) {
    throw new AppError(403, '无权删除部分用户')
  }
  // 批量删除同样不得触及受保护账号
  for (const u of users) {
    await assertCanMutateProtectedUser(u as unknown as { username: string }, reqUser)
  }

  await UserRole.destroy({ where: { userId: { [Op.in]: ids } } })
  const count = await User.destroy({ where: { id: { [Op.in]: ids } } })
  await userListCache.clear()

  return { count, ids }
}

/**
 * 导出用户列表 Excel
 */
export async function exportUsers(reqUser?: { dataScope?: number; deptId?: number; deptIds?: number[] }) {
  const where: any = {}
  applyDataScopeWhere(where, reqUser || {})
  const users = await User.findAll({
    where,
    attributes: ['id', 'username', 'nickname', 'email', 'phone', 'status', 'createdAt'],
    include: [{ model: Department, as: 'dept', attributes: ['name'] }],
    order: [['id', 'DESC']],
  })

  const data = users.map((u) => ({
    id: u.id,
    username: u.username,
    nickname: u.nickname || '',
    email: u.email || '',
    phone: u.phone || '',
    dept: (u as any).dept?.name || '',
    status: u.status === 1 ? '启用' : '禁用',
    createdAt: u.createdAt ? new Date(u.createdAt).toLocaleString() : '',
  }))

  return exportExcel({
    columns: [
      { prop: 'id', label: 'ID', width: 8 },
      { prop: 'username', label: '用户名', width: 16 },
      { prop: 'nickname', label: '昵称', width: 16 },
      { prop: 'email', label: '邮箱', width: 28 },
      { prop: 'phone', label: '手机号', width: 16 },
      { prop: 'dept', label: '部门', width: 16 },
      { prop: 'status', label: '状态', width: 10 },
      { prop: 'createdAt', label: '创建时间', width: 22 },
    ],
    data,
    filename: '用户列表.xlsx',
    sheetName: '用户列表',
  })
}

/**
 * 下载用户导入模板
 */
export async function downloadTemplate(): Promise<ExcelJS.Buffer> {
  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet('用户导入模板')

  worksheet.columns = [
    { header: '用户名*', key: 'username', width: 18 },
    { header: '昵称*', key: 'nickname', width: 18 },
    { header: '邮箱', key: 'email', width: 28 },
    { header: '手机号', key: 'phone', width: 18 },
    { header: '部门ID*', key: 'deptId', width: 10 },
    { header: '角色ID(多个逗号分隔)', key: 'roleIds', width: 20 },
    { header: '状态(1启用 0禁用)', key: 'status', width: 15 },
  ]

  worksheet.getRow(1).font = { bold: true }
  return workbook.xlsx.writeBuffer()
}

/**
 * 批量导入用户
 */
export async function importUsers(
  filePath: string,
  reqUser: UserOperator,
): Promise<{ total: number; success: number; failed: { row: number; msg: string }[] }> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(filePath)
  const worksheet = workbook.getWorksheet(1)

  if (!worksheet || worksheet.rowCount <= 1) {
    throw new AppError(400, '文件为空或格式错误')
  }

  const result = { total: 0, success: 0, failed: [] }

  // 跳过标题行
  for (let i = 2; i <= worksheet.rowCount; i++) {
    const row = worksheet.getRow(i)
    result.total++

    const username = String(row.getCell(1).value || '').trim()
    const nickname = String(row.getCell(2).value || '').trim()
    const email = String(row.getCell(3).value || '').trim()
    const phone = String(row.getCell(4).value || '').trim()
    const deptIdCell = row.getCell(5).value
    const roleIdsStr = String(row.getCell(6).value || '').trim()
    const statusCell = row.getCell(7).value

    // 必填字段校验
    if (!username || !nickname || !deptIdCell) {
      result.failed.push({ row: i, msg: '缺少必填字段' })
      continue
    }

    const deptId = Number(deptIdCell)
    if (isNaN(deptId)) {
      result.failed.push({ row: i, msg: '部门ID必须是数字' })
      continue
    }

    const roleIds = roleIdsStr
      ? roleIdsStr
          .split(/[,，]/)
          .map((s) => Number(s.trim()))
          .filter((n) => !isNaN(n))
      : []
    const status = statusCell === '禁用' || Number(statusCell) === 0 ? 0 : 1

    try {
      const existing = await User.findOne({ where: { username } })
      if (existing) {
        result.failed.push({ row: i, msg: `用户名 ${username} 已存在` })
        continue
      }

      const tempPwd = crypto.randomBytes(4).toString('hex')
      // 批量导入同样受角色授予规则约束（roleIds 列可携带管理权角色码）
      if (roleIds.length > 0) {
        await assertCanAssignRoles(-1, roleIds, reqUser)
      }
      const user = await User.create({
        username,
        nickname,
        email,
        phone,
        password: tempPwd,
        deptId,
        status,
        passwordResetRequired: 1,
      })

      if (roleIds.length > 0) {
        await UserRole.bulkCreate(
          roleIds.map((roleId) => ({ userId: user.id, roleId })),
          { ignoreDuplicates: true },
        )
      }

      result.success++
    } catch (err) {
      result.failed.push({ row: i, msg: err instanceof Error ? err.message : '未知错误' })
    }
  }

  await userListCache.clear()
  return result
}
