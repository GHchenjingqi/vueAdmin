// @vitest-environment node
/**
 * 审核规则化批处理单测（编排层，全 mock，不连 DB）
 *
 * 说明：feature flag 的持久化是 Setting('feature.flags') 全量 JSON 读改写，
 * 多测试文件并发时会互相覆盖，因此这里用 vi.mock 控制开关；真实开关路径由
 * featureFlags.test.ts 覆盖，真实 DB 的 CAS / 审计留痕另在运行时隔离验证。
 *
 * 覆盖：双开关零副作用、低风险自动批 + 审计留痕、高风险转人工、CAS 并发让位、
 * 单租户上限、租户枚举与定向、RMA 只统计不改状态、单租户失败隔离。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { isFeatureEnabled } from '../modules/featureflags/featureFlags.js'
import { ShopReview, ShopRmaRequest } from '../modules/shop/models/index.js'
import * as auditLogService from '../modules/shop/services/auditLogService.js'
import { notifyAsync } from '../services/notificationDispatcher.js'

vi.mock('../modules/featureflags/featureFlags.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../modules/featureflags/featureFlags.js')>()
  return { ...actual, isFeatureEnabled: vi.fn(async () => false) }
})
vi.mock('../modules/shop/models/index.js', () => ({
  ShopReview: { findAll: vi.fn(), update: vi.fn() },
  ShopRmaRequest: { findAll: vi.fn(), update: vi.fn() },
}))
vi.mock('../modules/shop/services/auditLogService.js', () => ({ record: vi.fn(async () => {}) }))
vi.mock('../services/notificationDispatcher.js', () => ({ notifyAsync: vi.fn() }))
vi.mock('../utils/fileLogger.js', () => ({ logInfo: vi.fn() }))

import { runAutoModeration, MODERATION_FLAG_KEY } from '../modules/shop/services/autoModerationService.js'

const flagMock = vi.mocked(isFeatureEnabled)
const reviewFindAll = vi.mocked(ShopReview.findAll)
const reviewUpdate = vi.mocked(ShopReview.update)
const rmaFindAll = vi.mocked(ShopRmaRequest.findAll)
const rmaUpdate = vi.mocked(ShopRmaRequest.update)
const auditRecord = vi.mocked(auditLogService.record)
const notify = vi.mocked(notifyAsync)

const safeReview = (id: number, patch: Record<string, unknown> = {}) => ({
  id,
  rating: 5,
  title: '很好用',
  content: '质量不错，物流也快，下次还会再来购买。',
  images: null,
  verified: true,
  isAnonymous: false,
  ...patch,
})

/** 让 findAll 按调用参数分流：raw 查询返回租户列表，其余返回对应实体 */
function wire(reviews: unknown[], rmas: unknown[] = [], tenantRows: unknown[] = [{ tenantId: 987777 }]) {
  reviewFindAll.mockImplementation(async (options: unknown) => {
    const o = options as { raw?: boolean }
    return (o?.raw ? tenantRows : reviews) as never
  })
  rmaFindAll.mockResolvedValue(rmas as never)
}

const origEnv = { ...process.env }

beforeEach(() => {
  vi.clearAllMocks()
  flagMock.mockResolvedValue(false)
  reviewUpdate.mockResolvedValue([1] as never)
  rmaFindAll.mockResolvedValue([] as never)
  reviewFindAll.mockResolvedValue([] as never)
  process.env = { ...origEnv }
  delete process.env.MODERATION_MAX_APPROVES
  delete process.env.MODERATION_SCORE_THRESHOLD
  delete process.env.MODERATION_RMA_HIGH_RISK_CENTS
})

afterEach(() => {
  process.env = { ...origEnv }
})

describe('双开关与零副作用', () => {
  it('flag 关闭时直接返回 enabled=false，不查询业务表、不写审计、不发通知', async () => {
    const r = await runAutoModeration()
    expect(r.enabled).toBe(false)
    expect(r.autoApproved).toBe(0)
    expect(flagMock).toHaveBeenCalledWith(MODERATION_FLAG_KEY)
    expect(reviewFindAll).not.toHaveBeenCalled()
    expect(rmaFindAll).not.toHaveBeenCalled()
    expect(reviewUpdate).not.toHaveBeenCalled()
    expect(auditRecord).not.toHaveBeenCalled()
    expect(notify).not.toHaveBeenCalled()
  })
})

describe('低风险自动批 / 高风险转人工', () => {
  beforeEach(() => flagMock.mockResolvedValue(true))

  it('低风险评价 pending → approved，并写系统审计日志（含评分与规则名）', async () => {
    wire([safeReview(11)])
    const r = await runAutoModeration([987777])

    expect(r).toMatchObject({ enabled: true, tenants: 1, scannedReviews: 1, autoApproved: 1, manualReviews: 0 })
    expect(reviewUpdate).toHaveBeenCalledWith({ status: 'approved' }, { where: { tenantId: 987777, id: 11, status: 'pending' } })
    expect(auditRecord).toHaveBeenCalledTimes(1)
    expect(auditRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 987777,
        actorType: 'system',
        action: 'review.auto_approved',
        entityType: 'config',
        entityId: 11,
        beforeState: { status: 'pending' },
        afterState: expect.objectContaining({ status: 'approved', score: 0, rule: 'low_risk_auto_approve' }),
      }),
    )
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ event: 'moderation.auto_approved' }))
  })

  it('高风险评价（未验证 + 差评 + 引流词）保持 pending，不写审计', async () => {
    wire([safeReview(12, { verified: false, rating: 1, content: '假货，加微信 13800138000' })])
    const r = await runAutoModeration([987777])

    expect(r).toMatchObject({ autoApproved: 0, manualReviews: 1, scannedReviews: 1 })
    expect(reviewUpdate).not.toHaveBeenCalled()
    expect(auditRecord).not.toHaveBeenCalled()
    expect(notify).not.toHaveBeenCalledWith(expect.objectContaining({ event: 'moderation.auto_approved' }))
  })

  it('CAS 影响 0 行（人工并发已审）时不计数、不留痕', async () => {
    reviewUpdate.mockResolvedValue([0] as never)
    wire([safeReview(13)])
    const r = await runAutoModeration([987777])

    expect(r.autoApproved).toBe(0)
    expect(auditRecord).not.toHaveBeenCalled()
  })

  it('混合批次：只批低风险，其余转人工', async () => {
    wire([safeReview(14), safeReview(15, { verified: false }), safeReview(16, { rating: 1 })])
    const r = await runAutoModeration([987777])
    expect(r).toMatchObject({ scannedReviews: 3, autoApproved: 1, manualReviews: 2 })
    expect(reviewUpdate).toHaveBeenCalledTimes(1)
  })

  it('单租户单轮上限生效：超过上限的低风险内容也留给人工', async () => {
    process.env.MODERATION_MAX_APPROVES = '1'
    wire([safeReview(17), safeReview(18), safeReview(19)])
    const r = await runAutoModeration([987777])
    expect(r).toMatchObject({ autoApproved: 1, manualReviews: 2 })
    expect(reviewUpdate).toHaveBeenCalledTimes(1)
  })

  it('阈值可通过环境变量收紧，越界值回退默认', async () => {
    process.env.MODERATION_SCORE_THRESHOLD = '5'
    wire([safeReview(20, { isAnonymous: true })])
    expect((await runAutoModeration([987777])).manualReviews).toBe(1)

    process.env.MODERATION_SCORE_THRESHOLD = '999'
    wire([safeReview(21, { isAnonymous: true })])
    expect((await runAutoModeration([987777])).autoApproved).toBe(1)
  })
})

describe('租户范围与失败隔离', () => {
  beforeEach(() => flagMock.mockResolvedValue(true))

  it('不传 tenantIds 时枚举全部含待审评价的租户并去重', async () => {
    wire([safeReview(22)], [], [{ tenantId: 987777 }, { tenantId: 987778 }, { tenantId: '987777' }])
    const r = await runAutoModeration()
    expect(r.tenants).toBe(2)
    expect(reviewUpdate).toHaveBeenCalledTimes(2)
  })

  it('传入 tenantIds 时只处理指定租户，且自动去重', async () => {
    wire([safeReview(23)], [], [{ tenantId: 1 }])
    const r = await runAutoModeration([987777, 987777])
    expect(r.tenants).toBe(1)
    expect(reviewFindAll).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tenantId: 987777 }) }))
    expect(reviewFindAll).not.toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tenantId: 1 }) }))
  })

  it('单租户异常被隔离，其它租户继续，并发失败事件', async () => {
    let call = 0
    reviewFindAll.mockImplementation(async (options: unknown) => {
      const o = options as { raw?: boolean }
      if (o?.raw) return [{ tenantId: 987777 }, { tenantId: 987778 }] as never
      call++
      if (call === 1) throw new Error('simulated tenant failure')
      return [safeReview(24)] as unknown as never
    })
    rmaFindAll.mockResolvedValue([] as never)

    const r = await runAutoModeration()
    expect(r).toMatchObject({ tenants: 2, failed: 1, autoApproved: 1 })
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ event: 'moderation.scan_failed' }))
  })
})

describe('RMA / 退款边界：只统计，不改状态', () => {
  beforeEach(() => flagMock.mockResolvedValue(true))

  it('高风险售后命中金额 / 多次售后 / 争议词规则并提醒人工，但状态零变更', async () => {
    wire(
      [],
      [
        { id: 1, orderId: 9001, refundAmountCents: 60000, reason: 'size mismatch' },
        { id: 2, orderId: 9002, refundAmountCents: 1000, reason: 'normal' },
        { id: 3, orderId: 9002, refundAmountCents: 1000, reason: 'normal' },
        { id: 4, orderId: 9003, refundAmountCents: 1000, reason: '收到假货，准备投诉' },
      ],
    )
    const r = await runAutoModeration([987777])

    expect(r).toMatchObject({ scannedRmas: 4, highRiskRmas: 4 })
    expect(rmaUpdate).not.toHaveBeenCalled()
    expect(reviewUpdate).not.toHaveBeenCalled()
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ event: 'moderation.high_risk_rma', cooldownMs: 0 }))
  })

  it('低风险售后不产生提醒，也不写任何审计', async () => {
    wire([], [{ id: 5, orderId: 9004, refundAmountCents: 1200, reason: '尺寸不合适' }])
    const r = await runAutoModeration([987777])
    expect(r).toMatchObject({ scannedRmas: 1, highRiskRmas: 0 })
    expect(notify).not.toHaveBeenCalled()
    expect(auditRecord).not.toHaveBeenCalled()
  })

  it('金额阈值可通过环境变量调整', async () => {
    process.env.MODERATION_RMA_HIGH_RISK_CENTS = '1000'
    wire([], [{ id: 6, orderId: 9005, refundAmountCents: 1000, reason: 'normal' }])
    expect((await runAutoModeration([987777])).highRiskRmas).toBe(1)
  })
})
