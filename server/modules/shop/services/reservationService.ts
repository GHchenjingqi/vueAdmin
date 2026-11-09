import { Op } from 'sequelize'
import sequelize from '../../../config/database.js'
import { ShopInventoryReservation } from '../models/index.js'
import { getTenantContext } from '../../tenant/context.js'
import * as inventoryService from './inventoryService.js'
import * as warehouseRouting from './warehouseRoutingService.js'
import config from '../../../config/index.js'

/**
 * 库存预占服务（阶段 5 步骤 4 / P3-T08）
 *
 * 在既有 inventoryService（inventory.locked 行锁占用）之上，叠加带 TTL 的预占记录，
 * 以支持「下单占用 → 支付提交 → 发货扣减」的闭环，并允许 sweeper 释放过期未支付预占。
 * 复用 shop 模型层，不建第二套后端。
 */

const tid = (): number => getTenantContext()?.tenantId ?? 1

export interface ReserveItemInput {
  skuId: number
  warehouseId: number
  qty: number
}

/** 预占 TTL（分钟），取自 config.checkout.reservationTtlMinutes */
export function reservationTtlMs(): number {
  return (config.checkout?.reservationTtlMinutes ?? 30) * 60_000
}

/** 为某 SKU 选取「可用量最大」的仓库作为预占代表仓库（库存跨仓分布记录在 inventory.locked） */
export async function pickWarehouse(skuId: number, country?: string | null): Promise<number> {
  return warehouseRouting.pickWarehouse(skuId, country)
}

/**
 * 占用库存并写入预占记录（TTL）。
 * 逐条 occupy（内部自带事务 + 行锁）+ 写入预占记录；若记录写入失败则回滚本次占用，保证不残留孤儿占用。
 * ref 通常为 orderNo。
 */
export async function reserveItems(ref: string, items: ReserveItemInput[]): Promise<ShopInventoryReservation[]> {
  const tId = tid()
  const expiresAt = new Date(Date.now() + reservationTtlMs())
  const rows: ShopInventoryReservation[] = []
  for (const item of items) {
    await inventoryService.occupy(item.skuId, item.qty, ref)
    try {
      const row = await ShopInventoryReservation.create({
        tenantId: tId,
        skuId: item.skuId,
        warehouseId: item.warehouseId,
        qty: item.qty,
        status: 'active',
        ref,
        expiresAt,
      } as never)
      rows.push(row)
    } catch (err) {
      // 回滚刚做的占用，避免孤儿占用
      await inventoryService.release(item.skuId, item.qty, ref).catch(() => undefined)
      throw err
    }
  }
  return rows
}

/** 提交预占（支付成功后）：标记 committed，库存继续保持占用直至发货扣减 */
export async function commitReservation(ref: string): Promise<void> {
  await ShopInventoryReservation.update(
    { status: 'committed', committedAt: new Date() },
    { where: { ref, status: 'active', tenantId: tid() } as never },
  )
}

/** 释放预占（取消 / 支付失败 / 过期）：标记 released 并释放对应库存占用 */
export async function releaseReservation(ref: string): Promise<void> {
  const tId = tid()
  const rows = await ShopInventoryReservation.findAll({ where: { ref, tenantId: tId } as never })
  await sequelize.transaction(async (t) => {
    for (const row of rows) {
      // G3：已 committed 的预占代表已支付订单，重复释放会回补库存造成超卖
      if (row.status !== 'released' && row.status !== 'committed') {
        await inventoryService.release(row.skuId, row.qty, ref)
        await row.update({ status: 'released', releasedAt: new Date() }, { transaction: t })
      }
    }
  })
}

/**
 * 释放过期预占（sweeper 调用）。仅处理 active 且已过期者，幂等。
 * 返回释放的预占数（用于监控 / 告警）。
 */
export async function releaseExpiredReservations(): Promise<number> {
  const tId = tid()
  const now = new Date()
  const expired = await ShopInventoryReservation.findAll({
    where: { status: 'active', expiresAt: { [Op.lt]: now } as never, tenantId: tId } as never,
  })
  let released = 0
  for (const row of expired) {
    try {
      await inventoryService.release(row.skuId, row.qty, row.ref ?? 'sweeper')
      await row.update({ status: 'released', releasedAt: now } as never)
      released += 1
    } catch {
      // 单条失败不影响其余；留待下次 sweeper
    }
  }
  return released
}
