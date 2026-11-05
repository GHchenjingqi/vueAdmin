import { describe, expect, it } from 'vitest'
import { formatMoney } from '../../shared/currency/format'
import { DEFAULT_CURRENCY_CONFIG } from '../../shared/types/currency'

/** P1-T11 单测：全站唯一格式化入口；0/小数/千分位/负数（退款）覆盖 */
describe('formatMoney', () => {
  it('formats 0', () => {
    expect(formatMoney(0, DEFAULT_CURRENCY_CONFIG)).toBe('$0.00')
  })

  it('formats integer cents with thousands separator', () => {
    expect(formatMoney(129900, DEFAULT_CURRENCY_CONFIG)).toBe('$1,299.00')
  })

  it('formats fractional cents (rounding by Intl)', () => {
    expect(formatMoney(129950, DEFAULT_CURRENCY_CONFIG)).toBe('$1,299.50')
  })

  it('supports negative amounts (refund display)', () => {
    expect(formatMoney(-500, DEFAULT_CURRENCY_CONFIG)).toBe('-$5.00')
  })

  it('switches symbol & decimals with config (CNY example)', () => {
    const cny = { ...DEFAULT_CURRENCY_CONFIG, code: 'CNY', symbol: '¥', locale: 'zh-CN' }
    const out = formatMoney(129900, cny)
    expect(out).toContain('1,299.00')
    expect(out).not.toContain('$')
  })
})
