import { Router } from 'express'
import { authMiddleware } from '../../../middleware/auth.js'
import { tenantContext } from '../../tenant/middleware/tenantContext.js'
import { checkQuota, getUsage } from '../services/usageService.js'
import Subscription from '../models/Subscription.js'
import Plan from '../models/Plan.js'

const router = Router()

router.get('/billing/subscription', authMiddleware, tenantContext, async (req, res, next) => {
  try {
    const tenantId = (req.user as any).tenantId
    const sub = await Subscription.findOne({ where: { tenantId, status: 'active' }, order: [['id', 'DESC']] })
    if (!sub) {
      res.json({ code: 0, data: null })
      return
    }
    const plan = await Plan.findByPk(sub.planId)
    res.json({ code: 0, data: { subscription: sub, plan } })
  } catch (err) {
    next(err)
  }
})

router.get('/billing/usage/:metric', authMiddleware, tenantContext, async (req, res, next) => {
  try {
    const tenantId = (req.user as any).tenantId
    const metric = String(req.params.metric)
    const { limit } = await checkQuota(tenantId, metric)
    const used = await getUsage(tenantId, metric)
    res.json({ code: 0, data: { metric, used, limit } })
  } catch (err) {
    next(err)
  }
})

router.get('/billing/plans', authMiddleware, tenantContext, async (_req, res, next) => {
  try {
    const plans = await Plan.findAll({ where: { status: 1 }, order: [['sort', 'ASC']] })
    res.json({ code: 0, data: plans })
  } catch (err) {
    next(err)
  }
})

router.post('/billing/subscribe', authMiddleware, tenantContext, async (req, res, next) => {
  try {
    const tenantId = (req.user as any).tenantId
    const { planId } = req.body
    const plan = await Plan.findByPk(planId)
    if (!plan) {
      res.status(404).json({ code: 404, message: '套餐不存在' })
      return
    }
    const existing = await Subscription.findOne({ where: { tenantId }, order: [['id', 'DESC']] })
    if (existing) {
      existing.status = 'cancelled'
      await existing.save()
    }
    await Subscription.create({
      tenantId,
      planId,
      status: 'active',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 86400000),
    })
    res.json({ code: 0, message: '订阅成功' })
  } catch (err) {
    next(err)
  }
})

export default router