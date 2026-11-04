import { AppError } from '../../../middleware/errorHandler.js'
import type { Transaction } from 'sequelize'
import sequelize from '../../../config/database.js'
import { ShopInventory, ShopInventoryLog, ShopSku } from '../models/index.js'
import { getTenantContext } from '../../../modules/tenant/context.js'

/** 当前租户 ID（读取全局租户上下文，平台超管兜底为 1） */
const tid = (): number => getTenantContext()?.tenantId ?? 1

function tenantId(): number {
  return getTenantContext()?.tenantId ?? 1
}

async function findOrCreateRow(skuId: number, warehouseId: number, t?: Transaction) {
  const tId = tenantId()
  let row = await ShopInventory.findOne({ where: { skuId, warehouseId, tenantId: tId }, transaction: t, lock: t ? t.LOCK.UPDATE : undefined } as any)
  if (!row) {
    row = await ShopInventory.create({ skuId, warehouseId, quantity: 0, locked: 0, tenantId: tId } as never, { transaction: t })
  }
  return row
}

/** 调整在库量（入库/出库），并记流水 */
export async function adjust(skuId: number, warehouseId: number, delta: number): Promise<ShopInventory> {
  if (delta === 0) throw new AppError(400, '调整量不能为 0')
  return sequelize.transaction(async (t) => {
    const row = await findOrCreateRow(skuId, warehouseId, t)
    const next = row.quantity + delta
    if (next < 0) throw new AppError(400, `库存不足，调整后将为负数（当前 ${row.quantity}，调整 ${delta}）`)
    await row.update({ quantity: next }, { transaction: t })
    await ShopInventoryLog.create({
      skuId,
      warehouseId,
      delta,
      type: delta > 0 ? 'in' : 'out',
      ref: null,
      tenantId: tenantId(),
    } as never, { transaction: t })
    return row
  })
}

/** 占用库存（下单时锁定），available = quantity - locked */
export async function occupy(skuId: number, qty: number, ref: string): Promise<void> {
  if (qty <= 0) throw new AppError(400, '占用数量必须大于 0')
  const tId = tid()
  const sku = await ShopSku.findOne({ where: { id: skuId, tenantId: tId } })
  if (!sku) throw new AppError(404, 'SKU 不存在')

  await sequelize.transaction(async (t) => {
    // 跨仓聚合可用量（加锁避免并发超卖）
    const rows = await ShopInventory.findAll({ where: { skuId, tenantId: tId }, transaction: t, lock: t.LOCK.UPDATE } as any)
    let available = 0
    for (const r of rows) available += r.quantity - r.locked
    if (available < qty) {
      throw new AppError(400, `库存不足，可用量 ${available}，需占用 ${qty}`)
    }
    // 按仓库顺序占用（优先扣减有货的仓库）
    let remain = qty
    for (const r of rows) {
      if (remain <= 0) break
      const free = r.quantity - r.locked
      const take = Math.min(free, remain)
      if (take <= 0) continue
      await r.update({ locked: r.locked + take }, { transaction: t })
      await ShopInventoryLog.create({
        skuId,
        warehouseId: r.warehouseId,
        delta: take,
        type: 'lock',
        ref,
        tenantId: tId,
      } as never, { transaction: t })
      remain -= take
    }
  })
}

/** 释放占用（取消订单时） */
export async function release(skuId: number, qty: number, ref: string): Promise<void> {
  if (qty <= 0) throw new AppError(400, '释放数量必须大于 0')
  const tId = tid()
  await sequelize.transaction(async (t) => {
    const rows = await ShopInventory.findAll({ where: { skuId, tenantId: tId }, transaction: t, lock: t.LOCK.UPDATE } as any)
    let remain = qty
    for (const r of rows) {
      if (remain <= 0) break
      const give = Math.min(r.locked, remain)
      if (give <= 0) continue
      await r.update({ locked: r.locked - give }, { transaction: t })
      await ShopInventoryLog.create({
        skuId,
        warehouseId: r.warehouseId,
        delta: -give,
        type: 'unlock',
        ref,
        tenantId: tId,
      } as never, { transaction: t })
      remain -= give
    }
  })
}

/** 跨仓聚合可用量 */
export async function available(skuId: number): Promise<number> {
  const rows = await ShopInventory.findAll({ where: { skuId, tenantId: tid() } })
  return rows.reduce((sum, r) => sum + (r.quantity - r.locked), 0)
}

/** 实际扣减在库量（发货时调用，与 release 配套：release 解锁，deduct 出账） */
export async function deduct(skuId: number, qty: number, ref: string): Promise<void> {
  if (qty <= 0) throw new AppError(400, '扣减数量必须大于 0')
  const tId = tid()
  await sequelize.transaction(async (t) => {
    const rows = await ShopInventory.findAll({ where: { skuId, tenantId: tId }, transaction: t, lock: t.LOCK.UPDATE } as any)
    let remain = qty
    for (const r of rows) {
      if (remain <= 0) break
      const take = Math.min(r.quantity, remain)
      if (take <= 0) continue
      await r.update({ quantity: r.quantity - take }, { transaction: t })
      await ShopInventoryLog.create({
        skuId,
        warehouseId: r.warehouseId,
        delta: -take,
        type: 'out',
        ref,
        tenantId: tId,
      } as never, { transaction: t })
      remain -= take
    }
    if (remain > 0) throw new AppError(400, `库存不足，无法扣减（缺口 ${remain}）`)
  })
}


/** 按 SKU × 仓库 返回库存明细 */
export async function listInventory(params: { skuId?: number; warehouseId?: number; page?: number; pageSize?: number } = {}) {
  const page = params.page ?? 1
  const pageSize = params.pageSize ?? 20
  const where: Record<string, unknown> = { tenantId: tid() }
  if (params.skuId) where.skuId = params.skuId
  if (params.warehouseId) where.warehouseId = params.warehouseId
  const { rows, count } = await ShopInventory.findAndCountAll({
    where,
    order: [['id', 'ASC']],
    offset: (page - 1) * pageSize,
    limit: pageSize,
  })
  const list = rows.map((r) => ({
    ...r.toJSON(),
    available: r.quantity - r.locked,
  }))
  return { list, total: count, page, pageSize }
}

export async function listLogs(params: { skuId?: number; warehouseId?: number; page?: number; pageSize?: number } = {}) {
  const page = params.page ?? 1
  const pageSize = params.pageSize ?? 20
  const where: Record<string, unknown> = { tenantId: tid() }
  if (params.skuId) where.skuId = params.skuId
  if (params.warehouseId) where.warehouseId = params.warehouseId
  const { rows, count } = await ShopInventoryLog.findAndCountAll({
    where,
    order: [['id', 'DESC']],
    offset: (page - 1) * pageSize,
    limit: pageSize,
  })
  return { list: rows, total: count, page, pageSize }
}
