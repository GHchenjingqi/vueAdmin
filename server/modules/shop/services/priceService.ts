import { Op } from 'sequelize'
import { AppError } from '../../../middleware/errorHandler.js'
import { ShopProductPrice, ShopRateSnapshot, ShopSku, ShopSpu } from '../models/index.js'
import type { RateSnapshotInput, UpsertPriceInput } from '../../../shared/schemas/shop.js'
import { getTenantContext } from '../../../modules/tenant/context.js'
import { withDeadlockRetry } from './deadlockRetry.js'

/** 当前租户 ID（读取全局租户上下文，平台超管兜底为 1） */
const tid = (): number => getTenantContext()?.tenantId ?? 1

/** 死锁重试统一走 deadlockRetry.ts（原生错误码判定 + 指数退避） */

/** SKU 多币种价格 upsert（每 SKU 每币种一条）；降价时触发收藏提醒（异常隔离不阻塞） */
export async function upsertPrice(skuId: number, input: UpsertPriceInput) {
  const currency = input.currency.toUpperCase()
  const tId = getTenantContext()?.tenantId ?? 1

  // 改价前读旧价（用于降价提醒 diff）
  const before = await ShopProductPrice.findOne({
    where: { skuId, currency, tenantId: tId },
    attributes: ['amount'],
  })
  const oldAmount = before ? Number(before.amount) : null

  const [row] = await withDeadlockRetry(() =>
    ShopProductPrice.upsert(
      {
        skuId,
        currency,
        amount: input.amount,
        rateSnapshotId: input.rateSnapshotId ?? null,
        tenantId: tId,
      } as never,
      { returning: true },
    ),
  )

  // 降价提醒钩子：新价更低时通知收藏了该商品的顾客。异常隔离，绝不阻塞价格写入。
  const newAmount = Number(input.amount)
  if (oldAmount !== null && newAmount < oldAmount) {
    try {
      const sku = await ShopSku.findOne({ where: { id: skuId, tenantId: tId }, attributes: ['spuId'] })
      if (sku) {
        const spu = await ShopSpu.findOne({ where: { id: sku.spuId, tenantId: tId }, attributes: ['name'] })
        if (spu) {
          const { notifyPriceDrop } = await import('../../storefront/services/wishlistService.js')
          const name = typeof spu.name === 'object' && spu.name ? Object.values(spu.name)[0] ?? 'Product' : 'Product'
          await notifyPriceDrop(sku.spuId, {
            oldPrice: oldAmount,
            newPrice: newAmount,
            currency,
            productName: name,
          })
        }
      }
    } catch (err) {
      console.warn(`[wishlist] 降价提醒入队失败（不阻断改价）:`, err instanceof Error ? err.message : err)
    }
  }

  return Array.isArray(row) ? row[0] : row
}

export async function listPricesBySku(skuId: number) {
  return ShopProductPrice.findAll({ where: { skuId, tenantId: tid() }, order: [['currency', 'ASC']] })
}

export async function deletePrice(skuId: number, currency: string): Promise<void> {
  const count = await ShopProductPrice.destroy({ where: { skuId, currency: currency.toUpperCase(), tenantId: tid() } })
  if (count === 0) throw new AppError(404, '价格记录不存在')
}
