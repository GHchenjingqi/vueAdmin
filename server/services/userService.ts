/**
 * 用户管理 Service 层
 *
 * 职责：封装用户管理相关的所有业务逻辑
 */

import { Op } from 'sequelize'
import crypto from 'crypto'
import ExcelJS from 'exceljs'
import { AppError } from '../middleware/errorHandler.js'
import { logOperation } from '../utils/logger.js'
import { exportExcel } from '../utils/exportExcel.js'
import { normalizeIds, prepareChangeLog } from '../utils/helpers.js'
import User from '../models/User.js'
import Department from '../models/Department.js'
import Role from '../models/Role.js'
import UserRole from '../models/UserRole.js'

const USER_PROFILE_ATTRS = [
  'id', 'username', 'nickname', 'email', 'phone', 'avatar',
  'bio', 'status', 'deptId', 'createdAt', 'updatedAt',
] as const

const USER_INCLUDES = [
  { model: Department, as: 'dept', attributes: ['id', 'name'] },
  { model: Role, as: 'roles', attributes: ['id', 'name', 'code'], through: { attributes: [] } },
]

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
 */
export async function listUsers(query: UserQueryParams, page: number, pageSize: number) {
  const where = buildUserWhere(query)
  const offset = (page - 1) * pageSize

  const { rows, count } = await User.findAndCountAll({
    where,
    offset,
    limit: pageSize,
    attributes: { exclude: ['password'] },
    include: USER_INCLUDES,
    order: [['id', 'DESC']],
  })

  return { rows, total: count }
}

/**
 * 获取单个用户详情
 */
export async function getUserById(userId: number) {
  const user = await User.findByPk(userId, {
    attributes: USER_PROFILE_ATTRS,
    include: USER_INCLUDES,
  })
  if (!user) throw new AppError(404, '用户不存在')
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
  reqUser: { id: number; username: string },
) {
  const { username, nickname, email, phone, password, status, deptId } = data
  const roleIds = normalizeIds(data.roleIds)

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
      roleIds.map(roleId => ({ userId: user.id, roleId })),
      { ignoreDuplicates: true },
    )
  }

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
  reqUser: { id: number; username: string },
) {
  const user = await User.findByPk(userId)
  if (!user) throw new AppError(404, '用户不存在')

  const { username, nickname, email, phone, avatar, status, deptId } = data
  const roleIds = normalizeIds(data.roleIds)

  const updateData = { username, nickname, email, phone, avatar, status, deptId }
  const trackFields = ['username', 'nickname', 'email', 'phone', 'status', 'deptId']
  const { changes, summary } = prepareChangeLog(user, updateData, trackFields)

  await user.update(updateData)

  if (roleIds !== undefined) {
    await UserRole.destroy({ where: { userId: userId } })
    if (roleIds.length > 0) {
      await UserRole.bulkCreate(
        roleIds.map(roleId => ({ userId, roleId })),
        { ignoreDuplicates: true },
      )
    }
  }

  return { changes, summary }
}

/**
 * 修改密码（管理员重置 / 用户自助改密）
 */
export async function changePassword(
  userId: number,
  options: { reset: boolean; oldPassword?: string; password?: string },
) {
  const user = await User.findByPk(userId)
  if (!user) throw new AppError(404, '用户不存在')

  // 管理员重置密码
  if (options.reset) {
    const newPassword = crypto.randomBytes(4).toString('hex')
    user.password = newPassword
    user.passwordResetRequired = 1
    await user.save()
    return { password: newPassword }
  }

  // 用户自助改密
  const { oldPassword, password: newPassword } = options
  if (!newPassword || newPassword.length < 8 ||
      !/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) ||
      !/[0-9]/.test(newPassword) || !/[^A-Za-z0-9]/.test(newPassword)) {
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
export async function deleteUser(userId: number) {
  const user = await User.findByPk(userId)
  if (!user) throw new AppError(404, '用户不存在')

  const username = user.username
  await UserRole.destroy({ where: { userId } })
  await user.destroy()

  return { id: userId, username }
}

/**
 * 批量删除用户
 */
export async function batchDeleteUsers(ids: number[]) {
  const users = await User.findAll({ where: { id: { [Op.in]: ids } } })
  if (users.length === 0) {
    throw new AppError(404, '用户不存在')
  }

  await UserRole.destroy({ where: { userId: { [Op.in]: ids } } })
  const count = await User.destroy({ where: { id: { [Op.in]: ids } } })

  return { count, ids }
}

/**
 * 导出用户列表 Excel
 */
export async function exportUsers() {
  const users = await User.findAll({
    attributes: ['id', 'username', 'nickname', 'email', 'phone', 'status', 'createdAt'],
    include: [{ model: Department, as: 'dept', attributes: ['name'] }],
    order: [['id', 'DESC']],
  })

  const data = users.map(u => ({
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
  reqUser: { id: number; username: string },
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

    const roleIds = roleIdsStr ? roleIdsStr.split(/[,，]/).map(s => Number(s.trim())).filter(n => !isNaN(n)) : []
    const status = statusCell === '禁用' || Number(statusCell) === 0 ? 0 : 1

    try {
      const existing = await User.findOne({ where: { username } })
      if (existing) {
        result.failed.push({ row: i, msg: `用户名 ${username} 已存在` })
        continue
      }

      const tempPwd = crypto.randomBytes(4).toString('hex')
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
          roleIds.map(roleId => ({ userId: user.id, roleId })),
          { ignoreDuplicates: true },
        )
      }

      result.success++
    } catch (err) {
      result.failed.push({ row: i, msg: err instanceof Error ? err.message : '未知错误' })
    }
  }

  return result
}