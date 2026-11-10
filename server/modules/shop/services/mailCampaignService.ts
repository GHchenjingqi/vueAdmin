import { Op } from 'sequelize'
import { getTenantContext } from '../../tenant/context.js'
import { ShopCustomer, ShopMailCampaign, ShopMailCampaignRecipient, ShopMembershipTier } from '../models/index.js'
import User from '../../../models/User.js'
import { getTransporter, getSenderName } from '../../../utils/mailer.js'
import { AppError } from '../../../middleware/errorHandler.js'

/**
 * 营销邮件系统（对会员/用户群发）：
 * - 受众：all_customers（全体顾客）/ tier（指定等级顾客）/ all_users（全体后台用户）/ emails（指定邮箱）
 * - outbox 模式：创建任务 → 解析受众写收件人明细（uq campaign+email 幂等）→ 逐封 SMTP 发送 → 状态回写
 * - SMTP 未配置：任务保持 pending，收件人 pending，可重试
 * - 变量替换：{{nickname}} {{points}} {{tier}}（bare 收件人用空值）
 */

export interface AudienceInput {
  audienceType: 'all_customers' | 'tier' | 'all_users' | 'emails'
  audienceParam?: string | null
}

interface ResolvedRecipient {
  recipientType: 'customer' | 'user' | 'bare'
  recipientId: number | null
  email: string
  variables: { nickname: string; points: number; tier: string }
}

/** 解析受众为收件人列表（去重） */
export async function resolveAudience(tenantId: number, input: AudienceInput): Promise<ResolvedRecipient[]> {
  const out: ResolvedRecipient[] = []
  const seen = new Set<string>()
  const push = (r: ResolvedRecipient) => {
    const key = r.email.toLowerCase()
    if (!key || seen.has(key)) return
    seen.add(key)
    out.push(r)
  }

  // tier 名映射（{{tier}} 变量）
  const tierRows = await ShopMembershipTier.findAll({ where: { tenantId }, attributes: ['id', 'name'] })
  const tierName = (id: number | null): string => tierRows.find((t) => t.id === id)?.name ?? ''

  if (input.audienceType === 'all_customers') {
    const customers = await ShopCustomer.findAll({
      where: { tenantId, status: 'active' },
      attributes: ['id', 'email', 'nickname', 'points', 'membershipTierId'],
    })
    for (const c of customers) {
      push({ recipientType: 'customer', recipientId: c.id, email: c.email, variables: { nickname: c.nickname ?? '', points: c.points ?? 0, tier: tierName(c.membershipTierId) } })
    }
  } else if (input.audienceType === 'tier') {
    const tierId = Number(input.audienceParam)
    if (!Number.isInteger(tierId) || tierId <= 0) throw new AppError(400, 'tier 受众需要有效的等级 ID')
    const customers = await ShopCustomer.findAll({
      where: { tenantId, status: 'active', membershipTierId: tierId },
      attributes: ['id', 'email', 'nickname', 'points', 'membershipTierId'],
    })
    for (const c of customers) {
      push({ recipientType: 'customer', recipientId: c.id, email: c.email, variables: { nickname: c.nickname ?? '', points: c.points ?? 0, tier: tierName(c.membershipTierId) } })
    }
  } else if (input.audienceType === 'all_users') {
    const users = await User.findAll({ where: { tenantId, status: 1 }, attributes: ['id', 'email', 'nickname'] })
    for (const u of users) {
      if (!u.email) continue
      push({ recipientType: 'user', recipientId: u.id, email: u.email, variables: { nickname: u.nickname ?? '', points: 0, tier: '' } })
    }
  } else if (input.audienceType === 'emails') {
    const emails = (input.audienceParam ?? '')
      .split(/[,;\s]+/)
      .map((e) => e.trim())
      .filter(Boolean)
    if (emails.length === 0) throw new AppError(400, 'emails 受众需要至少一个邮箱')
    for (const email of emails) {
      push({ recipientType: 'bare', recipientId: null, email, variables: { nickname: '', points: 0, tier: '' } })
    }
  } else {
    throw new AppError(400, '未知受众类型')
  }
  return out
}

/** 正文变量替换 */
export function renderBody(body: string, vars: { nickname: string; points: number; tier: string }): string {
  return body
    .replace(/\{\{nickname\}\}/g, vars.nickname)
    .replace(/\{\{points\}\}/g, String(vars.points))
    .replace(/\{\{tier\}\}/g, vars.tier)
}

/** 创建邮件任务：解析受众 → 写任务 + 收件人明细（幂等：uq campaign+email） */
export async function createCampaign(
  tenantId: number,
  input: { subject: string; body: string; audienceType: AudienceInput['audienceType']; audienceParam?: string | null },
  operatorId: number | null,
): Promise<{ campaign: ShopMailCampaign; recipientCount: number }> {
  if (!input.subject?.trim()) throw new AppError(400, '邮件主题不能为空')
  if (!input.body?.trim()) throw new AppError(400, '邮件正文不能为空')
  const recipients = await resolveAudience(tenantId, { audienceType: input.audienceType, audienceParam: input.audienceParam })
  const campaign = await ShopMailCampaign.create({
    tenantId,
    subject: input.subject.trim().slice(0, 200),
    body: input.body,
    audienceType: input.audienceType,
    audienceParam: input.audienceParam ?? null,
    status: 'pending',
    totalCount: recipients.length,
    sentCount: 0,
    failedCount: 0,
    operatorId,
  } as never)
  for (const r of recipients) {
    await ShopMailCampaignRecipient.findOrCreate({
      where: { tenantId, campaignId: campaign.id, email: r.email.toLowerCase() },
      defaults: {
        tenantId,
        campaignId: campaign.id,
        recipientType: r.recipientType,
        recipientId: r.recipientId,
        email: r.email.toLowerCase(),
        status: 'pending',
      } as never,
    })
  }
  return { campaign, recipientCount: recipients.length }
}

/** 投递一封 */
async function deliverOne(
  transporter: { sendMail: (opts: Record<string, unknown>) => Promise<unknown> },
  from: string,
  subject: string,
  to: string,
  html: string,
): Promise<void> {
  await transporter.sendMail({ from, to, subject, html: `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6">${html.replace(/\n/g, '<br/>')}</div>` })
}

/** 发送任务：逐封投递 pending 收件人（幂等：只处理 pending）；返回统计 */
export async function sendCampaign(tenantId: number, campaignId: number): Promise<{ sent: number; failed: number; total: number }> {
  const campaign = await ShopMailCampaign.findOne({ where: { tenantId, id: campaignId } })
  if (!campaign) throw new AppError(404, '邮件任务不存在')
  if (campaign.status === 'sent') return { sent: campaign.sentCount, failed: campaign.failedCount, total: campaign.totalCount }

  const transporter = await getTransporter()
  if (!transporter) {
    // SMTP 未配置：保持 pending，可后续重试
    return { sent: 0, failed: 0, total: campaign.totalCount }
  }
  const sender = await getSenderName()
  const from = `"${sender}" <${process.env.SMTP_USER || 'no-reply@localhost'}>`

  await campaign.update({ status: 'sending' })
  const pending = await ShopMailCampaignRecipient.findAll({ where: { tenantId, campaignId, status: 'pending' } })
  let sent = 0
  let failed = 0
  for (const r of pending) {
    let vars = { nickname: '', points: 0, tier: '' }
    if (r.recipientType === 'customer' && r.recipientId) {
      const c = await ShopCustomer.findOne({ where: { tenantId, id: r.recipientId }, attributes: ['nickname', 'points', 'membershipTierId'] })
      if (c) {
        const tierRow = c.membershipTierId ? await ShopMembershipTier.findOne({ where: { id: c.membershipTierId }, attributes: ['name'] }) : null
        vars = { nickname: c.nickname ?? '', points: c.points ?? 0, tier: tierRow?.name ?? '' }
      }
    } else if (r.recipientType === 'user' && r.recipientId) {
      const u = await User.findOne({ where: { id: r.recipientId }, attributes: ['nickname'] })
      if (u) vars = { nickname: u.nickname ?? '', points: 0, tier: '' }
    }
    try {
      await deliverOne(transporter, from, campaign.subject, r.email, renderBody(campaign.body, vars))
      await r.update({ status: 'sent', sentAt: new Date(), error: null })
      sent += 1
    } catch (err) {
      await r.update({ status: 'failed', error: String(err instanceof Error ? err.message : err).slice(0, 500) })
      failed += 1
    }
  }

  const total = campaign.totalCount
  const status = sent + failed >= total && total > 0 ? (failed === 0 ? 'sent' : 'partial') : failed > 0 || sent > 0 ? 'partial' : 'pending'
  await campaign.update({ status, sentCount: (campaign.sentCount ?? 0) + sent, failedCount: (campaign.failedCount ?? 0) + failed })
  return { sent, failed, total }
}

/** 任务列表（分页） */
export async function listCampaigns(tenantId: number, page = 1, pageSize = 20) {
  const { rows, count } = await ShopMailCampaign.findAndCountAll({
    where: { tenantId },
    order: [['createdAt', 'DESC']],
    offset: (page - 1) * pageSize,
    limit: pageSize,
  })
  return { list: rows, total: count, page, pageSize }
}

/** 任务收件人明细（分页） */
export async function listRecipients(tenantId: number, campaignId: number, page = 1, pageSize = 50) {
  const { rows, count } = await ShopMailCampaignRecipient.findAndCountAll({
    where: { tenantId, campaignId },
    order: [['id', 'ASC']],
    offset: (page - 1) * pageSize,
    limit: pageSize,
  })
  return { list: rows, total: count, page, pageSize }
}

/** 收件人统计（后台概览用） */
export async function audienceStats(tenantId: number): Promise<{ customers: number; users: number }> {
  const [customers, users] = await Promise.all([
    ShopCustomer.count({ where: { tenantId, status: 'active' } }),
    User.count({ where: { tenantId, status: 1 } }),
  ])
  return { customers, users }
}

/** 未使用导入（防 lint）：保留 Op 供后续查询扩展 */
void Op
void getTenantContext
