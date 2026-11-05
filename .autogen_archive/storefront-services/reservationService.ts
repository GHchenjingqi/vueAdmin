import { Op, QueryTypes } from 'sequelize'
import sequelize from '../../../config/database.js'
import { AppError } from '../../../middleware/errorHandler.js'
import { getTenantContext } from '../../tenant/context.js'
import { ShopInventory } from '../../shop/models/index.js'
import { ShopInventoryReservation } from '../models/index.js'

/**
 * 库存预占（P3-T08 / 状态机 §3 / T-01 并发不超卖）
 *
 * 硬约束：
 * 1. 条件更新：UPDATE inventory SET locked=locked+:q WHERE id=:id AND (quantity-locked)>=:q
 *    影响行数=0 → 换仓或抛 INSUFFICIENT_STOCK（事务回滚，先前仓库行一并回滚）
 * 2. 跨 SKU 一致性：单事务逐行预占，任一失败整体回滚
 * 3. 幂等：release/commit 仅对 status='active' 生效（状态条件更新）
 * 4. TTL：sweeper 定时释放过期预占（T-05）
 */

const tid = (): number => getTenantContext()?.tenantId ?? 1

export interface ReserveItem {
  skuId: number
  qty: number
}

/** 预占一组 SKU（单事务，跨仓按可售量择优）；成功返回 reservationId 列表 */
export async function reserve(items: ReserveItem[], ref: string, ttlMinutes = 15): Promise<number[]> {
  const tenantId = tid()
  const expiresAt = new Date(Date.now() + ttlMinutes * 60_000)
  return sequelize.transaction(async (t) => {
    const ids: number[] = []
    for (const item of items) {
      const rows = await ShopInventory.findAll({
        where: { tenantId, skuId: item.skuId },
        order: [[sequelize.literal('`quantity` - `locked`'), 'DESC']],
      })
      let done = false
      for (const inv of rows) {
        const [, meta] = (await sequelize.query(
          'UPDATE inventory SET locked = locked + :qty WHERE id = :id AND (quantity - locked) >= :qty',
          { replacements: { qty: item.qty, id: inv.id }, type: QueryTypes.UPDATE, transaction: t },
        )) as unknown as [unknown, { affectedRows?: number }]
        if ((meta?.affectedRows ?? 0) > 0) {
          const created = await ShopInventoryReservation.create(
            { tenantId, skuId: item.skuId, warehouseId: inv.warehouseId, qty: item.qty, status: 'active', ref, expiresAt } as never,
            { transaction: t },
          )
          ids.push((created as unknown as { id: number }).id)
          done = true
          break
        }
      }
      if (!done) {
        throw new AppError(409, 'INSUFFICIENT_STOCK')
      }
    }
    return ids
  })
}

/** 幂等释放（过期/取消/支付失败）：locked-=q，status→released */
export async function releaseByRef(ref: string): Promise<number> {
  const tenantId = tid()
  return sequelize.transaction(async (t) => {
    const rows = await ShopInventoryReservation.findAll({ where: { tenantId, ref, status: 'active' } })
    let released = 0
    for (const r of rows) {
      await sequelize.query(
        'UPDATE inventory SET locked = GREATEST(locked - :qty, 0) WHERE tenantId = :tenantId AND skuId = :skuId AND warehouseId = :warehouseId',
        { replacements: { qty: r.qty, tenantId, skuId: r.skuId, warehouseId: r.warehouseId }, type: QueryTypes.UPDATE, transaction: t },
      )
      await r.update({ status: 'released', releasedAt: new Date() }, { transaction: t })
      released += 1
    }
    return released
  })
}

/** 支付成功转实扣：quantity-=q，locked-=q，status→committed */
export async function commitByRef(ref: string): Promise<number> {
  const tenantId = tid()
  return sequelize.transaction(async (t) => {
    const rows = await ShopInventoryReservation.findAll({ where: { tenantId, ref, status: 'active' } })
    let committed = 0
    for (const r of rows) {
      await sequelize.query(
        'UPDATE inventory SET quantity = quantity - :qty, locked = GREATEST(locked - :qty, 0) WHERE tenantId = :tenantId AND skuId = :skuId AND warehouseId = :warehouseId',
        { replacements: { qty: r.qty, tenantId, skuId: r.skuId, warehouseId: r.warehouseId }, type: QueryTypes.UPDATE, transaction: t },
      )
      await r.update({ status: 'committed', committedAt: new Date() }, { transaction: t })
      committed += 1
    }
    return committed
  })
}

/** sweeper：释放全部过期预占（幂等，T-05） */
export async function sweepExpiredReservations(): Promise<number> {
  const tenantId = tid()
  const expired = await ShopInventoryReservation.findAll({
    where: { tenantId, status: 'active', expiresAt: { [Op.lt]: new Date() } },
  })
  let n = 0
  for (const r of expired) {
    n += await releaseByRef(r.ref ?? `sweep-${r.id}`)
  }
  return n
}
