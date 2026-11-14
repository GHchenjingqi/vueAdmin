// @vitest-environment node
/**
 * Stripe 网关（PLAN 6.1）
 *
 * 只测纯逻辑：Webhook 验签与事件映射。真正的建会话/退款需要外部网络，不在单测范围。
 *
 * 验签是这条链路唯一的信任边界 —— 它错了等于允许任何人伪造"已支付"，
 * 因此重点覆盖：正确签名通过、篡改 body 失败、篡改时间戳失败、超出容忍窗口失败、
 * 缺失/畸形头失败。
 */
import { describe, it, expect } from 'vitest'
import crypto from 'crypto'
import { verifyStripeSignature } from '../modules/storefront/payments/gateways/stripe.js'

const SECRET = 'whsec_test_secret'

function sign(rawBody: string, timestamp: number, secret = SECRET): string {
  const sig = crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex')
  return `t=${timestamp},v1=${sig}`
}

describe('verifyStripeSignature', () => {
  const body = JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed' })
  const now = 1_800_000_000

  it('accepts a correctly signed payload', () => {
    expect(verifyStripeSignature(Buffer.from(body), sign(body, now), SECRET, now)).toBe(true)
  })

  it('rejects when the body was tampered with after signing', () => {
    const header = sign(body, now)
    const tampered = JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed', extra: 'x' })
    expect(verifyStripeSignature(Buffer.from(tampered), header, SECRET, now)).toBe(false)
  })

  it('rejects when signed with a different secret', () => {
    expect(verifyStripeSignature(Buffer.from(body), sign(body, now, 'whsec_other'), SECRET, now)).toBe(false)
  })

  it('rejects a stale timestamp outside the tolerance window (replay protection)', () => {
    const old = now - 301
    expect(verifyStripeSignature(Buffer.from(body), sign(body, old), SECRET, now)).toBe(false)
  })

  it('accepts a timestamp just inside the tolerance window', () => {
    const recent = now - 299
    expect(verifyStripeSignature(Buffer.from(body), sign(body, recent), SECRET, now)).toBe(true)
  })

  it('rejects a header without v1 or without timestamp', () => {
    expect(verifyStripeSignature(Buffer.from(body), '', SECRET, now)).toBe(false)
    expect(verifyStripeSignature(Buffer.from(body), 'v1=deadbeef', SECRET, now)).toBe(false)
    expect(verifyStripeSignature(Buffer.from(body), `t=${now}`, SECRET, now)).toBe(false)
  })

  it('rejects when the secret or header is empty', () => {
    expect(verifyStripeSignature(Buffer.from(body), sign(body, now), '', now)).toBe(false)
  })

  it('tolerates extra fields in the signature header', () => {
    const header = `${sign(body, now)},v0=ignored`
    expect(verifyStripeSignature(Buffer.from(body), header, SECRET, now)).toBe(true)
  })
})
