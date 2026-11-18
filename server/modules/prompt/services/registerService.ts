/**
 * 前台注册：直接写入框架 users 表，复用同一套登录/鉴权体系。
 * User.beforeCreate 钩子会自动对明文密码做 bcrypt 哈希，此处不要预先哈希。
 */
import { Op } from 'sequelize'
import User from '../../../models/User.js'
import { AppError } from '../../../middleware/errorHandler.js'

export interface RegisterInput {
  username?: string
  password?: string
  nickname?: string
  email?: string
}

export async function register(data: RegisterInput) {
  const username = data.username?.trim() ?? ''
  const password = data.password ?? ''
  const nickname = data.nickname?.trim() || username
  // email 在 users 表中非空且唯一，未填写时生成平台内占位邮箱
  const email = data.email?.trim() || `${username}@portal.local`

  if (!/^[a-zA-Z0-9_]{3,30}$/.test(username)) throw new AppError(400, '用户名需为 3-30 位字母、数字或下划线')
  if (password.length < 6 || password.length > 64) throw new AppError(400, '密码长度需为 6-64 位')
  if (data.email?.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AppError(400, '邮箱格式不正确')

  const existing = await User.findOne({ where: { [Op.or]: [{ username }, { email }] } })
  if (existing) throw new AppError(409, '用户名或邮箱已被占用')

  const user = await User.create({
    username,
    nickname,
    email,
    phone: null,
    password,
    status: 1,
    deptId: null,
    tenantId: 1,
    passwordResetRequired: 0,
  })
  return { id: user.id, username: user.username, nickname: user.nickname }
}
