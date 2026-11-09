import { Router } from 'express'
import { authMiddleware } from '../../../middleware/auth.js'
import { getQuotaSnapshot, checkQuota, getUsage } from '../services/usageService.js'
import { issueInvoice } from '../services/invoiceService.js'
import Subscription from '../models/Subscription.js'
import Plan from '../models/Plan.js'
import Invoice from '../models/Invoice.js'

const router = Router()

router.get('/billing/subscription', authMiddleware, async (req, res, next) => {
  try {
    const tenantId = req.user!.tenantId!
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

/** 全部指标的「已用/上限」，租户首页配额卡用这一次请求拿全 */
router.get('/billing/usage', authMiddleware, async (req, res, next) => {
  try {
    res.json({ code: 0, data: await getQuotaSnapshot(req.user!.tenantId!) })
  } catch (err) {
    next(err)
  }
})

router.get('/billing/usage/:metric', authMiddleware, async (req, res, next) => {
  try {
    const tenantId = req.user!.tenantId!
    const metric = String(req.params.metric)
    const { limit } = await checkQuota(tenantId, metric)
    const used = await getUsage(tenantId, metric)
    res.json({ code: 0, data: { metric, used, limit } })
  } catch (err) {
    next(err)
  }
})

router.get('/billing/plans', authMiddleware, async (_req, res, next) => {
  try {
    const plans = await Plan.findAll({ where: { status: 1 }, order: [['sort', 'ASC']] })
    res.json({ code: 0, data: plans })
  } catch (err) {
    next(err)
  }
})

/** 本租户账单（变更套餐时出账，见 invoiceService） */
router.get('/billing/invoices', authMiddleware, async (req, res, next) => {
  try {
    const tenantId = req.user!.tenantId!
    const invoices = await Invoice.findAll({ where: { tenantId }, order: [['id', 'DESC']], limit: 50 })
    res.json({ code: 0, data: invoices })
  } catch (err) {
    next(err)
  }
})

router.post('/billing/subscribe', authMiddleware, async (req, res, next) => {
  try {
    const tenantId = req.user!.tenantId!
    const planId = Number(req.body?.planId)
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
    const now = new Date()
    const periodEnd = new Date(now.getTime() + 30 * 86400000)
    await Subscription.create({
      tenantId,
      planId,
      status: 'active',
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
    })
    // 出账：一次套餐变更对应一张待支付账单，订阅记录不再是孤档案
    const invoice = await issueInvoice({ tenantId, plan, periodStart: now, periodEnd })
    res.json({ code: 0, data: { invoiceId: invoice.id, amount: invoice.amount }, message: '订阅成功' })
  } catch (err) {
    next(err)
  }
})

export default router
