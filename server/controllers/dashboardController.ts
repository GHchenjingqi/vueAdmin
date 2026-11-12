/**
 * 仪表盘控制器
 * @module dashboardController
 */

import { getDashboardStats, getDashboardTrends } from '../services/dashboardService.js'

/**
 * 获取仪表盘统计数据
 */
export const getStats = async (req, res, next) => {
  try {
    const data = await getDashboardStats()
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}

/**
 * 获取仪表盘时间序列（P2-12 ECharts 增强）
 * query.days: 7~90，默认 30
 */
export const getTrends = async (req, res, next) => {
  try {
    const raw = Number(req.query.days)
    const days = Number.isFinite(raw) && raw > 0 ? raw : 30
    const data = await getDashboardTrends(days)
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}
