import { Router } from 'express'
import { authMiddleware } from '../../../middleware/auth.js'
import { tenantContext } from '../../tenant/middleware/tenantContext.js'
import sequelize from '../../../config/database.js'
import { Op } from 'sequelize'
import { checkQuota, getUsage } from '../services/usageService.js'
import Subscription from '../models/Subscription.js'
import Plan from '../models/Plan.js'

const router = Router()

router.get('/billing/subscription', authMiddleware, tenantContext, async (req, res, next) => {
  try {
    const tenantId = (req.user as any).tenantId
    // 与配额闸门(getLimit)口径一致：仅返回账期内 active 订阅
    const sub = await Subscription.findOne({
      where: { tenantId, status: 'active', currentPeriodEnd: { [Op.gte]: new Date() } },
      order: [['id', 'DESC']],
    })
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
  // 原子化：在事务内对旧订阅加行锁(SELECT ... FOR UPDATE)后取消并创建新订阅，
  // 杜绝并发「先查后改」竞态导致的同一租户并存多个 active 订阅。
  const t = await sequelize.transaction()
  try {
    const tenantId = (req.user as any).tenantId
    const { planId } = req.body
    const plan = await Plan.findByPk(planId, { transaction: t })
    if (!plan) {
      await t.rollback()
      res.status(404).json({ code: 404, message: '套餐不存在' })
      return
    }
    const existing = await Subscription.findOne({
      where: { tenantId },
      order: [['id', 'DESC']],
      lock: t.LOCK.UPDATE,
      transaction: t,
    })
    if (existing && existing.status !== 'cancelled') {
      existing.status = 'cancelled'
      await existing.save({ transaction: t })
    }
    await Subscription.create(
      {
        tenantId,
        planId,
        status: 'active',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 86400000),
      },
      { transaction: t },
    )
    await t.commit()
    res.json({ code: 0, message: '订阅成功' })
  } catch (err) {
    await t.rollback().catch(() => {})
    next(err)
  }
})

export default router