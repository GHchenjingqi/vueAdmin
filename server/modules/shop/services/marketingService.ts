import { AppError } from '../../../middleware/errorHandler.js'
import { Op } from 'sequelize'
import { ShopPromotion, ShopCoupon } from '../models/index.js'
import type { CreatePromotionInput, UpdatePromotionInput, CreateCouponInput, UpdateCouponInput } from '../../../shared/schemas/shop.js'
import { getTenantContext } from '../../../modules/tenant/context.js'

/** 当前租户 ID（读取全局租户上下文，平台超管兜底为 1） */
const tid = (): number => getTenantContext()?.tenantId ?? 1

function tenantId(): number {
  return getTenantContext()?.tenantId ?? 1
}

// ==================== 营销活动 ====================

export async function listPromotions(params: { page?: number; pageSize?: number; type?: string } = {}) {
  const page = params.page ?? 1
  const pageSize = params.pageSize ?? 20
  const where: Record<string, unknown> = { tenantId: tid() }
  if (params.type && ['discount', 'full_reduce'].includes(params.type)) where.type = params.type
  const { rows, count } = await ShopPromotion.findAndCountAll({
    where,
    order: [['id', 'DESC']],
    offset: (page - 1) * pageSize,
    limit: pageSize,
  })
  return { list: rows, total: count, page, pageSize }
}

export async function getPromotionById(id: number): Promise<ShopPromotion> {
  const row = await ShopPromotion.findOne({ where: { id, tenantId: tid() } })
  if (!row) throw new AppError(404, '活动不存在')
  return row
}

export async function createPromotion(input: CreatePromotionInput): Promise<ShopPromotion> {
  return ShopPromotion.create({ ...input, tenantId: tenantId() } as never)
}

export async function updatePromotion(id: number, input: UpdatePromotionInput): Promise<ShopPromotion> {
  const row = await getPromotionById(id)
  await row.update(input as never)
  return row
}

export async function deletePromotion(id: number): Promise<void> {
  const row = await getPromotionById(id)
  await row.destroy()
}

/** 当前有效活动（生效期内） */
export async function activePromotions(): Promise<ShopPromotion[]> {
  const today = new Date().toISOString().slice(0, 10)
  return ShopPromotion.findAll({
    where: { tenantId: tid(), startAt: { [Op.lte]: today }, endAt: { [Op.gte]: today } },
    order: [['id', 'DESC']],
  })
}

// ==================== 优惠券 ====================

export async function listCoupons(params: { page?: number; pageSize?: number } = {}) {
  const page = params.page ?? 1
  const pageSize = params.pageSize ?? 20
  const { rows, count } = await ShopCoupon.findAndCountAll({
    where: { tenantId: tid() },
    order: [['id', 'DESC']],
    offset: (page - 1) * pageSize,
    limit: pageSize,
  })
  return { list: rows, total: count, page, pageSize }
}

export async function getCouponById(id: number): Promise<ShopCoupon> {
  const row = await ShopCoupon.findOne({ where: { id, tenantId: tid() } })
  if (!row) throw new AppError(404, '优惠券不存在')
  return row
}

export async function createCoupon(input: CreateCouponInput): Promise<ShopCoupon> {
  const exists = await ShopCoupon.count({ where: { code: input.code, tenantId: tid() } })
  if (exists > 0) throw new AppError(400, `券码 ${input.code} 已存在`)
  return ShopCoupon.create({ ...input, tenantId: tenantId() } as never)
}

export async function updateCoupon(id: number, input: UpdateCouponInput): Promise<ShopCoupon> {
  const row = await getCouponById(id)
  if (input.code && input.code !== row.code) {
    const exists = await ShopCoupon.count({ where: { code: input.code, tenantId: tid() } })
    if (exists > 0) throw new AppError(400, `券码 ${input.code} 已存在`)
  }
  await row.update(input as never)
  return row
}

export async function deleteCoupon(id: number): Promise<void> {
  const row = await getCouponById(id)
  await row.destroy()
}
