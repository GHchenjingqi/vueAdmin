/**
 * 仪表盘控制器
 * @module dashboardController
 */

import { getDashboardStats } from '../services/dashboardService.js'

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