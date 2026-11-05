/**
 * P5-T02 币种治理前端契约测试
 *
 * 重点：后端 updateCurrencySchema 的两个二次确认字段是 z.literal(true)，
 * 前端漏传会直接 400 CONFIRMATION_REQUIRED；effectiveAt 必须是 z.string().datetime()
 * 可接受的 ISO 8601 UTC 字符串。这里锁死构造器的行为。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGet = vi.fn()
const mockPost = vi.fn()
const mockPut = vi.fn()

vi.mock('@/utils/request', () => ({
  default: {
    get: mockGet,
    post: mockPost,
    put: mockPut,
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
})

const baseConfig = {
  code: 'usd',
  symbol: '$',
  decimalDigits: 2,
  symbolPosition: 'before' as const,
  thousandsSeparator: ',',
  decimalSeparator: '.',
  locale: 'en-US',
}

describe('buildCurrencyUpdatePayload', () => {
  it('always attaches both literal confirmations', async () => {
    const { buildCurrencyUpdatePayload } = await import('@/api/shop')
    const payload = buildCurrencyUpdatePayload(baseConfig)
    expect(payload.confirmImpact).toBe(true)
    expect(payload.ackNoConversion).toBe(true)
  })

  it('normalizes code to uppercase and trims whitespace', async () => {
    const { buildCurrencyUpdatePayload } = await import('@/api/shop')
    expect(buildCurrencyUpdatePayload({ ...baseConfig, code: ' cny ' }).config.code).toBe('CNY')
  })

  it('omits effectiveAt when not scheduled', async () => {
    const { buildCurrencyUpdatePayload } = await import('@/api/shop')
    expect(buildCurrencyUpdatePayload(baseConfig)).not.toHaveProperty('effectiveAt')
    expect(buildCurrencyUpdatePayload(baseConfig, null)).not.toHaveProperty('effectiveAt')
  })

  it('converts Date and local datetime string to ISO 8601 UTC', async () => {
    const { buildCurrencyUpdatePayload } = await import('@/api/shop')
    const d = new Date('2026-12-01T08:00:00.000Z')
    expect(buildCurrencyUpdatePayload(baseConfig, d).effectiveAt).toBe('2026-12-01T08:00:00.000Z')
    const fromString = buildCurrencyUpdatePayload(baseConfig, '2026-12-01T16:00:00').effectiveAt
    expect(fromString).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  })

  it('drops invalid datetime instead of sending a rejected payload', async () => {
    const { buildCurrencyUpdatePayload } = await import('@/api/shop')
    expect(buildCurrencyUpdatePayload(baseConfig, 'not-a-date')).not.toHaveProperty('effectiveAt')
  })

  it('does not mutate the caller config object', async () => {
    const { buildCurrencyUpdatePayload } = await import('@/api/shop')
    const input = { ...baseConfig }
    buildCurrencyUpdatePayload(input)
    expect(input.code).toBe('usd')
  })
})

describe('CURRENCY_PRESETS', () => {
  it('matches the backend ISO_META whitelist', async () => {
    const { CURRENCY_PRESETS } = await import('@/api/shop')
    expect(CURRENCY_PRESETS.map((p) => p.code)).toEqual(['USD', 'CNY', 'EUR', 'GBP', 'CAD', 'AUD'])
    for (const p of CURRENCY_PRESETS) {
      expect(p.code).toMatch(/^[A-Z]{3}$/)
      expect(p.symbol.length).toBeGreaterThan(0)
      expect(p.decimalDigits).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('currencyApi', () => {
  it('reads current + pending configuration', async () => {
    const { currencyApi } = await import('@/api/shop')
    currencyApi.get()
    expect(mockGet).toHaveBeenCalledWith('/shop/settings/currency')
  })

  it('reads the fail-closed active configuration', async () => {
    const { currencyApi } = await import('@/api/shop')
    currencyApi.active()
    expect(mockGet).toHaveBeenCalledWith('/shop/settings/currency/active')
  })

  it('PUTs the built payload (with confirmations) to /shop/settings/currency', async () => {
    const { currencyApi, buildCurrencyUpdatePayload } = await import('@/api/shop')
    const payload = buildCurrencyUpdatePayload(baseConfig)
    currencyApi.update(payload)
    expect(mockPut).toHaveBeenCalledWith('/shop/settings/currency', payload)
    expect(mockPut.mock.calls[0][1].confirmImpact).toBe(true)
  })

  it('rolls back by changeId', async () => {
    const { currencyApi } = await import('@/api/shop')
    currencyApi.rollback(42)
    expect(mockPost).toHaveBeenCalledWith('/shop/settings/currency/rollback', { changeId: 42 })
  })

  it('reads the audit chain', async () => {
    const { currencyApi } = await import('@/api/shop')
    currencyApi.changes()
    expect(mockGet).toHaveBeenCalledWith('/shop/config-changes')
  })
})
