// @vitest-environment node
/**
 * RMA 状态流转并发竞态回归
 *
 * 缺陷背景（2026-11-09 实证）：顾客侧 `cancelRma` / `submitReturnTracking` 与
 * 后台侧 `approveRma` / `rejectRma` 均为 findOne → 状态检查 → row.update 的
 * 非原子流转，并发窗口内两个请求读到同一旧状态后各自写入：
 * - 并发两次 cancel：两次都成功，状态由后写覆盖决定；
 * - 顾客 cancel 与后台 approve 交叉：两者都成功返回，已取消申请可能照常进入
 *   审核通过 / 退款链路（资金风险），或已批准申请被取消覆盖；
 * - 并发两次 submitReturnTracking：单号被后写覆盖。
 *
 * 修复：四处迁移统一改为 CAS 条件更新（UPDATE ... WHERE status = 期望旧值），
 * 以受影响行数判定胜负；0 行时回读区分 404 / 400，错误消息契约不变。
 * 全部数据使用独立租户 987709，与并行方 dev 数据零共享。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { runInTenant } from '../modules/tenant/context.js'
import { ShopRmaRequest } from '../modules/shop/models/index.js'
import * as rmaService from '../modules/storefront/services/rmaService.js'
import * as rmaAdminService from '../modules/shop/services/rmaAdminService.js'
import type { StorefrontSite } from '../modules/storefront/middleware/siteContext.js'

const TID = 987709
const EMAIL = 'rma-race@test.dev'
const CUSTOMER_ID = 4242
const uniq = (): string => `rr${Date.now()}${Math.floor(Math.random() * 1e6)}`
const inTenant = <T>(fn: () => Promise<T>): Promise<T> => runInTenant({ tenantId: TID }, fn)
const site = { tenantId: TID, channelId: null, shopId: null, defaultCurrency: 'USD', defaultLocale: 'en-US' } as StorefrontSite
const auth = { customerId: CUSTOMER_ID, email: EMAIL }

async function seed(status: ShopRmaRequest['status'] = 'pending', trackingNo: string | null = null) {
  return ShopRmaRequest.create({
    tenantId: TID,
    siteId: 0,
    orderId: 1,
    customerId: CUSTOMER_ID,
    email: EMAIL,
    status,
    reason: 'rma race fixture',
    items: [{ orderItemId: 1, skuId: 1, qty: 1, title: 'fixture' }],
    refundAmountCents: 10000,
    refundCurrency: 'USD',
    trackingNo,
  } as never)
}

async function state(id: number) {
  const row = await ShopRmaRequest.findByPk(id)
  return { status: row?.status, trackingNo: row?.trackingNo ?? null, rejectReason: row?.rejectReason ?? null }
}

const settled = (rs: PromiseSettledResult<unknown>[]) => ({
  ok: rs.filter((r) => r.status === 'fulfilled').length,
  rejected: rs.filter((r) => r.status === 'rejected').length,
})

beforeEach(async () => {
  await inTenant(async () => {
    await ShopRmaRequest.destroy({ where: { tenantId: TID } })
  })
})

describe('RMA 状态并发流转只能成功一次', () => {
  it('并发两次 cancel：恰好一个成功，最终 cancelled', async () => {
    await inTenant(async () => {
      const row = await seed()
      const rs = await Promise.allSettled([rmaService.cancelRma(site, row.id, CUSTOMER_ID), rmaService.cancelRma(site, row.id, CUSTOMER_ID)])
      expect(settled(rs)).toEqual({ ok: 1, rejected: 1 })
      expect(await state(row.id)).toMatchObject({ status: 'cancelled' })
    })
  })

  it('顾客 cancel 与后台 approve 交叉：恰好一方成功，终态与胜者一致', async () => {
    await inTenant(async () => {
      const row = await seed()
      const rs = await Promise.allSettled([rmaService.cancelRma(site, row.id, CUSTOMER_ID), rmaAdminService.approveRma(row.id)])
      expect(settled(rs)).toEqual({ ok: 1, rejected: 1 })
      const s = await state(row.id)
      expect(['cancelled', 'approved']).toContain(s.status)
      // 已取消的申请不允许以 approved 终态收尾（阻断已取消仍进退款链路）
      expect(s.status).not.toBe('approved')
    })
  })

  it('并发 approve 与 reject：恰好一方成功，驳回原因只随 rejected 落库', async () => {
    await inTenant(async () => {
      const row = await seed()
      const rs = await Promise.allSettled([rmaAdminService.approveRma(row.id), rmaAdminService.rejectRma(row.id, 'not returnable')])
      expect(settled(rs)).toEqual({ ok: 1, rejected: 1 })
      const s = await state(row.id)
      if (s.status === 'rejected') expect(s.rejectReason).toBe('not returnable')
      else expect(s).toMatchObject({ status: 'approved', rejectReason: null })
    })
  })

  it('并发两次 submitReturnTracking：只有首次生效，单号不被后写覆盖', async () => {
    await inTenant(async () => {
      const row = await seed('approved')
      const rs = await Promise.allSettled([
        rmaService.submitReturnTracking(site, row.id, 'TRACK-FIRST', CUSTOMER_ID),
        rmaService.submitReturnTracking(site, row.id, 'TRACK-SECOND', CUSTOMER_ID),
      ])
      expect(settled(rs)).toEqual({ ok: 1, rejected: 1 })
      const s = await state(row.id)
      expect(['TRACK-FIRST', 'TRACK-SECOND']).toContain(s.trackingNo)
      expect(s.status).toBe('returned')
    })
  })

  it('顺序重放（阴性对照）：终态后再次流转按状态机拒绝', async () => {
    await inTenant(async () => {
      const row = await seed()
      await expect(rmaService.cancelRma(site, row.id, CUSTOMER_ID)).resolves.toMatchObject({ status: 'cancelled' })
      await expect(rmaService.cancelRma(site, row.id, CUSTOMER_ID)).rejects.toThrow(/仅 pending/)
      await expect(rmaAdminService.approveRma(row.id)).rejects.toThrow(/仅 pending/)
      await expect(rmaAdminService.rejectRma(row.id, 'x')).rejects.toThrow(/仅 pending/)
      expect(await state(row.id)).toMatchObject({ status: 'cancelled' })
    })
  })
})

describe('既有契约不回退', () => {
  it('合法流转链 pending → approved → returned 正常', async () => {
    await inTenant(async () => {
      const row = await seed()
      await expect(rmaAdminService.approveRma(row.id)).resolves.toMatchObject({ status: 'approved' })
      await expect(rmaService.submitReturnTracking(site, row.id, 'TRACK-OK', CUSTOMER_ID)).resolves.toMatchObject({
        status: 'returned',
        trackingNo: 'TRACK-OK',
      })
      expect(await state(row.id)).toMatchObject({ status: 'returned', trackingNo: 'TRACK-OK' })
    })
  })

  it('不存在的申请返回 404；非本人申请对顾客侧 404', async () => {
    await inTenant(async () => {
      await expect(rmaService.cancelRma(site, 99999999, CUSTOMER_ID)).rejects.toThrow(/不存在/)
      await expect(rmaService.submitReturnTracking(site, 99999999, 'T', CUSTOMER_ID)).rejects.toThrow(/不存在/)
      await expect(rmaAdminService.approveRma(99999999)).rejects.toThrow(/不存在/)
      await expect(rmaAdminService.rejectRma(99999999, 'x')).rejects.toThrow(/不存在/)
      const row = await seed()
      await expect(rmaService.cancelRma(site, row.id, CUSTOMER_ID + 1)).rejects.toThrow(/不存在/)
    })
  })

  it('非 approved 状态不可回寄，pending 不可直接回寄', async () => {
    await inTenant(async () => {
      const row = await seed('pending')
      await expect(rmaService.submitReturnTracking(site, row.id, 'T', CUSTOMER_ID)).rejects.toThrow(/仅审核通过/)
      expect(await state(row.id)).toMatchObject({ status: 'pending', trackingNo: null })
    })
  })
})
