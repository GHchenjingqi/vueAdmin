import { Op } from 'sequelize'
import { AppError } from '../../../middleware/errorHandler.js'
import { ShopRateSnapshot } from '../models/index.js'
import type { RateSnapshotInput } from '../../../shared/schemas/shop.js'

/** 写入/更新某日快照（同租户同基准币同日期唯一） */
export async function saveRateSnapshot(input: RateSnapshotInput) {
  const [row] = await ShopRateSnapshot.upsert(
    {
      baseCurrency: input.baseCurrency.toUpperCase(),
      rates: input.rates,
      rateDate: input.rateDate,
    } as never,
    { returning: true },
  )
  return Array.isArray(row) ? row[0] : row
}

/** 按日期取快照（就近向前取：无当日则取该日之前最近一条） */
export async function getSnapshot(baseCurrency: string, date?: string) {
  const where: Record<string, unknown> = { baseCurrency: baseCurrency.toUpperCase() }
  if (date) where.rateDate = { [Op.lte]: date }
  const row = await ShopRateSnapshot.findOne({ where, order: [['rateDate', 'DESC']] })
  if (!row) throw new AppError(404, date ? `没有 ${date} 及之前的 ${baseCurrency} 汇率快照` : `没有 ${baseCurrency} 汇率快照`)
  return row
}

export async function listSnapshots(params: { page?: number; pageSize?: number }) {
  const page = params.page ?? 1
  const pageSize = params.pageSize ?? 20
  const { rows, count } = await ShopRateSnapshot.findAndCountAll({
    order: [['rateDate', 'DESC']],
    offset: (page - 1) * pageSize,
    limit: pageSize,
  })
  return { list: rows, total: count, page, pageSize }
}
