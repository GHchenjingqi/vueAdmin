/**
 * 仪表盘 Service 层
 *
 * 职责：封装仪表盘统计数据的业务逻辑
 */

import { Op } from 'sequelize'
import User from '../models/User.js'
import { createCache } from '../utils/cache.js'

// 仪表盘统计缓存（仅含全局计数，TTL 短）
const dashboardCache = createCache<{ title: string; value: number; icon: string; color: string }[]>({
  namespace: 'dashboard',
  max: 20,
  maxAgeMs: 60 * 1000,
})

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
  return dashboardCache.getOrSet('stats', async () => {
    // count 重载在带 where 时被推断为 GroupedCountResultItem[]，运行时恒为 number，双重转换消除类型摩擦
    const total = (await User.count()) as unknown as number
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    const todayNew = (await User.count({ where: { createdAt: { [Op.gte]: todayStart } } })) as unknown as number
    const activeUsers = (await User.count({ where: { status: 1 } })) as unknown as number

    return [
      { title: '用户总数', value: total, icon: 'User', color: '#409eff' },
      { title: '今日新增', value: todayNew, icon: 'TrendCharts', color: '#67c23a' },
      { title: '活跃用户', value: activeUsers, icon: 'Refresh', color: '#e6a23c' },
      { title: '系统消息', value: 0, icon: 'Message', color: '#f56c6c' },
    ]
  })
}
