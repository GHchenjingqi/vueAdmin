import { describe, expect, it } from 'vitest'
import { parseAttribution } from '../../shared/analytics/attribution'
import { buildCapiPayload } from '../../shared/analytics/capi'

/**
 * 阶段 5 步骤 5/6 后端接口的前端接线单测（纯函数层）：
 * - 订单来源归因解析（UTM 五参 / landingPage / referrer / 裁剪 / 空值）
 * - CAPI 上报体（同意门控、会话 ID、幂等 eventId、purchase 参数保留）
 */
describe('order attribution parsing (step 6)', () => {
  it('parses all five UTM params plus landing page and referrer', () => {
    const out = parseAttribution(
      '?utm_source=google&utm_medium=cpc&utm_campaign=spring&utm_term=wig&utm_content=banner',
      'https://google.com/',
      '/products/lace-wig?utm_source=google',
    )
    expect(out).toEqual({
      utmSource: 'google',
      utmMedium: 'cpc',
      utmCampaign: 'spring',
      utmTerm: 'wig',
      utmContent: 'banner',
      landingPage: '/products/lace-wig?utm_source=google',
      referrer: 'https://google.com/',
    })
  })

  it('returns landing/referrer only when no UTM is present', () => {
    expect(parseAttribution('', 'https://example.com/', '/c/lace-wigs')).toEqual({
      landingPage: '/c/lace-wigs',
      referrer: 'https://example.com/',
    })
  })

  it('returns undefined when nothing usable is present', () => {
    expect(parseAttribution('', '', '')).toBeUndefined()
    expect(parseAttribution('?utm_source=%20%20', '', '')).toBeUndefined()
  })

  it('caps UTM values to backend schema limits', () => {
    const out = parseAttribution(`?utm_source=${'a'.repeat(300)}&utm_campaign=${'b'.repeat(400)}`, '', '')
    expect(out?.utmSource).toHaveLength(120)
    expect(out?.utmCampaign).toHaveLength(200)
  })
})

describe('CAPI payload (step 6 / P4-T10 P4-T11)', () => {
  const purchaseParams = {
    transaction_id: 'SO-20261105-0001',
    currency: 'USD',
    value: 129.9,
    items: [{ item_id: '12', item_name: 'Lace Wig', quantity: 1, price: 129.9 }],
  }

  it('carries granted consent and session id without losing purchase params', () => {
    const out = buildCapiPayload('purchase', purchaseParams, true, 'sess-1', 'evt-1')
    expect(out.eventId).toBe('evt-1')
    expect(out.eventName).toBe('purchase')
    expect(out.consent).toEqual({ analytics: true })
    expect(out.sessionId).toBe('sess-1')
    expect(out.params).toEqual(purchaseParams)
  })

  it('marks denied consent and omits an empty session id', () => {
    const out = buildCapiPayload('view_item', { value: 10 }, false, '', 'evt-2')
    expect(out.consent.analytics).toBe(false)
    expect('sessionId' in out).toBe(false)
  })

  it('generates a non-empty event id by default for backend idempotency', () => {
    const out = buildCapiPayload('add_to_cart', {}, true)
    expect(typeof out.eventId).toBe('string')
    expect(out.eventId.length).toBeGreaterThan(0)
    expect(out.eventId.length).toBeLessThanOrEqual(64)
  })
})
