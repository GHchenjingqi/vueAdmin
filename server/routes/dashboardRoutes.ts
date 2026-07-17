import { Router } from 'express'
import * as dashboardController from '../controllers/dashboardController.js'

const router = Router()

// GET /api/dashboard/stats - 获取仪表盘统计数据
router.get('/stats', dashboardController.getStats)

export default router