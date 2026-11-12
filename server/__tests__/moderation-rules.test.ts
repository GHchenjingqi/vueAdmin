// @vitest-environment node
/**
 * 审核风险规则单测（纯函数，不连 DB）
 *
 * 覆盖：低风险自动批、各风险因子累加与可解释原因、阈值边界、
 * 环境变量非法值回退、RMA 只分级不产生自动批准结论。
 */
import { describe, it, expect } from 'vitest'
import {
  assessReviewRisk,
  assessRmaRisk,
  loadModerationConfig,
  DEFAULT_MODERATION_CONFIG,
  type ReviewRiskInput,
} from '../modules/shop/services/moderationRuleService.js'

const safe: ReviewRiskInput = {
  rating: 5,
  title: '很好用',
  content: '质量不错，物流也快，下次还会再来购买。',
  images: null,
  verified: true,
  isAnonymous: false,
}

const assess = (patch: Partial<ReviewRiskInput> = {}, config = DEFAULT_MODERATION_CONFIG) => assessReviewRisk({ ...safe, ...patch }, config)

describe('配置读取', () => {
  it('无环境变量时使用保守默认值', () => {
    expect(loadModerationConfig({})).toEqual(DEFAULT_MODERATION_CONFIG)
  })

  it('合法值生效，非法 / 越界 / 非数字一律回退默认', () => {
    expect(loadModerationConfig({ MODERATION_SCORE_THRESHOLD: '10', MODERATION_MAX_APPROVES: '3', MODERATION_RMA_HIGH_RISK_CENTS: '999' })).toEqual({
      scoreThreshold: 10,
      maxApprovesPerTenant: 3,
      rmaHighRiskCents: 999,
    })
    expect(loadModerationConfig({ MODERATION_SCORE_THRESHOLD: '0' }).scoreThreshold).toBe(DEFAULT_MODERATION_CONFIG.scoreThreshold)
    expect(loadModerationConfig({ MODERATION_SCORE_THRESHOLD: '101' }).scoreThreshold).toBe(DEFAULT_MODERATION_CONFIG.scoreThreshold)
    expect(loadModerationConfig({ MODERATION_MAX_APPROVES: 'abc' }).maxApprovesPerTenant).toBe(DEFAULT_MODERATION_CONFIG.maxApprovesPerTenant)
    expect(loadModerationConfig({ MODERATION_RMA_HIGH_RISK_CENTS: '-1' }).rmaHighRiskCents).toBe(DEFAULT_MODERATION_CONFIG.rmaHighRiskCents)
  })
})

describe('评价风险评分', () => {
  it('已购验证 + 高评分 + 正常内容 → 0 分自动批准', () => {
    const r = assess()
    expect(r).toEqual({ score: 0, reasons: [], hardBlocked: false, decision: 'auto_approve' })
  })

  it('未通过已购验证 → 硬阻断转人工', () => {
    const r = assess({ verified: false })
    expect(r.score).toBe(40)
    expect(r.hardBlocked).toBe(true)
    expect(r.decision).toBe('manual')
    expect(r.reasons).toContain('未通过已购验证')
  })

  it('1~2 星差评硬阻断，3 星中评仅加 10 分', () => {
    expect(assess({ rating: 1 })).toMatchObject({ score: 40, hardBlocked: true, decision: 'manual' })
    expect(assess({ rating: 2 }).score).toBe(40)
    expect(assess({ rating: 3 })).toMatchObject({ score: 10, decision: 'auto_approve' })
  })

  it.each([
    ['外链', '详情见 https://example.com/promo'],
    ['www 域名', '搜 www.example.com 有优惠'],
    ['邮箱', '联系 me@example.com 领取'],
    ['手机号', '加 13800138000 咨询'],
    ['连续数字', '号 123456 记得加'],
    ['微信引流', '加微信私聊有返现'],
    ['英文引流', 'contact us on whatsapp'],
  ])('含 %s → 引流命中转人工', (_label, content) => {
    const r = assess({ content })
    expect(r.reasons).toContain('含外链/联系方式/引流词')
    expect(r.decision).toBe('manual')
  })

  it.each(['假货', '骗子', '投诉', '律师', '曝光', '维权'])('争议词「%s」→ 25 分并转人工', (word) => {
    const r = assess({ content: `这次购物体验很差，${word}，需要给个说法。` })
    expect(r.reasons).toContain('含争议或投诉词')
    expect(r.decision).toBe('manual')
  })

  it('标题同样参与检测（不能靠把引流词放进标题绕过）', () => {
    const r = assess({ title: 'https://spam.example.com', content: '质量不错，物流也快，下次还会再来购买。' })
    expect(r.decision).toBe('manual')
  })

  it('含图片加 15 分（单独仍可自动批），叠加其它因子则转人工', () => {
    expect(assess({ images: ['https://cdn.example.com/a.jpg'] })).toMatchObject({ score: 15, decision: 'auto_approve' })
    expect(assess({ images: ['a.jpg'], isAnonymous: true, rating: 3 })).toMatchObject({ decision: 'manual' })
  })

  it('内容为空或过短为硬阻断，内容过长按软评分转人工', () => {
    const short = assess({ title: null, content: '好' })
    expect(short).toMatchObject({ hardBlocked: true, decision: 'manual' })
    expect(short.reasons).toContain('内容为空或过短')
    const long = assess({ content: '好'.repeat(501) })
    expect(long).toMatchObject({ hardBlocked: false, decision: 'manual' })
    expect(long.reasons).toContain('内容过长')
  })

  it('匿名加 5 分且单独不影响自动批', () => {
    expect(assess({ isAnonymous: true })).toMatchObject({ score: 5, decision: 'auto_approve' })
  })

  it('分数恰好等于阈值时按高风险处理（严格小于才自动批）', () => {
    const config = { ...DEFAULT_MODERATION_CONFIG, scoreThreshold: 40 }
    expect(assess({ images: ['a.jpg'], verified: true, content: '质量不错，物流也快，下次还会再来购买。' }, config)).toMatchObject({
      score: 15,
      decision: 'auto_approve',
    })
    expect(assess({ images: ['a.jpg'], isAnonymous: true }, config)).toMatchObject({ score: 20, decision: 'auto_approve' })
  })

  it('阈值误配到最高（100）时硬阻断仍不放行，fail-closed', () => {
    const config = { ...DEFAULT_MODERATION_CONFIG, scoreThreshold: 100 }
    for (const patch of [{ verified: false }, { rating: 1 }, { content: '加微信返现私聊' }, { content: '假货，准备投诉' }, { content: '' }]) {
      expect(assess(patch, config)).toMatchObject({ hardBlocked: true, decision: 'manual' })
    }
    expect(assess({}, config).decision).toBe('auto_approve')
  })

  it('多因子累加，原因列表完整可解释', () => {
    const r = assess({ verified: false, rating: 1, content: '垃圾，假货，加微信 13800138000', images: ['a.jpg'], isAnonymous: true })
    expect(r.score).toBeGreaterThanOrEqual(40 + 40 + 40 + 40 + 15 + 5)
    expect(r.reasons.length).toBeGreaterThanOrEqual(6)
    expect(r.hardBlocked).toBe(true)
    expect(r.decision).toBe('manual')
  })

  it('空标题 / 空内容 / 脏评分不抛错且判为人工', () => {
    expect(() => assess({ title: null, content: null })).not.toThrow()
    expect(assess({ title: null, content: null }).decision).toBe('manual')
    expect(assess({ rating: Number.NaN }).decision).toBe('manual')
  })
})

describe('RMA 风险分级（只分级，不改状态）', () => {
  const low = { refundAmountCents: 1200, reason: '尺寸不合适', previousRmaCount: 1 }

  it('小额、首次、无争议 → 非高风险', () => {
    expect(assessRmaRisk(low)).toEqual({ highRisk: false, reasons: [] })
  })

  it('达到金额阈值 → 高风险', () => {
    const r = assessRmaRisk({ ...low, refundAmountCents: 50000 })
    expect(r.highRisk).toBe(true)
    expect(r.reasons[0]).toContain('高风险阈值')
  })

  it('同订单多次售后 → 高风险', () => {
    expect(assessRmaRisk({ ...low, previousRmaCount: 2 }).highRisk).toBe(true)
  })

  it('售后原因含争议词 → 高风险', () => {
    expect(assessRmaRisk({ ...low, reason: '收到假货，准备投诉' }).highRisk).toBe(true)
  })

  it('金额为 0 时不因阈值 0 被误判；脏数据不抛错', () => {
    const config = { ...DEFAULT_MODERATION_CONFIG, rmaHighRiskCents: 0 }
    expect(assessRmaRisk({ ...low, refundAmountCents: 0 }, config).highRisk).toBe(false)
    expect(() => assessRmaRisk({ refundAmountCents: Number.NaN, reason: null, previousRmaCount: 0 })).not.toThrow()
  })

  it('返回值不含任何自动批准结论', () => {
    expect(Object.keys(assessRmaRisk({ ...low, refundAmountCents: 999999 }))).toEqual(['highRisk', 'reasons'])
  })
})
