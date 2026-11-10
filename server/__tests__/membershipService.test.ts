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
    orderCount: 0,
    loginCount: 0,
    update: vi.fn(async function (this: unknown, patch: Record<string, unknown>) { Object.assign(this, patch) }),
  }
  const tiers = [
    { id: 1, name: '普通会员', level: 1, growthThreshold: 0, discountPct: 0, loginFrequency: 0, orderCountThreshold: 0, matchStrategy: 'any' },
    { id: 2, name: '白银会员', level: 2, growthThreshold: 1000, discountPct: 98, loginFrequency: 0, orderCountThreshold: 0, matchStrategy: 'any' },
    { id: 3, name: '黄金会员', level: 3, growthThreshold: 5000, discountPct: 95, loginFrequency: 0, orderCountThreshold: 0, matchStrategy: 'any' },
  ]
  const pointsLogs: Record<string, unknown>[] = []
  return { customerRecord, tiers, pointsLogs }
})

vi.mock('../modules/shop/models/index.js', () => ({
  ShopCustomer: {
    findOne: vi.fn(async () => hoist.customerRecord),
    update: vi.fn(),
    count: vi.fn(async () => 0),
    findAll: vi.fn(async () => []),
  },
  ShopMembershipTier: {
    // 服务按 level DESC 查询（取满足门槛的最高级）；mock 按此约定返回
    findAll: vi.fn(async () => [...hoist.tiers].sort((a, b) => b.level - a.level)),
    findOne: vi.fn(async (args: { where: { id?: number } }) => hoist.tiers.find((t) => t.id === args.where.id) ?? null),
  },
  ShopPointsLog: {
    findOne: vi.fn(async () => null),
    create: vi.fn(async (rec: Record<string, unknown>) => { hoist.pointsLogs.push(rec) }),
    findAndCountAll: vi.fn(),
    count: vi.fn(),
    findAll: vi.fn(async () => []),
  },
}))

vi.mock('../config/database.js', () => ({
  default: {
    transaction: vi.fn(async (fn: (t: unknown) => Promise<unknown>) => fn({ LOCK: { UPDATE: 'UPDATE' } })),
  },
}))

vi.mock('../models/Setting.js', () => ({
  default: {
    findOne: vi.fn(async () => null),
    findOrCreate: vi.fn(async () => [{ update: vi.fn(async () => undefined) }]),
  },
}))

vi.mock('../middleware/errorHandler.js', () => ({
  AppError: class AppError extends Error {
    constructor(public status: number, message: string) { super(message) }
  },
}))

import * as membershipService from '../modules/shop/services/membershipService.js'
import { ShopCustomer, ShopMembershipTier, ShopPointsLog } from '../modules/shop/models/index.js'
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
    expect(view.stats.spendAmount).toBe(1200)
    // 成长值 1200 已满足白银 1000，但当前挂 tier 1（普通）；nextTier 取第一个未达门槛（黄金 5000）
    expect(view.nextTier?.name).toBe('黄金会员')
    expect(view.nextTier?.remaining).toBe(3800)
    expect(view.progress.spend).toBeGreaterThan(0)
  })

  it('awardPointsForOrder：1 元=1 积分；成长值累计；等级只升不降', async () => {
    const rec = hoist.customerRecord
    rec.membershipTierId = 1
    rec.points = 0
    rec.growthValue = 900
    await membershipService.awardPointsForOrder(1, 501, 11, 15000) // 150 元
    expect(rec.points).toBe(150)
    expect(rec.growthValue).toBe(1050)
    expect(rec.orderCount).toBe(1)
    // 1050 >= 白银 1000 → 升白银
    expect(rec.membershipTierId).toBe(2)
    expect(hoist.pointsLogs).toHaveLength(2) // 负流水 + FIFO 批次
    expect(hoist.pointsLogs[0]).toMatchObject({ change: 150, balanceAfter: 150, reason: 'order_captured', orderId: 501 })
    expect(hoist.pointsLogs[1]).toMatchObject({ change: 150, reason: 'order_captured_batch', remaining: 150 })
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

describe('meetsTier（三维度分级判定）', () => {
  const base = { loginCount: 0, spendAmount: 0, orderCount: 0 }
  it('any 策略：任一有效维度达标即达标', () => {
    const tier = { growthThreshold: 1000, loginFrequency: 5, orderCountThreshold: 3, matchStrategy: 'any' }
    expect(membershipService.meetsTier(tier, { ...base, spendAmount: 1000 })).toBe(true)
    expect(membershipService.meetsTier(tier, { ...base, loginCount: 5 })).toBe(true)
    expect(membershipService.meetsTier(tier, { ...base, orderCount: 3 })).toBe(true)
    expect(membershipService.meetsTier(tier, { ...base, spendAmount: 999, loginCount: 4, orderCount: 2 })).toBe(false)
  })
  it('all 策略：全部有效维度达标才达标', () => {
    const tier = { growthThreshold: 1000, loginFrequency: 5, orderCountThreshold: 3, matchStrategy: 'all' }
    expect(membershipService.meetsTier(tier, { spendAmount: 1000, loginCount: 5, orderCount: 3 })).toBe(true)
    expect(membershipService.meetsTier(tier, { spendAmount: 1000, loginCount: 5, orderCount: 2 })).toBe(false)
  })
  it('0 门槛=不设限跳过；全不设限=达标（普通会员）', () => {
    const tier = { growthThreshold: 0, loginFrequency: 0, orderCountThreshold: 0, matchStrategy: 'any' }
    expect(membershipService.meetsTier(tier, base)).toBe(true)
    const partial = { growthThreshold: 1000, loginFrequency: 0, orderCountThreshold: 0, matchStrategy: 'any' }
    expect(membershipService.meetsTier(partial, { ...base, spendAmount: 1000 })).toBe(true)
    expect(membershipService.meetsTier(partial, base)).toBe(false)
  })
  it('any 策略下 0 门槛维度不会让人越级（原 bug 回归）', () => {
    const gold = { growthThreshold: 5000, loginFrequency: 0, orderCountThreshold: 0, matchStrategy: 'any' }
    expect(membershipService.meetsTier(gold, { ...base, loginCount: 999 })).toBe(false)
  })
})

describe('membershipTier CRUD（后台自定义门槛）', () => {
  beforeEach(() => {
    vi.mocked(ShopMembershipTier.findOne).mockResolvedValue(null)
  })

  it('createTier：level 重复拒绝', async () => {
    vi.mocked(ShopMembershipTier.findOne).mockResolvedValueOnce({ id: 9, level: 2 } as never)
    await expect(
      membershipService.createTier(1, { name: 'X', level: 2, growthThreshold: 0, loginFrequency: 0, orderCountThreshold: 0, discountPct: 0, matchStrategy: 'any' }),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('createTier：负门槛拒绝', async () => {
    await expect(
      membershipService.createTier(1, { name: 'X', level: 5, growthThreshold: -1, loginFrequency: 0, orderCountThreshold: 0, discountPct: 0, matchStrategy: 'any' }),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('createTier：非法策略拒绝', async () => {
    await expect(
      membershipService.createTier(1, { name: 'X', level: 5, growthThreshold: 0, loginFrequency: 0, orderCountThreshold: 0, discountPct: 0, matchStrategy: 'both' }),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('deleteTier：有顾客挂级拒绝', async () => {
    vi.mocked(ShopCustomer.count).mockResolvedValueOnce(3 as never)
    vi.mocked(ShopMembershipTier.findOne).mockResolvedValueOnce({ id: 2, destroy: vi.fn() } as never)
    await expect(membershipService.deleteTier(1, 2)).rejects.toMatchObject({ status: 400 })
  })

  it('deleteTier：无顾客挂级可删', async () => {
    vi.mocked(ShopCustomer.count).mockResolvedValueOnce(0 as never)
    const destroy = vi.fn(async () => undefined)
    vi.mocked(ShopMembershipTier.findOne).mockResolvedValueOnce({ id: 2, destroy } as never)
    await membershipService.deleteTier(1, 2)
    expect(destroy).toHaveBeenCalled()
  })
})

describe('recalculateAllTiers（批量重算）', () => {
  it('按三维度重算并只升不降；返回 scanned/upgraded', async () => {
    const recs = [
      { id: 1, membershipTierId: 1, loginCount: 0, growthValue: 1000, orderCount: 0, update: vi.fn(async function (this: Record<string, unknown>, p: Record<string, unknown>) { Object.assign(this, p) }) },
      { id: 2, membershipTierId: 3, loginCount: 0, growthValue: 0, orderCount: 0, update: vi.fn(async function (this: Record<string, unknown>, p: Record<string, unknown>) { Object.assign(this, p) }) },
      { id: 3, membershipTierId: 1, loginCount: 0, growthValue: 0, orderCount: 0, update: vi.fn(async function (this: Record<string, unknown>, p: Record<string, unknown>) { Object.assign(this, p) }) },
    ]
    vi.mocked(ShopCustomer.findAll).mockResolvedValueOnce(recs as never).mockResolvedValueOnce([] as never)
    const out = await membershipService.recalculateAllTiers(1)
    expect(out.scanned).toBe(3)
    // 顾客1：spend 1000 → 白银(2) 升级；顾客2：已在黄金(3) 只升不降不动；顾客3：全 0 → 普通(1) 不变
    expect(out.upgraded).toBe(1)
    expect(recs[0].membershipTierId).toBe(2)
    expect(recs[1].update).not.toHaveBeenCalled()
    expect(recs[2].update).not.toHaveBeenCalled()
  })
})

describe('redeemPointsForOrder（积分抵扣落账）', () => {
  it('captured 扣分：写负流水 + 余额扣减（FIFO 消费批次）', async () => {
    const rec = hoist.customerRecord
    rec.points = 500
    vi.mocked(ShopPointsLog.findOne).mockResolvedValue(null)
    const batch = { id: 1, remaining: 500, update: vi.fn(async function (this: Record<string, unknown>, p: Record<string, unknown>) { Object.assign(this, p) }) }
    vi.mocked(ShopPointsLog.findAll).mockResolvedValueOnce([batch] as never)
    await membershipService.redeemPointsForOrder(1, 601, 11, 300)
    expect(rec.points).toBe(200)
    expect(batch.remaining).toBe(200)
    expect(hoist.pointsLogs.length).toBeGreaterThan(0)
  })

  it('幂等：同订单重复落账跳过', async () => {
    const rec = hoist.customerRecord
    rec.points = 500
    vi.mocked(ShopPointsLog.findOne).mockResolvedValue({ id: 1 } as never)
    await membershipService.redeemPointsForOrder(1, 602, 11, 300)
    expect(rec.points).toBe(500)
  })

  it('钳制：扣减不超过余额与批次', async () => {
    const rec = hoist.customerRecord
    rec.points = 100
    vi.mocked(ShopPointsLog.findOne).mockResolvedValue(null)
    const batch = { id: 2, remaining: 100, update: vi.fn(async function (this: Record<string, unknown>, p: Record<string, unknown>) { Object.assign(this, p) }) }
    vi.mocked(ShopPointsLog.findAll).mockResolvedValueOnce([batch] as never)
    await membershipService.redeemPointsForOrder(1, 603, 11, 999)
    expect(rec.points).toBe(0)
    expect(batch.remaining).toBe(0)
  })
})

describe('refundClawback（退款积分回补）', () => {
  function setupLogs(earned: number, redeemed: number, points = 500): void {
    vi.mocked(ShopPointsLog.findOne).mockImplementation(async (args: { where: { reason?: string } }) => {
      if (args.where.reason === 'order_captured') return { change: earned } as never
      if (args.where.reason === 'order_redeem') return redeemed > 0 ? { change: -redeemed } as never : null
      return null
    })
    hoist.customerRecord.points = points
    // FIFO 批次（回扣消费用；remaining=earned）
    const batch = { id: 99, remaining: earned, update: vi.fn(async function (this: Record<string, unknown>, p: Record<string, unknown>) { Object.assign(this, p) }) }
    vi.mocked(ShopPointsLog.findAll).mockResolvedValue([batch] as never)
  }

  it('全额退款：回扣全部发分 + 回补全部抵扣', async () => {
    setupLogs(130, 300)
    await membershipService.refundClawback(1, 701, 11, 'RF001', 1)
    const reasons = hoist.pointsLogs.map((l) => l.reason)
    expect(reasons).toContain('refund_clawback_RRF001')
    expect(reasons).toContain('refund_redeemback_RRF001')
    expect(hoist.pointsLogs.find((l) => l.reason === 'refund_clawback_RRF001')?.change).toBe(-130)
    expect(hoist.pointsLogs.find((l) => l.reason === 'refund_redeemback_RRF001')?.change).toBe(300)
  })

  it('部分退款 50%：按比例回补', async () => {
    setupLogs(130, 300)
    hoist.pointsLogs.length = 0
    await membershipService.refundClawback(1, 702, 11, 'RF002', 0.5)
    expect(hoist.pointsLogs.find((l) => l.reason === 'refund_clawback_RRF002')?.change).toBe(-65)
    expect(hoist.pointsLogs.find((l) => l.reason === 'refund_redeemback_RRF002')?.change).toBe(150)
  })

  it('回扣钳制：余额不足时不扣为负', async () => {
    setupLogs(130, 0)
    hoist.customerRecord.points = 10
    hoist.pointsLogs.length = 0
    await membershipService.refundClawback(1, 703, 11, 'RF003', 1)
    expect(hoist.pointsLogs.find((l) => l.reason === 'refund_clawback_RRF003')?.change).toBe(-10)
    expect(hoist.customerRecord.points).toBe(0)
  })

  it('比例 <=0 直接返回', async () => {
    setupLogs(130, 0)
    hoist.pointsLogs.length = 0
    await membershipService.refundClawback(1, 704, 11, 'RF004', 0)
    expect(hoist.pointsLogs).toHaveLength(0)
  })
})

describe('pointsExpiry（积分有效期 FIFO）', () => {
  it('getPointsExpiryDays：默认 0（不过期）', async () => {
    expect(await membershipService.getPointsExpiryDays(1)).toBe(0)
  })

  it('setPointsExpiryDays：非法值拒绝', async () => {
    await expect(membershipService.setPointsExpiryDays(1, -1)).rejects.toMatchObject({ status: 400 })
    await expect(membershipService.setPointsExpiryDays(1, 1.5)).rejects.toMatchObject({ status: 400 })
  })

  it('expireExpiredPoints：无到期批次返回 0', async () => {
    vi.mocked(ShopPointsLog.findAll).mockResolvedValueOnce([] as never)
    const r = await membershipService.expireExpiredPoints(1)
    expect(r).toEqual({ expiredCustomers: 0, expiredPoints: 0 })
  })

  it('expireExpiredPoints：到期批次作废（余额钳制 + 冲销流水）', async () => {
    const batch = { id: 7, customerId: 11, remaining: 100, update: vi.fn(async function (this: Record<string, unknown>, p: Record<string, unknown>) { Object.assign(this, p) }) }
    vi.mocked(ShopPointsLog.findAll).mockResolvedValueOnce([batch] as never).mockResolvedValueOnce([batch] as never)
    const rec = hoist.customerRecord
    rec.points = 60 // 余额 60 < 到期 100 → 钳到 60
    hoist.pointsLogs.length = 0
    const r = await membershipService.expireExpiredPoints(1)
    expect(r.expiredPoints).toBe(60)
    expect(rec.points).toBe(0)
    expect(batch.remaining).toBe(40) // 100-60
    expect(hoist.pointsLogs.some((l) => String(l.reason).startsWith('expired_'))).toBe(true)
  })
})
