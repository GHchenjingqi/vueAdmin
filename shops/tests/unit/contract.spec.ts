import { describe, expect, it } from 'vitest'
import { mockStore } from '../../shared/mock/store'
import { cartSchema, quoteSchema, storeConfigSchema } from '../../shared/schemas/contract'

/** P1-T14 契约测试骨架：store-config / cart / quote schema 校验（P3-T04 mock 报价整数分运算） */
describe('contract schemas', () => {
  it('store-config mock passes schema', () => {
    const cfg = { currency: { code: 'USD', symbol: '$', decimalDigits: 2, symbolPosition: 'before', thousandsSeparator: ',', decimalSeparator: '.', locale: 'en-US' }, market: { country: 'US', language: 'en-US' }, version: 'mock' }
    expect(() => storeConfigSchema.parse(cfg)).not.toThrow()
  })

  it('rejects invalid currency code', () => {
    const cfg = { currency: { code: 'us', symbol: '$', decimalDigits: 2, symbolPosition: 'before', thousandsSeparator: ',', decimalSeparator: '.', locale: 'en-US' }, market: { country: 'US', language: 'en-US' }, version: 'mock' }
    expect(() => storeConfigSchema.parse(cfg)).toThrow()
  })
})

describe('mock quote math (integer cents)', () => {
  it('add item → cart schema valid, totals integer cents', () => {
    const cart = mockStore.addItem('t1', 'USD', 10100, 2)
    expect(() => cartSchema.parse(cart)).not.toThrow()
    expect(cart.itemCount).toBe(2)
    expect(cart.items[0].lineTotal.amount).toBe(259800)
  })

  it('quote: subtotal/discount/shipping/tax/total all integer cents with currency (C3)', () => {
    mockStore.addItem('t2', 'USD', 10100, 1)
    const q = mockStore.quote('t2', 'USD', { couponCode: 'WIG10' })
    expect(() => quoteSchema.parse(q)).not.toThrow()
    const { subtotal, discount, shipping, tax, total } = q.totals
    expect(Number.isInteger(subtotal.amount)).toBe(true)
    expect(discount.amount).toBe(Math.round(subtotal.amount * 0.1))
    expect(total.amount).toBe(subtotal.amount - discount.amount + shipping.amount + tax.amount)
    expect(q.currency).toBe('USD')
  })

  it('rejects coupon that is expired / exhausted / not applicable', () => {
    mockStore.addItem('t3', 'USD', 10100, 1)
    expect(() => mockStore.quote('t3', 'USD', { couponCode: 'EXPIRED10' })).toThrowError(/expired/)
    expect(() => mockStore.quote('t3', 'USD', { couponCode: 'USEDOUT10' })).toThrowError(/exhausted/)
    expect(() => mockStore.quote('t3', 'USD', { couponCode: 'NOPE' })).toThrowError(/not found/)
  })

  it('idempotent order creation: same key returns same orderNo (T-02 前端契约)', () => {
    mockStore.addItem('t4', 'USD', 10100, 1)
    const a = mockStore.createOrder('t4', 'USD', 'key-1', { email: 'a@b.com', address: {} })
    const b = mockStore.createOrder('t4', 'USD', 'key-1', { email: 'a@b.com', address: {} })
    expect(b.orderNo).toBe(a.orderNo)
  })

  it('order access requires token — wrong/empty token → 404 (T-10 前端契约)', () => {
    mockStore.addItem('t5', 'USD', 10100, 1)
    const o = mockStore.createOrder('t5', 'USD', null, { email: 'a@b.com', address: {} })
    expect(() => mockStore.getOrder(o.orderNo, 'wrong-token')).toThrowError()
    expect(() => mockStore.getOrder(o.orderNo, '')).toThrowError()
    expect(mockStore.getOrder(o.orderNo, o.accessToken).orderNo).toBe(o.orderNo)
  })
})
