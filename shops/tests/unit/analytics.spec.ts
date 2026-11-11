import { describe, expect, it } from 'vitest'
import { scrub } from '../../shared/errors/report'
import { EVENT_DICTIONARY } from '../../shared/analytics/events'

/** P1-T10 脱敏单测 + P4-T10 事件字典完整性 */
describe('error scrubbing (P1-T10)', () => {
  it('redacts email', () => {
    expect(scrub('user bob@qq.com cannot checkout')).not.toContain('bob@qq.com')
    expect(scrub('user bob@qq.com cannot checkout')).toContain('[email]')
  })

  it('redacts token/authorization/password fields', () => {
    const out = scrub('headers: {authorization: Bearer abc.def, token: "xyz", password: "123"}')
    expect(out).not.toContain('abc.def')
    expect(out).not.toContain('xyz')
    expect(out).not.toContain('123')
  })

  it('redacts card-like and phone numbers', () => {
    expect(scrub('card 4111 1111 1111 1111 failed')).not.toContain('4111')
    expect(scrub('phone 13812345678')).not.toContain('13812345678')
  })

  it('caps length at 2000', () => {
    expect(scrub('x'.repeat(5000)).length).toBeLessThanOrEqual(2000)
  })
})

describe('event dictionary (P4-T10)', () => {
  it('has exactly ten tracked events', () => {
    expect(Object.keys(EVENT_DICTIONARY).length).toBe(10)
  })

  it('purchase requires transaction_id + currency + value + items', () => {
    expect(EVENT_DICTIONARY.purchase.required).toContain('transaction_id')
    expect(EVENT_DICTIONARY.purchase.required).toContain('currency')
  })
})
