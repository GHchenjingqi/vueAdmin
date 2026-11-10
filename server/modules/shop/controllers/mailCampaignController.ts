import type { NextFunction, Request, Response } from 'express'
import { getTenantContext } from '../../tenant/context.js'
import { AppError } from '../../../middleware/errorHandler.js'
import * as mailCampaignService from '../services/mailCampaignService.js'
import { queryInt } from '../utils/query.js'

/** admin JWT 上下文 */
function adminOf(req: Request): { tenantId: number; userId: number } {
  const user = (req as unknown as { user?: { id?: number } }).user
  return { tenantId: getTenantContext()?.tenantId ?? 1, userId: user?.id ?? 0 }
}

const AUDIENCES = new Set(['all_customers', 'tier', 'all_users', 'emails'])

/**
 * 营销邮件接口（admin JWT）——对会员（customers）与用户（users）发送：
 * - GET /mail-campaigns：任务列表
 * - POST /mail-campaigns：创建任务（解析受众，pending）
 * - POST /mail-campaigns/:id/send：发送（SMTP 未配置保持 pending 可重试）
 * - GET /mail-campaigns/:id/recipients：收件人明细
 * - GET /mail-campaigns/audience-stats：受众统计
 */
export const list = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tenantId } = adminOf(req)
    const page = req.query.page ? queryInt(req.query.page) ?? 1 : 1
    const pageSize = req.query.pageSize ? queryInt(req.query.pageSize) ?? 20 : 20
    res.json({ code: 0, data: await mailCampaignService.listCampaigns(tenantId, page, pageSize) })
  } catch (err) {
    next(err)
  }
}

export const create = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tenantId, userId } = adminOf(req)
    const { subject, body, audienceType, audienceParam } = req.body ?? {}
    if (!AUDIENCES.has(audienceType)) throw new AppError(400, 'audienceType 必须为 all_customers/tier/all_users/emails')
    const result = await mailCampaignService.createCampaign(
      tenantId,
      { subject: String(subject ?? ''), body: String(body ?? ''), audienceType, audienceParam: audienceParam ?? null },
      userId,
    )
    res.status(201).json({ code: 0, data: { campaign: result.campaign, recipientCount: result.recipientCount } })
  } catch (err) {
    next(err)
  }
}

export const send = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tenantId } = adminOf(req)
    const id = Number(req.params.id)
    res.json({ code: 0, data: await mailCampaignService.sendCampaign(tenantId, id) })
  } catch (err) {
    next(err)
  }
}

export const recipients = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tenantId } = adminOf(req)
    const id = Number(req.params.id)
    const page = req.query.page ? queryInt(req.query.page) ?? 1 : 1
    const pageSize = req.query.pageSize ? queryInt(req.query.pageSize) ?? 50 : 50
    res.json({ code: 0, data: await mailCampaignService.listRecipients(tenantId, id, page, pageSize) })
  } catch (err) {
    next(err)
  }
}

export const audienceStats = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const { tenantId } = adminOf(_req)
    res.json({ code: 0, data: await mailCampaignService.audienceStats(tenantId) })
  } catch (err) {
    next(err)
  }
}
