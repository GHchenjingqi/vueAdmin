import { Op } from 'sequelize'
import { AppError } from '../../../middleware/errorHandler.js'
import { getTenantContext } from '../../tenant/context.js'
import {
  ShopReview,
  ShopProductQA,
  ShopSpu,
  ShopSku,
  ShopCustomer,
  ShopOrder,
  ShopOrderItem,
} from '../../shop/models/index.js'
import type { StorefrontSite } from '../middleware/siteContext.js'

/**
 * 商品评价与问答服务（阶段 5 步骤 5 / 第二切片）
 *
 * 复用 shop 模型层（shop_reviews / shop_product_qa），不复制数据、不建第二套后端。
 * 公开接口免 admin 鉴权，租户由 siteContext 注入（service 层显式 tenantId 兜底为 1）。
 * 评价提交后进入 pending 审核态，仅 approved 对外可见；问答仅 answered 对外可见。
 * 已购验证：以登录顾客 email 匹配订单（ShopOrder 以 email 标识买家，无 customerId 列）。
 */

const tid = (): number => getTenantContext()?.tenantId ?? 1

/** 调用方身份（来自 customerAuth 中间件，游客为空） */
export interface ReviewAuth {
  customerId: number
  email: string
}

async function assertSpu(spuId: number, tenantId: number): Promise<void> {
  const spu = await ShopSpu.findOne({ where: { id: spuId, tenantId } })
  if (!spu) throw new AppError(404, `商品 ${spuId} 不存在`)
}

async function resolveSku(spuId: number, skuId: number | undefined, tenantId: number): Promise<number | null> {
  if (skuId == null) return null
  const sku = await ShopSku.findOne({ where: { id: skuId, spuId, tenantId } })
  if (!sku) throw new AppError(404, `SKU ${skuId} 不属于该商品`)
  return skuId
}

// ————————————————————————————————————————————————
// 评价
// ————————————————————————————————————————————————

export interface ReviewSubmitInput {
  spuId: number
  skuId?: number
  rating: number
  title?: string
  content: string
  images?: string[]
  isAnonymous?: boolean
  orderId?: number
  locale?: string
}

/** 提交评价：校验商品/SKU 存在、评分范围，可选 orderId 触发已购验证 */
export async function submitReview(
  _site: StorefrontSite,
  input: ReviewSubmitInput,
  auth?: ReviewAuth,
): Promise<{ id: number; status: string }> {
  const tId = tid()
  await assertSpu(input.spuId, tId)
  const skuId = await resolveSku(input.spuId, input.skuId, tId)
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
    throw new AppError(400, '评分必须为 1-5 的整数')
  }
  const verified =
    auth && input.orderId != null
      ? await verifyPurchase(tId, auth.email, input.orderId, input.spuId, skuId)
      : false
  const row = await ShopReview.create({
    tenantId: tId,
    spuId: input.spuId,
    skuId,
    customerId: auth?.customerId ?? null,
    orderId: input.orderId ?? null,
    rating: input.rating,
    title: input.title ?? null,
    content: input.content,
    images: input.images?.length ? input.images : null,
    status: 'pending',
    verified,
    isAnonymous: input.isAnonymous ?? false,
    helpfulCount: 0,
    locale: input.locale ?? null,
  })
  return { id: row.id, status: row.status }
}

/**
 * 已购验证：登录顾客 email 匹配订单，且订单含被评价商品的 SKU、状态为已支付及以上。
 * skuId 省略时评价针对 SPU 整体，须按该 SPU 下全部 SKU 匹配，
 * 否则「买过任意商品」即可给任何商品刷出已购标记。
 */
async function verifyPurchase(
  tenantId: number,
  email: string,
  orderId: number,
  spuId: number,
  skuId: number | null,
): Promise<boolean> {
  const order = await ShopOrder.findOne({
    where: {
      id: orderId,
      tenantId,
      email,
      status: { [Op.in]: ['paid', 'fulfilled', 'shipped', 'done'] },
    } as never,
  })
  if (!order) return false
  const whereItem: Record<string, unknown> = { orderId, tenantId }
  if (skuId != null) {
    whereItem.skuId = skuId
  } else {
    const skus = await ShopSku.findAll({ where: { spuId, tenantId }, attributes: ['id'] })
    if (skus.length === 0) return false
    whereItem.skuId = { [Op.in]: skus.map((s) => s.id) }
  }
  const item = await ShopOrderItem.findOne({ where: whereItem as never })
  return !!item
}

export interface ReviewListQuery {
  spuId: number
  page?: number
  pageSize?: number
}

export interface ReviewListItem {
  id: number
  rating: number
  title: string | null
  content: string
  images: string[] | null
  reviewerName: string
  isAnonymous: boolean
  verified: boolean
  helpfulCount: number
  createdAt: Date
}

export interface ReviewListView {
  items: ReviewListItem[]
  summary: { total: number; average: number; distribution: Record<number, number> }
}

/** 公开评价列表：仅 approved，附评分汇总；批量取昵称供展示 */
export async function listReviews(_site: StorefrontSite, q: ReviewListQuery): Promise<ReviewListView> {
  const tId = tid()
  await assertSpu(q.spuId, tId)
  const where = { tenantId: tId, spuId: q.spuId, status: 'approved' as const }

  const all = await ShopReview.findAll({ where, attributes: ['rating'] })
  const total = all.length
  const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  let sum = 0
  for (const r of all) {
    sum += r.rating
    distribution[r.rating] = (distribution[r.rating] ?? 0) + 1
  }
  const average = total ? Math.round((sum / total) * 100) / 100 : 0

  const page = q.page && q.page > 0 ? q.page : 1
  const pageSize = Math.min(q.pageSize && q.pageSize > 0 ? q.pageSize : 10, 60)
  const rows = await ShopReview.findAll({
    where,
    order: [['createdAt', 'DESC']],
    limit: pageSize,
    offset: (page - 1) * pageSize,
  })

  const custIds = rows.filter((r) => !r.isAnonymous && r.customerId).map((r) => r.customerId as number)
  let names: Record<number, string> = {}
  if (custIds.length) {
    const custs = await ShopCustomer.findAll({ where: { id: { [Op.in]: custIds }, tenantId: tId } })
    names = Object.fromEntries(custs.map((c) => [c.id, c.nickname || '顾客']))
  }

  const items: ReviewListItem[] = rows.map((r) => ({
    id: r.id,
    rating: r.rating,
    title: r.title,
    content: r.content,
    images: r.images,
    reviewerName: r.isAnonymous ? '匿名用户' : r.customerId ? names[r.customerId] ?? '顾客' : '顾客',
    isAnonymous: r.isAnonymous,
    verified: r.verified,
    helpfulCount: r.helpfulCount,
    createdAt: r.createdAt,
  }))
  return { items, summary: { total, average, distribution } }
}

/** 「有用」投票：仅对公开评价计数，防越权（不公开的评价不可投票） */
export async function markHelpful(_site: StorefrontSite, reviewId: number): Promise<{ helpfulCount: number }> {
  const tId = tid()
  const row = await ShopReview.findOne({ where: { id: reviewId, tenantId: tId, status: 'approved' } })
  if (!row) throw new AppError(404, '评价不存在或未公开')
  await row.increment('helpfulCount')
  await row.reload()
  return { helpfulCount: row.helpfulCount }
}

// ————————————————————————————————————————————————
// 问答
// ————————————————————————————————————————————————

export interface QuestionSubmitInput {
  spuId: number
  skuId?: number
  question: string
  locale?: string
}

/** 提交问题：校验商品/SKU 存在，进入 pending 待回答 */
export async function submitQuestion(
  _site: StorefrontSite,
  input: QuestionSubmitInput,
  auth?: ReviewAuth,
): Promise<{ id: number; status: string }> {
  const tId = tid()
  await assertSpu(input.spuId, tId)
  const skuId = await resolveSku(input.spuId, input.skuId, tId)
  const row = await ShopProductQA.create({
    tenantId: tId,
    spuId: input.spuId,
    skuId,
    customerId: auth?.customerId ?? null,
    question: input.question,
    answer: null,
    answeredBy: null,
    answeredAt: null,
    status: 'pending',
    locale: input.locale ?? null,
  })
  return { id: row.id, status: row.status }
}

export interface QuestionListItem {
  id: number
  question: string
  answer: string
  answeredAt: Date | null
}

/** 公开问答列表：仅 answered */
export async function listQuestions(_site: StorefrontSite, q: { spuId: number }): Promise<QuestionListItem[]> {
  const tId = tid()
  await assertSpu(q.spuId, tId)
  const rows = await ShopProductQA.findAll({
    where: { tenantId: tId, spuId: q.spuId, status: 'answered' },
    order: [['answeredAt', 'DESC']],
  })
  return rows.map((r) => ({ id: r.id, question: r.question, answer: r.answer || '', answeredAt: r.answeredAt }))
}
