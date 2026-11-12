import { Router } from 'express'
import * as dashboardController from '../controllers/dashboardController.js'

const router = Router()

// GET /api/dashboard/stats - 获取仪表盘统计数据
router.get('/stats', dashboardController.getStats)
// GET /api/dashboard/trends - 时间序列（P2-12 ECharts 增强）
router.get('/trends', dashboardController.getTrends)

export default router
