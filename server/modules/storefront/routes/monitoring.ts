import { Router } from 'express'
import * as monitoringController from '../controllers/monitoringController.js'

/**
 * P4-T13 监控与告警路由（只读 + 显式评估，挂载于 /api/storefront/v1/monitoring）
 */
const router = Router()

router.get('/metrics', monitoringController.metrics)
router.get('/alerts', monitoringController.alerts)
router.get('/rules', monitoringController.rules)
router.post('/evaluate', monitoringController.evaluateNow)
router.get('/dashboard', monitoringController.dashboard)

export default router
