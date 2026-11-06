// @vitest-environment node
/**
 * 库存并发不变量回归（配合 inventoryService 的死锁重试与固定加锁顺序）。
 *
 * 使用独立 tenantId + 独立 skuId/warehouseId，与其余套件零共享行，
 * 避免并发测试互相抢写同一库存行造成 flake。
 *
 * 覆盖：
 * - 并发首次入库（间隙锁路径）：不死锁、不产生重复库存行、数量守恒
 * - 多仓并发调整（多行 FOR UPDATE 路径）：固定加锁顺序下无死锁、各仓守恒
 * - 并发释放：locked 不被减成负数，available = quantity - locked 口径一致
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { runInTenant } from '../modules/tenant/context.js'
import { ShopInventory, ShopInventoryLog, AuditLog } from '../modules/shop/models/index.js'
import * as inventoryService from '../modules/shop/services/inventoryService.js'

const TID = 987654
const SKU_A = 990001
const SKU_B = 990002
const WHS = [990101, 990102, 990103]

const inTenant = <T>(fn: () => Promise<T>): Promise<T> => runInTenant({ tenantId: TID }, fn)

async function clean(): Promise<void> {
  await ShopInventory.destroy({ where: { tenantId: TID } })
  await ShopInventoryLog.destroy({ where: { tenantId: TID } })
  await AuditLog.destroy({ where: { tenantId: TID } })
}

beforeEach(clean)
afterAll(clean)

describe('库存并发不变量', () => {
  it('并发首次入库：不死锁、不产生重复库存行、数量守恒', async () => {
    const results = await inTenant(() =>
      Promise.allSettled(Array.from({ length: 10 }, () => inventoryService.adjust(SKU_A, WHS[0], 1))),
    )
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true)

    const rows = await ShopInventory.findAll({ where: { tenantId: TID, skuId: SKU_A, warehouseId: WHS[0] } })
    expect(rows).toHaveLength(1)
    expect(rows[0].quantity).toBe(10)
    expect(await inTenant(() => inventoryService.available(SKU_A))).toBe(10)
  })

  it('多仓并发调整：固定加锁顺序下无死锁，各仓数量守恒', async () => {
    await inTenant(async () => {
      for (const w of WHS) await inventoryService.adjust(SKU_B, w, 20)
    })

    // 12 次操作交错命中 3 个仓，6 次 +1 / 6 次 -1，净变化 0
    const results = await Promise.allSettled(
      Array.from({ length: 12 }, (_, i) =>
        inTenant(() => inventoryService.adjust(SKU_B, WHS[i % WHS.length], i % 2 === 0 ? 1 : -1)),
      ),
    )
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true)

    const rows = await ShopInventory.findAll({ where: { tenantId: TID, skuId: SKU_B } })
    expect(rows).toHaveLength(3)
    expect(rows.every((r) => r.quantity >= 0)).toBe(true)
    expect(rows.reduce((s, r) => s + r.quantity, 0)).toBe(60)
    expect(await inTenant(() => inventoryService.available(SKU_B))).toBe(60)
  })

  it('并发释放：locked 不为负，available 口径一致', async () => {
    await inTenant(async () => {
      await inventoryService.adjust(SKU_A, WHS[0], 10)
      const row = await ShopInventory.findOne({ where: { tenantId: TID, skuId: SKU_A, warehouseId: WHS[0] } })
      await row!.update({ locked: 6 })
    })

    const results = await inTenant(() =>
      Promise.allSettled(Array.from({ length: 8 }, () => inventoryService.release(SKU_A, 1, 'concurrency-test'))),
    )
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true)

    const rows = await ShopInventory.findAll({ where: { tenantId: TID, skuId: SKU_A } })
    expect(rows).toHaveLength(1)
    expect(rows[0].locked).toBeGreaterThanOrEqual(0)
    expect(await inTenant(() => inventoryService.available(SKU_A))).toBe(rows[0].quantity - rows[0].locked)
  })
})
