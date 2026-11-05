// @vitest-environment node
/**
 * RMA admin 审批测试（P4-T17 G4 技术缺口②：客服履约——查单/审批/驳回）
 *
 * 覆盖：列表过滤（status/orderId）、pending→approved、pending→rejected（附原因）、
 * 非 pending 拒绝操作（400）、不存在（404）。
 * 数据用唯一 email 前缀隔离，afterAll 按前缀清理，不影响既有数据。
 */
import { describe, it, expect, afterAll } from 'vitest'
import { Op } from 'sequelize'
import { approveRma, listRmas, rejectRma } from '../modules/shop/services/rmaAdminService.js'
import { ShopRmaRequest } from '../modules/shop/models/index.js'
import { runInTenant } from '../modules/tenant/context.js'
import { AppError } from '../middleware/errorHandler.js'

const TID = 1
const RUN = Date.now().toString(36)
const EMAIL_PREFIX = `rma-admin-test-${RUN}@`
let seq = 0

async function seed(status: string, orderId: number) {
  return ShopRmaRequest.create({
    tenantId: TID,
    siteId: 1,
    orderId,
    email: `${EMAIL_PREFIX}${++seq}@t.local`,
    status,
    reason: 'size mismatch',
    items: [{ orderItemId: 1, skuId: 1, qty: 1, title: 'test' }],
    refundAmountCents: 12990,
    refundCurrency: 'USD',
  } as never)
}

afterAll(async () => {
  const where: Record<string | symbol, unknown> = { email: { [Op.like]: `${EMAIL_PREFIX}%` } }
  await ShopRmaRequest.destroy({ where: where as never })
})

describe('RMA admin 审批', () => {
  it('列表：status 过滤与 orderId 过滤，id 倒序', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const orderId = 991000 + (Date.now() % 100000)
      await seed('pending', orderId)
      await seed('pending', orderId)
      await seed('approved', orderId)
      const pendingOnly = await listRmas({ status: 'pending', limit: 500 })
      const mine = pendingOnly.rows.filter((r) => r.email.startsWith(EMAIL_PREFIX))
      expect(mine.length).toBe(2)
      for (const r of mine) expect(r.status).toBe('pending')
      const forOrder = await listRmas({ orderId, limit: 500 })
      expect(forOrder.total).toBe(3)
      expect(forOrder.rows[0].id).toBeGreaterThan(forOrder.rows[forOrder.rows.length - 1].id)
    })
  })

  it('approve：pending → approved；非 pending → 400；不存在 → 404', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const row = await seed('pending', 1)
      const approved = await approveRma(row.id)
      expect(approved.status).toBe('approved')
      await expect(approveRma(row.id)).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('仅 pending'),
      })
      await expect(approveRma(2147483000)).rejects.toMatchObject({
        statusCode: 404,
        message: expect.stringContaining('不存在'),
      })
    })
  })

  it('reject：pending → rejected 并持久化原因；approved 不可驳回', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const row = await seed('pending', 1)
      const rejected = await rejectRma(row.id, '超出退货窗口期')
      expect(rejected.status).toBe('rejected')
      expect(rejected.rejectReason).toBe('超出退货窗口期')
      const approved = await seed('approved', 1)
      await expect(rejectRma(approved.id, 'reason')).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('仅 pending'),
      })
    })
  })
})
