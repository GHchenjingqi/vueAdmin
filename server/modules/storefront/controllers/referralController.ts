import type { NextFunction, Request, Response } from 'express'
import { AppError } from '../../../middleware/errorHandler.js'
import * as referralService from '../services/referralService.js'
import { queryInt } from '../../shop/utils/query.js'

/**
 * P5-T07：Referral / Affiliate。
 *
 * - GET /referrals/me（顾客 JWT）：我的推荐码 + 佣金汇总 + 明细（分页）。
 * - GET /referrals/validate/:code（公开）：校验推荐码是否有效（不泄露推荐人身份细节）。
 */
export const me = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const customerId = req.customer!.customerId
    const page = req.query.page ? queryInt(req.query.page) : undefined
    const pageSize = req.query.pageSize ? queryInt(req.query.pageSize) : undefined
    const code = await referralService.ensureReferralCode(customerId)
    const [summary, commissions] = await Promise.all([
      referralService.commissionSummary(customerId),
      referralService.listCommissions(customerId, { page, pageSize }),
    ])
    res.json({ code: 0, data: { code, ratePercent: referralService.REFERRAL_RATE_PERCENT, windowDays: referralService.REFERRAL_WINDOW_DAYS, summary, commissions } })
  } catch (err) {
    next(err)
  }
}

export const validate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const code = (req.params as Record<string, unknown>).code as string
    if (!code || code.length > 64) throw new AppError(400, '推荐码格式不合法')
    const referrer = await referralService.resolveReferrer(code)
    res.json({ code: 0, data: { valid: referrer !== null, code } })
  } catch (err) {
    next(err)
  }
}
