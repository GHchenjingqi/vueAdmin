import { describe, expect, it } from 'vitest'
import { buildOrderForwardBody, buildQuoteForwardBody } from '../../server/utils/commerce'

/**
 * BFF 转发体契约（storefront-ops-audit dim01 / PLAN 1.6）
 *
 * 背景：`checkout/quote` 曾只转发 cartToken，`checkout/orders` 漏了 couponCode 与
 * pointsToRedeem，导致税费、分区运费、优惠券在 C 端全部失效，且页面不报错。
 *
 * 这里锁定「前端提交的计费要素必须出现在转发体里」——新增字段忘了转发时测试直接失败。
 */

/** 前端结算页实际会提交的字段（与 pages/checkout/index.vue 的请求体保持一致） */
const FRONTEND_QUOTE_FIELDS = ['shippingRateId', 'couponCode', 'shippingAddress', 'pointsToRedeem'] as const
const FRONTEND_ORDER_FIELDS = ['email', 'address', 'shippingRateId', 'couponCode', 'pointsToRedeem', 'attribution'] as const

/** 前端字段名 → 转发字段名（address 在后端契约里叫 shippingAddress） */
const ORDER_FIELD_MAP: Record<string, string> = { address: 'shippingAddress' }

describe('BFF quote forwarding contract', () => {
  it('forwards every billing field the checkout page submits', () => {
    const forwarded = buildQuoteForwardBody(
      {
        shippingAddress: { country: 'US', city: 'LA' },
        shippingRateId: 'exp',
        couponCode: 'WIG10',
        pointsToRedeem: 100,
      },
      'cart-token-1',
    )
    for (const field of FRONTEND_QUOTE_FIELDS) {
      expect(forwarded, `quote 转发体缺少字段 ${field}`).toHaveProperty(field)
    }
    expect(forwarded.shippingAddress).toEqual({ country: 'US', city: 'LA' })
    expect(forwarded.shippingRateId).toBe('exp')
    expect(forwarded.couponCode).toBe('WIG10')
    expect(forwarded.pointsToRedeem).toBe(100)
    expect(forwarded.cartToken).toBe('cart-token-1')
  })

  it('keeps undefined fields out of the decision path but preserves keys', () => {
    // 游客不带券/积分时不应报错，也不应伪造值
    const forwarded = buildQuoteForwardBody({ shippingAddress: { country: 'GB' } }, 't')
    expect(forwarded.couponCode).toBeUndefined()
    expect(forwarded.pointsToRedeem).toBeUndefined()
    expect('couponCode' in forwarded).toBe(true)
  })

  it('does not invent a shippingRateId when the client omits it', () => {
    // 档位缺省由服务端回退标准档，BFF 不应写死 'std'（否则后台改档位前端跟不上）
    const forwarded = buildQuoteForwardBody({ shippingAddress: { country: 'US' } }, 't')
    expect(forwarded.shippingRateId).toBeUndefined()
  })
})

describe('BFF order forwarding contract', () => {
  it('forwards every field the checkout page submits', () => {
    const forwarded = buildOrderForwardBody(
      {
        email: 'a@b.com',
        address: { country: 'US' },
        shippingRateId: 'exp',
        couponCode: 'WIG10',
        pointsToRedeem: 50,
        attribution: { utmSource: 'google' },
      },
      'cart-token-1',
      'fallback',
    )
    for (const field of FRONTEND_ORDER_FIELDS) {
      const target = ORDER_FIELD_MAP[field] ?? field
      expect(forwarded, `order 转发体缺少字段 ${target}`).toHaveProperty(target)
    }
    expect(forwarded.couponCode).toBe('WIG10')
    expect(forwarded.pointsToRedeem).toBe(50)
    expect(forwarded.shippingRateId).toBe('exp')
    expect(forwarded.attribution).toEqual({ utmSource: 'google' })
  })

  it('falls back to the provided idempotency key when the client omits one', () => {
    const forwarded = buildOrderForwardBody({ email: 'a@b.com' }, 't', 'hash-abc')
    expect(forwarded.idempotencyKey).toBe('hash-abc')
  })

  it('keeps a client-supplied idempotency key', () => {
    const forwarded = buildOrderForwardBody({ idempotencyKey: 'client-key' }, 't', 'hash-abc')
    expect(forwarded.idempotencyKey).toBe('client-key')
  })
})
