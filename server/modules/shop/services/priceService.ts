import { Op } from 'sequelize'
import { AppError } from '../../../middleware/errorHandler.js'
import { ShopProductPrice, ShopRateSnapshot } from '../models/index.js'
import type { RateSnapshotInput, UpsertPriceInput } from '../../../shared/schemas/shop.js'
import { getTenantContext } from '../../../modules/tenant/context.js'

/** 当前租户 ID（读取全局租户上下文，平台超管兜底为 1） */
const tid = (): number => getTenantContext()?.tenantId ?? 1

/** MySQL 死锁属可重试的瞬态错误（并发 upsert 争用唯一索引间隙锁） */
function isDeadlock(err: unknown): boolean {
  return (
    !!err &&
    typeof err === 'object' &&
    (err as { name?: string }).name === 'SequelizeDatabaseError' &&
    /deadlock/i.test((err as { message?: string }).message ?? '')
  )
}

async function withDeadlockRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  let lastErr: unknown
  for (let i = 0; i < tries; i++) {
    try {
      return await fn()
    } catch (err) {
      if (isDeadlock(err) && i < tries - 1) {
        lastErr = err
        continue
      }
      throw err
    }
  }
  throw lastErr
}

/** SKU 多币种价格 upsert（每 SKU 每币种一条） */
export async function upsertPrice(skuId: number, input: UpsertPriceInput) {
  const [row] = await withDeadlockRetry(() =>
    ShopProductPrice.upsert(
      {
        skuId,
        currency: input.currency.toUpperCase(),
        amount: input.amount,
        rateSnapshotId: input.rateSnapshotId ?? null,
        tenantId: getTenantContext()?.tenantId ?? 1,
      } as never,
      { returning: true },
    ),
  )
  return Array.isArray(row) ? row[0] : row
}

export async function listPricesBySku(skuId: number) {
  return ShopProductPrice.findAll({ where: { skuId, tenantId: tid() }, order: [['currency', 'ASC']] })
}

export async function deletePrice(skuId: number, currency: string): Promise<void> {
  const count = await ShopProductPrice.destroy({ where: { skuId, currency: currency.toUpperCase(), tenantId: tid() } })
  if (count === 0) throw new AppError(404, '价格记录不存在')
}
