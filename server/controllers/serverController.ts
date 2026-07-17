/**
 * 服务器监控控制器
 * @module serverController
 */

import { getServerStats } from '../services/serverService.js'

/**
 * @openapi
 * /server/stats:
 *   get:
 *     tags: [服务监控]
 *     summary: 获取服务器实时状态（CPU、内存、磁盘等）
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: 服务器状态信息
 */
export const getStats = async (req, res, next) => {
  try {
    const data = getServerStats()
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}