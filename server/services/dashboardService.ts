/**
 * 仪表盘 Service 层
 *
 * 职责：封装仪表盘统计数据的业务逻辑
 */

import { Op, fn, literal, col } from 'sequelize'
import User from '../models/User.js'
import ShopOrder from '../modules/shop/models/ShopOrder.js'
import { createCache } from '../utils/cache.js'

// 仪表盘统计缓存（仅含全局计数，TTL 短）
const dashboardCache = createCache<{ title: string; value: number; icon: string; color: string }[]>({
  namespace: 'dashboard',
  max: 20,
  maxAgeMs: 60 * 1000,
})

// 时间序列缓存（P2-12 ECharts 增强）
const dashboardTrendCache = createCache<DashboardTrend>({
  namespace: 'dashboard-trend',
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

/**
 * 仪表盘时间序列（P2-12 ECharts 增强）。
 * 返回最近 n 天（7~90）每日新增用户、新增订单与成交额（元），缺失日期补 0。
 * 统计为全局口径（仪表盘不分租户）。
 */
export interface DashboardTrend {
  days: string[]
  newUsers: number[]
  newOrders: number[]
  revenue: number[]
}

export async function getDashboardTrends(days = 30): Promise<DashboardTrend> {
  return dashboardTrendCache.getOrSet('trends-' + days, async () => {
    const n = Math.min(Math.max(days, 7), 90)
    const from = new Date()
    from.setHours(0, 0, 0, 0)
    from.setDate(from.getDate() - (n - 1))

    const [userRows, orderRows] = await Promise.all([
      User.findAll({
        attributes: [[literal('DATE(createdAt)'), 'day'], [fn('COUNT', '*'), 'c']],
        where: { createdAt: { [Op.gte]: from } },
        group: ['day'],
        raw: true,
      }) as unknown as Promise<Array<{ day: string; c: string | number }>>,
      ShopOrder.findAll({
        attributes: [[literal('DATE(createdAt)'), 'day'], [fn('COUNT', '*'), 'c'], [fn('SUM', col('amountCents')), 's']],
        where: { createdAt: { [Op.gte]: from } },
        group: ['day'],
        raw: true,
      }) as unknown as Promise<Array<{ day: string; c: string | number; s: string | number | null }>>,
    ])

    const daysArr: string[] = []
    const newUsers: number[] = []
    const newOrders: number[] = []
    const revenue: number[] = []
    const userMap = new Map(userRows.map((r) => [r.day, Number(r.c)]))
    const orderMap = new Map(orderRows.map((r) => [r.day, { c: Number(r.c), s: Number(r.s ?? 0) }]))
    for (let i = 0; i < n; i++) {
      const d = new Date(from)
      d.setDate(from.getDate() + i)
      const key = d.toISOString().slice(0, 10)
      daysArr.push(key.slice(5)) // MM-DD
      newUsers.push(userMap.get(key) ?? 0)
      const o = orderMap.get(key)
      newOrders.push(o ? o.c : 0)
      revenue.push(o ? Math.round(o.s / 100) : 0)
    }
    return { days: daysArr, newUsers, newOrders, revenue }
  })
}
