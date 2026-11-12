/**
 * 审核规则化自动批处理（降本 P1）
 *
 * 背景：评价 / RMA 审核此前是纯人工逐条 CAS 按钮，低风险内容占用大量人力。
 * 本服务把「低风险自动批 + 高风险转人工」做成可灰度、可回滚的定时批处理。
 *
 * 边界（刻意保守）：
 * - 只对「商品评价」做 pending → approved，属于展示态、不涉及资金；
 * - RMA / 退款一律不改状态，只统计高风险单并提醒人工优先处理；
 * - 绝不自动驳回、自动退款、自动发信；
 * - 双开关：feature flag `moderation_auto_approve`（默认关闭，fail-closed）
 *   与 tasks.status（默认停用），任一未开启即零变更；
 * - 每次自动批准都写审计日志（actorType=system，含评分与命中原因），可追溯、可回放；
 * - CAS 更新（WHERE status='pending'）+ 单租户单轮上限，保证幂等、不覆盖人工并发操作。
 */
import { fn, col } from 'sequelize'
import { ShopReview, ShopRmaRequest } from '../models/index.js'
import { runInTenant } from '../../tenant/context.js'
import { isFeatureEnabled } from '../../featureflags/featureFlags.js'
import * as auditLogService from './auditLogService.js'
import { assessReviewRisk, assessRmaRisk, loadModerationConfig, type ModerationConfig } from './moderationRuleService.js'
import { notifyAsync } from '../../../services/notificationDispatcher.js'
import { logInfo } from '../../../utils/fileLogger.js'

export const MODERATION_FLAG_KEY = 'moderation_auto_approve'
const BATCH = 100

export interface AutoModerationResult {
  enabled: boolean
  tenants: number
  scannedReviews: number
  autoApproved: number
  manualReviews: number
  scannedRmas: number
  highRiskRmas: number
  failed: number
  threshold: number
}

interface TenantPart {
  scannedReviews: number
  autoApproved: number
  manualReviews: number
  scannedRmas: number
  highRiskRmas: number
}

function emptyResult(enabled: boolean, threshold: number): AutoModerationResult {
  return { enabled, tenants: 0, scannedReviews: 0, autoApproved: 0, manualReviews: 0, scannedRmas: 0, highRiskRmas: 0, failed: 0, threshold }
}

/** 枚举存在待审评价的租户（不依赖 tenant 表，与订单自动完结同一范式） */
async function pendingReviewTenantIds(): Promise<number[]> {
  const rows = (await ShopReview.findAll({
    attributes: [[fn('DISTINCT', col('tenantId')), 'tenantId']],
    where: { status: 'pending' },
    raw: true,
  })) as unknown as { tenantId: number | string }[]
  const ids = new Set<number>()
  for (const row of rows) {
    const n = Number(row.tenantId)
    if (Number.isInteger(n) && n > 0) ids.add(n)
  }
  return [...ids]
}

async function moderateTenant(tenantId: number, config: ModerationConfig): Promise<TenantPart> {
  const part: TenantPart = { scannedReviews: 0, autoApproved: 0, manualReviews: 0, scannedRmas: 0, highRiskRmas: 0 }

  const reviews = await ShopReview.findAll({
    where: { tenantId, status: 'pending' },
    attributes: ['id', 'rating', 'title', 'content', 'images', 'verified', 'isAnonymous'],
    order: [['id', 'ASC']],
    limit: BATCH,
  })
  part.scannedReviews = reviews.length

  for (const review of reviews) {
    if (part.autoApproved >= config.maxApprovesPerTenant) {
      part.manualReviews++
      continue
    }
    const assessment = assessReviewRisk(
      {
        rating: review.rating,
        content: review.content,
        title: review.title,
        images: review.images,
        verified: review.verified,
        isAnonymous: review.isAnonymous,
      },
      config,
    )
    if (assessment.decision === 'manual') {
      part.manualReviews++
      continue
    }
    const [affected] = await ShopReview.update({ status: 'approved' } as never, {
      where: { tenantId, id: review.id, status: 'pending' },
    })
    if (affected === 0) continue
    part.autoApproved++
    await auditLogService.record({
      tenantId,
      actorType: 'system',
      action: 'review.auto_approved',
      entityType: 'config',
      entityId: review.id,
      beforeState: { status: 'pending' },
      afterState: { status: 'approved', score: assessment.score, reasons: assessment.reasons, rule: 'low_risk_auto_approve' },
    })
    logInfo(`[moderation] tenant=${tenantId} 评价 ${review.id} 低风险自动批准（score=${assessment.score}）`)
  }

  const rmas = await ShopRmaRequest.findAll({
    where: { tenantId, status: 'pending' },
    attributes: ['id', 'orderId', 'refundAmountCents', 'reason'],
    order: [['id', 'ASC']],
    limit: BATCH,
  })
  part.scannedRmas = rmas.length
  const orderCounts = new Map<number, number>()
  for (const rma of rmas) orderCounts.set(rma.orderId, (orderCounts.get(rma.orderId) ?? 0) + 1)
  for (const rma of rmas) {
    const risk = assessRmaRisk(
      { refundAmountCents: Number(rma.refundAmountCents) || 0, reason: rma.reason, previousRmaCount: orderCounts.get(rma.orderId) ?? 1 },
      config,
    )
    if (risk.highRisk) part.highRiskRmas++
  }

  return part
}

/**
 * 执行一轮自动审核。
 * 不传 tenantIds 时枚举全部含待审评价的租户；传入时只处理指定租户（隔离验证用）。
 * flag 关闭时直接返回 enabled=false 且不产生任何写操作。
 */
export async function runAutoModeration(tenantIds?: number[]): Promise<AutoModerationResult> {
  const config = loadModerationConfig()
  if (!(await isFeatureEnabled(MODERATION_FLAG_KEY))) {
    logInfo(`[moderation] 功能开关 ${MODERATION_FLAG_KEY} 未启用，本轮零变更`)
    return emptyResult(false, config.scoreThreshold)
  }

  const tenants = tenantIds?.length ? [...new Set(tenantIds)] : await pendingReviewTenantIds()
  const totals = emptyResult(true, config.scoreThreshold)
  totals.tenants = tenants.length

  for (const tenantId of tenants) {
    await runInTenant({ tenantId }, async () => {
      try {
        const part = await moderateTenant(tenantId, config)
        totals.scannedReviews += part.scannedReviews
        totals.autoApproved += part.autoApproved
        totals.manualReviews += part.manualReviews
        totals.scannedRmas += part.scannedRmas
        totals.highRiskRmas += part.highRiskRmas
      } catch (err) {
        totals.failed++
        const message = err instanceof Error ? err.message : String(err)
        logInfo(`[moderation] tenant=${tenantId} 扫描失败: ${message}`)
        notifyAsync({
          event: 'moderation.scan_failed',
          subject: `[审核规则化] 租户 ${tenantId} 扫描失败`,
          text: `该租户本轮未执行自动审核，待审内容继续保持人工队列。\n错误: ${message}\n下一轮定时任务会自动重试。`,
        })
      }
    })
  }

  if (totals.autoApproved > 0) {
    notifyAsync({
      event: 'moderation.auto_approved',
      subject: '[审核规则化] 低风险评价自动批准汇总',
      text: [
        `风险阈值 ${config.scoreThreshold}，单租户单轮上限 ${config.maxApprovesPerTenant} 条。`,
        `扫描 ${totals.scannedReviews} 条评价 / ${totals.tenants} 个租户，自动批准 ${totals.autoApproved} 条，转人工 ${totals.manualReviews} 条。`,
        `每条自动批准均写入审计日志（action=review.auto_approved，含评分与命中原因）。`,
        'RMA / 退款未做任何状态变更，资金动作仍需人工确认。',
      ].join('\n'),
    })
  }
  if (totals.highRiskRmas > 0) {
    notifyAsync({
      event: 'moderation.high_risk_rma',
      subject: '[审核规则化] 高风险售后待人工优先处理',
      text: `扫描 ${totals.scannedRmas} 条待审售后，其中 ${totals.highRiskRmas} 条命中高风险规则（大额退款 / 同订单多次售后 / 争议词）。\n这些单据状态未变更，请在售后审核台优先人工处理。`,
      cooldownMs: 0,
    })
  }

  return totals
}
