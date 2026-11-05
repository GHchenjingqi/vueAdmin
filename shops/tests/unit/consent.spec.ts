import { describe, expect, it } from 'vitest'
import { grantConsent, readConsent, revokeConsent } from '../../shared/analytics/consent'

/** P4-T11 同意管理单测（node 环境：无 window/localStorage，验证状态机与降级路径） */
describe('consent state machine (P4-T11)', () => {
  it('returns null when never decided', () => {
    expect(readConsent()).toBeNull()
  })

  it('grant returns decided state with timestamp', () => {
    const s = grantConsent({ analytics: true, marketing: true })
    expect(s.analytics).toBe(true)
    expect(s.decidedAt).toBeTruthy()
  })

  it('revoke flips all categories to false', () => {
    const s = revokeConsent()
    expect(s.analytics).toBe(false)
    expect(s.marketing).toBe(false)
  })
})
