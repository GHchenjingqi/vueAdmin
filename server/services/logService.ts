/**
 * 系统日志 Service 层
 *
 * 职责：封装系统日志管理的所有业务逻辑
 */

import { Op } from 'sequelize'
import Log from '../models/Log.js'
import { AppError } from '../middleware/errorHandler.js'
import { exportExcel } from '../utils/exportExcel.js'

const EXPORT_COLUMNS = [
  { prop: 'type', label: '日志类型', width: 12 },
  { prop: 'username', label: '操作用户', width: 16 },
  { prop: 'action', label: '动作', width: 20 },
  { prop: 'target', label: '操作对象', width: 30 },
  { prop: 'ipAddress', label: 'IP地址', width: 18 },
  { prop: 'createdAt', label: '时间', width: 22 },
]

interface LogQuery {
  type?: string
  action?: string
  keyword?: string
  startDate?: string
  endDate?: string
}

/**
 * 构建日志查询 WHERE 条件
 */
function buildLogWhere(query: LogQuery): Record<string, unknown> {
  const { type, action, keyword, startDate, endDate } = query
  const where: Record<string, unknown> = {}

  if (type && ['login', 'operation'].includes(type)) where.type = type
  if (action && action.trim()) where.action = { [Op.like]: `%${action.trim()}%` }
  if (keyword && keyword.trim()) {
    where[Op.or] = [
      { username: { [Op.like]: `%${keyword.trim()}%` } },
      { target: { [Op.like]: `%${keyword.trim()}%` } },
    ]
  }
  if (startDate && endDate) {
    where.createdAt = { [Op.between]: [new Date(startDate), new Date(`${endDate} 23:59:59`)] }
  }

  return where
}

/**
 * 导出日志为 Excel
 */
export async function exportLogs(query: { type?: string; startDate?: string; endDate?: string }) {
  const { type, startDate, endDate } = query
  const where: Record<string, unknown> = {}

  if (type && ['login', 'operation'].includes(type)) where.type = type
  if (startDate && endDate) {
    where.createdAt = { [Op.between]: [new Date(startDate), new Date(`${endDate} 23:59:59`)] }
  }

  const logs = await Log.findAll({ where, order: [['createdAt', 'DESC']], limit: 10000 })
  const data = logs.map(l => ({
    type: l.type === 'login' ? '登录日志' : '操作日志',
    username: l.username || '',
    action: l.action,
    target: l.target || '',
    ipAddress: l.ipAddress || '',
    createdAt: l.createdAt ? new Date(l.createdAt).toLocaleString() : '',
  }))

  const { buffer, filename } = await exportExcel({ columns: EXPORT_COLUMNS, data, filename: '系统日志.xlsx', sheetName: '系统日志' })
  return { buffer, filename }
}

/**
 * 获取登录失败统计
 */
export async function getLoginFailures(query: { startDate?: string; endDate?: string }) {
  const { startDate, endDate } = query
  const where: Record<string, unknown> = { type: 'login', action: { [Op.like]: '%失败%' } }

  if (startDate && endDate) {
    where.createdAt = { [Op.between]: [new Date(startDate), new Date(`${endDate} 23:59:59`)] }
  }

  const failures = await Log.findAll({
    where,
    attributes: ['username', 'ipAddress', 'createdAt', 'target'],
    order: [['createdAt', 'DESC']],
    limit: 100,
  })

  const ipStats: Record<string, { ip: string; count: number; lastTime: string; usernames: Set<string> }> = {}
  failures.forEach(f => {
    const ip: string = f.ipAddress || 'unknown'
    if (!ipStats[ip]) ipStats[ip] = { ip, count: 0, lastTime: '', usernames: new Set() }
    ipStats[ip].count++
    if (!ipStats[ip].lastTime || f.createdAt > ipStats[ip].lastTime) ipStats[ip].lastTime = f.createdAt
    ipStats[ip].usernames.add(f.username)
  })

  const ipList = Object.values(ipStats).map(s => ({
    ip: s.ip,
    count: s.count,
    usernames: [...s.usernames].join(', '),
    lastTime: s.lastTime ? new Date(s.lastTime).toLocaleString() : '',
  }))

  return { total: failures.length, ipStats: ipList, details: failures }
}

/**
 * 获取日志列表（分页）
 */
export async function listLogs(query: LogQuery & { page: number; pageSize: number }) {
  const { page, pageSize } = query
  const where = buildLogWhere(query)
  const offset = (page - 1) * pageSize

  const { rows, count } = await Log.findAndCountAll({
    where,
    offset,
    limit: pageSize,
    order: [['createdAt', 'DESC']],
  })

  return { rows, total: count }
}

/**
 * 获取日志详情
 */
export async function getLogById(id: number) {
  const log = await Log.findByPk(id)
  if (!log) throw new AppError(404, '日志不存在')
  return log
}

/**
 * 清理过期日志
 */
export async function cleanupLogs(query: { beforeDays?: number; type?: string }) {
  const { beforeDays = 90, type } = query
  const days = Number(beforeDays)

  const where: Record<string, unknown> = {}
  if (days > 0) {
    where.createdAt = { [Op.lt]: new Date(Date.now() - days * 24 * 60 * 60 * 1000) }
  }
  if (type && ['login', 'operation'].includes(type)) where.type = type

  const deletedCount = await Log.destroy({ where })
  const scope = days <= 0 ? '全部' : `${days} 天前的`
  return { deletedCount, scope }
}