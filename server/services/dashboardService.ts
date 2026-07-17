/**
 * 仪表盘 Service 层
 *
 * 职责：封装仪表盘统计数据的业务逻辑
 */

import { Op } from 'sequelize'
import User from '../models/User.js'

interface DashboardCard {
  title: string
  value: number
  icon: string
  color: string
}

/**
 * 获取仪表盘统计数据
 */
export async function getDashboardStats(): Promise<DashboardCard[]> {
  const total = await User.count()
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const todayNew = await User.count({ where: { createdAt: { [Op.gte]: todayStart } } })
  const activeUsers = await User.count({ where: { status: 1 } })

  return [
    { title: '用户总数', value: total, icon: 'User', color: '#409eff' },
    { title: '今日新增', value: todayNew, icon: 'TrendCharts', color: '#67c23a' },
    { title: '活跃用户', value: activeUsers, icon: 'Refresh', color: '#e6a23c' },
    { title: '系统消息', value: 0, icon: 'Message', color: '#f56c6c' },
  ]
}