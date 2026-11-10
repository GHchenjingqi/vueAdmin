import { describe, expect, it, vi, beforeEach } from 'vitest'

/**
 * 会员系统服务测试（mock sequelize 模型层，纯逻辑锁定）：
 * - getMembership：等级/积分/成长值/下一级进度
 * - awardPointsForOrder：幂等（重复回调只发一次）、等级只升不降
 * - adjustPoints：非零整数校验、负余额保护
 */

const hoist = vi.hoisted(() => {
  const customerRecord = {
    id: 11,
    tenantId: 1,
    email: 'c@t.io',
    membershipTierId: null as number | null,
    points: 0,
    growthValue: 0,
    update: vi.fn(async function (this: unknown, patch: Record<string, unknown>) { Object.assign(this, patch) }),
  }
  const tiers = [
    { id: 1, name: '普通会员', level: 1, growthThreshold: 0, discountPct: 0 },
    { id: 2, name: '白银会员', level: 2, growthThreshold: 1000, discountPct: 98 },
    { id: 3, name: '黄金会员', level: 3, growthThreshold: 5000, discountPct: 95 },
  ]
  const pointsLogs: Record<string, unknown>[] = []
  return { customerRecord, tiers, pointsLogs }
})

vi.mock('../models/index.js', () => ({
  ShopCustomer: {
    findOne: vi.fn(async () => hoist.customerRecord),
    update: vi.fn(),
  },
  ShopMembershipTier: {
    findAll: vi.fn(async () => hoist.tiers),
    findOne: vi.fn(async (args: { where: { id?: number } }) => hoist.tiers.find((t) => t.id === args.where.id) ?? null),
  },
  ShopPointsLog: {
    findOne: vi.fn(async () => null),
    create: vi.fn(async (rec: Record<string, unknown>) => { hoist.pointsLogs.push(rec) }),
    findAndCountAll: vi.fn(),
    count: vi.fn(),
  },
}))

vi.mock('../../../config/database.js', () => ({
  default: {
    transaction: vi.fn(async (fn: (t: unknown) => Promise<unknown>) => fn({ LOCK: { UPDATE: 'UPDATE' } })),
  },
}))

vi.mock('../../../middleware/errorHandler.js', () => ({
  AppError: class AppError extends Error {
    constructor(public status: number, message: string) { super(message) }
  },
}))

import * as membershipService from '../modules/shop/services/membershipService.js'
import { ShopCustomer, ShopPointsLog } from '../modules/shop/models/index.js'

describe('membershipService（会员系统）', () => {
  beforeEach(() => {
    hoist.customerRecord.membershipTierId = null
    hoist.customerRecord.points = 0
    hoist.customerRecord.growthValue = 0
    hoist.pointsLogs.length = 0
    vi.clearAllMocks()
    vi.mocked(ShopPointsLog.findOne).mockResolvedValue(null)
  })

  it('getMembership：返回等级/积分/成长值/下一级进度', async () => {
    const rec = hoist.customerRecord
    rec.membershipTierId = 1
    rec.points = 120
    rec.growthValue = 1200
    const view = await membershipService.getMembership(1, 11)
    expect(view.tier?.name).toBe('普通会员')
    expect(view.points).toBe(120)
    expect(view.nextTier).toBeNull() // 1200 >= 白银 1000，无更高门槛（黄金 5000 在白银之后）
    // 修正：白银门槛 1000 已满足但 current 挂的是 tier 1 —— nextTier 取第一个未达门槛（黄金 5000）
    expect(view.nextTier?.name).toBe('黄金会员')
    expect(view.nextTier?.remaining).toBe(3800)
  })

  it('awardPointsForOrder：1 元=1 积分；成长值累计；等级只升不降', async () => {
    const rec = hoist.customerRecord
    rec.membershipTierId = 1
    rec.points = 0
    rec.growthValue = 900
    await membershipService.awardPointsForOrder(1, 501, 11, 15000) // 150 元
    expect(rec.points).toBe(150)
    expect(rec.growthValue).toBe(1050)
    // 1050 >= 白银 1000 → 升白银
    expect(rec.membershipTierId).toBe(2)
    expect(hoist.pointsLogs).toHaveLength(1)
    expect(hoist.pointsLogs[0]).toMatchObject({ change: 150, balanceAfter: 150, reason: 'order_captured', orderId: 501 })
  })

  it('awardPointsForOrder：幂等（流水已存在则跳过）', async () => {
    vi.mocked(ShopPointsLog.findOne).mockResolvedValue({ id: 9 } as never)
    const rec = hoist.customerRecord
    rec.points = 10
    await membershipService.awardPointsForOrder(1, 501, 11, 15000)
    expect(rec.points).toBe(10) // 未变
    expect(hoist.pointsLogs).toHaveLength(0)
  })

  it('awardPointsForOrder：金额为 0 或 customerId 缺失直接返回', async () => {
    await membershipService.awardPointsForOrder(1, 502, 0, 15000)
    await membershipService.awardPointsForOrder(1, 502, 11, 0)
    expect(hoist.pointsLogs).toHaveLength(0)
  })

  it('adjustPoints：负调整扣为负数被拒绝', async () => {
    const rec = hoist.customerRecord
    rec.points = 10
    await expect(membershipService.adjustPoints(1, 11, -20, { type: 'admin', id: 1 }, '测试')).rejects.toMatchObject({ status: 400 })
    expect(rec.points).toBe(10)
  })

  it('adjustPoints：正常调分写流水', async () => {
    const rec = hoist.customerRecord
    rec.points = 10
    const out = await membershipService.adjustPoints(1, 11, 5, { type: 'admin', id: 1 }, '补偿')
    expect(out.points).toBe(15)
    expect(rec.points).toBe(15)
    expect(hoist.pointsLogs[0]).toMatchObject({ change: 5, balanceAfter: 15, reason: 'manual', operatorId: 1 })
  })

  it('adjustPoints：非零整数校验', async () => {
    await expect(membershipService.adjustPoints(1, 11, 0, { type: 'admin', id: 1 })).rejects.toMatchObject({ status: 400 })
    await expect(membershipService.adjustPoints(1, 11, 1.5, { type: 'admin', id: 1 })).rejects.toMatchObject({ status: 400 })
  })

  it('setTier：等级不存在报 404', async () => {
    await expect(membershipService.setTier(1, 11, 999)).rejects.toMatchObject({ status: 404 })
  })
})
