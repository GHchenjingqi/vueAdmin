import { Op } from 'sequelize'
import { AppError } from '../../../middleware/errorHandler.js'
import { ShopProductPrice, ShopRateSnapshot } from '../models/index.js'
import type { RateSnapshotInput, UpsertPriceInput } from '../../../shared/schemas/shop.js'

/** SKU 多币种价格 upsert（每 SKU 每币种一条） */
export async function upsertPrice(skuId: number, input: UpsertPriceInput) {
  const [row] = await ShopProductPrice.upsert(
    {
      skuId,
      currency: input.currency.toUpperCase(),
      amount: input.amount,
      rateSnapshotId: input.rateSnapshotId ?? null,
    } as never,
    { returning: true },
  )
  return Array.isArray(row) ? row[0] : row
}

export async function listPricesBySku(skuId: number) {
  return ShopProductPrice.findAll({ where: { skuId }, order: [['currency', 'ASC']] })
}

export async function deletePrice(skuId: number, currency: string): Promise<void> {
  const count = await ShopProductPrice.destroy({ where: { skuId, currency: currency.toUpperCase() } })
  if (count === 0) throw new AppError(404, '价格记录不存在')
}
