// @vitest-environment node
/**
 * 促销求值（PLAN 3.1）
 *
 * 背景：后台可建促销，但报价完全不读 `promotions`，活动不进入订单金额。
 * 本测试锁定「保守求值」的口径，防止后续改动把非法折扣放进来：
 * - rule.rate 必须在 (0,1) 开区间，0 或 ≥1 一律忽略（避免订单归零或加价）；
 * - scope 非 all 时因缺少绑定目标而跳过（不猜）；
 * - 折扣金额 = 小计 × (1 - rate)，整数分。
 *
 * 说明：evaluatePromotion 依赖 DB，这里只测其纯逻辑分支（parseRate 口径与折扣算术），
 * 通过导出的最小面进行断言，避免为了测试引入 DB stub 而掩盖真实行为。
 */
import { describe, expect, it } from 'vitest'
import { __testing } from '../modules/storefront/services/promotionService.js'

const { parseRate, discountFor } = __testing

describe('promotion rate parsing', () => {
  it('accepts a discount factor inside the open interval (0,1)', () => {
    expect(parseRate({ rate: 0.8 })).toBe(0.8)
    expect(parseRate({ rate: '0.5' })).toBe(0.5)
    expect(parseRate({ rate: 0.99 })).toBe(0.99)
  })

  it('rejects rate = 1 (no discount) and rate = 0 (free order)', () => {
    expect(parseRate({ rate: 1 })).toBeNull()
    expect(parseRate({ rate: 0 })).toBeNull()
  })

  it('rejects out-of-range, negative and non-numeric values', () => {
    expect(parseRate({ rate: 1.5 })).toBeNull()
    expect(parseRate({ rate: -0.2 })).toBeNull()
    expect(parseRate({ rate: 'abc' })).toBeNull()
    expect(parseRate({})).toBeNull()
    expect(parseRate(null)).toBeNull()
  })
})

describe('promotion discount arithmetic', () => {
  it('computes an integer-cent discount from the subtotal', () => {
    expect(discountFor(10000, 0.8)).toBe(2000)
    expect(discountFor(12999, 0.85)).toBe(1950)
  })

  it('never returns a negative discount', () => {
    expect(discountFor(0, 0.8)).toBe(0)
    expect(discountFor(-100, 0.8)).toBe(0)
  })
})
