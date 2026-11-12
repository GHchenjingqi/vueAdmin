import { Op } from 'sequelize'
import ShopReferralCommission, {
  type ReferralCommissionStatus,
} from '../models/ShopReferralCommission.js'
import { getTenantContext } from '../../../modules/tenant/context.js'
import { AppError } from '../../../middleware/errorHandler.js'

const tid = (): number => getTenantContext()?.tenantId ?? 1

export interface ListCommissionsQuery {
  page?: number
  pageSize?: number
  status?: ReferralCommissionStatus
}

export interface ListCommissionsResult {
  list: ShopReferralCommission[]
  total: number
  page: number
  pageSize: number
}

export async function listCommissions(q: ListCommissionsQuery): Promise<ListCommissionsResult> {
  const page = q.page && q.page > 0 ? q.page : 1
  const pageSize = q.pageSize && q.pageSize > 0 ? Math.min(q.pageSize, 100) : 10
  const where: Record<string, unknown> = { tenantId: tid() }
  if (q.status) where.status = q.status
  const { rows, count } = await ShopReferralCommission.findAndCountAll({
    where,
    order: [['createdAt', 'DESC']],
    limit: pageSize,
    offset: (page - 1) * pageSize,
  })
  return { list: rows, total: count, page, pageSize }
}

/** 结算 / 作废佣金台账：仅允许对 pending 状态执行，避免重复结算 */
export async function settleCommission(
  id: number,
  status: ReferralCommissionStatus,
): Promise<ShopReferralCommission> {
  if (status !== 'settled' && status !== 'void') {
    throw new AppError(400, 'INVALID_COMMISSION_STATUS')
  }
  const row = await ShopReferralCommission.findOne({ where: { id, tenantId: tid() } })
  if (!row) throw new AppError(404, 'COMMISSION_NOT_FOUND')
  if (row.status !== 'pending') {
    throw new AppError(409, 'COMMISSION_ALREADY_SETTLED')
  }
  row.status = status
  await row.save()
  return row
}
