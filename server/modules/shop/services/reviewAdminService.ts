/**
 * 商品评价 / 问答后台审核服务
 *
 * 背景：公开侧 reviewService 只暴露 approved 评价与 answered 问答，而提交端
 * 一律落 pending；修复前仓库内无任何后台状态迁移实现，导致 C 端提交的内容
 * 永久不可见（功能断点）。本服务复用 shop 模型层，不建第二套数据。
 *
 * 约定：
 * - 所有迁移均为 CAS 条件更新（期望旧状态入 WHERE），并发审核恰好一方胜出；
 *   0 行受影响时回读区分 404（不存在/跨租户）与 400（状态不允许）。
 * - 全部按 tenantId 隔离（含列表、迁移、回读）。
 * - 审核动作只改状态，不代决「是否默认放行」「已通过内容可否下架」等业务口径。
 */
import { Op } from 'sequelize'
import { AppError } from '../../../middleware/errorHandler.js'
import { getTenantContext } from '../../../modules/tenant/context.js'
import { ShopReview, ShopProductQA } from '../models/index.js'

const tid = (): number => getTenantContext()?.tenantId ?? 1

const REVIEW_STATUSES = ['pending', 'approved', 'rejected'] as const
const QA_STATUSES = ['pending', 'answered', 'hidden'] as const

export interface ModerationListQuery {
  status?: string
  spuId?: number
  limit?: number
  offset?: number
}

function pageOf(q: ModerationListQuery): { limit: number; offset: number } {
  return {
    limit: Math.min(Math.max(q.limit ?? 20, 1), 100),
    offset: Math.max(q.offset ?? 0, 0),
  }
}

/** 后台评价列表：status / spuId 过滤，id 倒序分页（默认 20，上限 100） */
export async function listReviews(q: ModerationListQuery = {}) {
  const where: Record<string, unknown> = { tenantId: tid() }
  if (q.status) {
    if (!(REVIEW_STATUSES as readonly string[]).includes(q.status)) {
      throw new AppError(400, '评价状态过滤值无效')
    }
    where.status = q.status
  }
  if (q.spuId) where.spuId = q.spuId
  const { limit, offset } = pageOf(q)
  const { rows, count } = await ShopReview.findAndCountAll({ where, order: [['id', 'DESC']], limit, offset })
  return { rows, total: count, limit, offset }
}

/** 后台问答列表：status / spuId 过滤，id 倒序分页 */
export async function listQuestions(q: ModerationListQuery = {}) {
  const where: Record<string, unknown> = { tenantId: tid() }
  if (q.status) {
    if (!(QA_STATUSES as readonly string[]).includes(q.status)) {
      throw new AppError(400, '问答状态过滤值无效')
    }
    where.status = q.status
  }
  if (q.spuId) where.spuId = q.spuId
  const { limit, offset } = pageOf(q)
  const { rows, count } = await ShopProductQA.findAndCountAll({ where, order: [['id', 'DESC']], limit, offset })
  return { rows, total: count, limit, offset }
}

/** CAS 迁移通用收口：0 行时回读区分 404 / 400 */
async function casReview(id: number, from: readonly string[], values: Record<string, unknown>, conflictMessage: string) {
  const tId = tid()
  const [affected] = await ShopReview.update(values, {
    where: { tenantId: tId, id, status: { [Op.in]: [...from] } },
  } as never)
  if (affected === 0) {
    const row = await ShopReview.findOne({ where: { tenantId: tId, id } })
    if (!row) throw new AppError(404, '评价不存在')
    throw new AppError(400, conflictMessage)
  }
  return ShopReview.findOne({ where: { tenantId: tId, id } })
}

/** 后台问答 CAS 迁移通用收口 */
async function casQuestion(id: number, from: readonly string[], values: Record<string, unknown>, conflictMessage: string) {
  const tId = tid()
  const [affected] = await ShopProductQA.update(values, {
    where: { tenantId: tId, id, status: { [Op.in]: [...from] } },
  } as never)
  if (affected === 0) {
    const row = await ShopProductQA.findOne({ where: { tenantId: tId, id } })
    if (!row) throw new AppError(404, '问题不存在')
    throw new AppError(400, conflictMessage)
  }
  return ShopProductQA.findOne({ where: { tenantId: tId, id } })
}

/** 评价审核通过：pending → approved（公开列表随即可见、可被投票） */
export function approveReview(id: number) {
  return casReview(id, ['pending'], { status: 'approved' }, '仅 pending 状态的评价可审核通过')
}

/** 评价驳回：pending → rejected（公开列表不可见） */
export function rejectReview(id: number) {
  return casReview(id, ['pending'], { status: 'rejected' }, '仅 pending 状态的评价可驳回')
}

/** 回答提问：pending → answered，同时固化答案 / 时间 / 回答者 */
export function answerQuestion(id: number, answer: string, answeredBy: string) {
  return casQuestion(id, ['pending'], { status: 'answered', answer, answeredBy, answeredAt: new Date() }, '仅 pending 状态的问题可回答')
}

/** 隐藏问答：pending / answered → hidden（公开列表随即不可见） */
export function hideQuestion(id: number) {
  return casQuestion(id, ['pending', 'answered'], { status: 'hidden' }, '仅 pending / answered 状态的问题可隐藏')
}
