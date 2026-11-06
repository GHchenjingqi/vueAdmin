import { createHmac, randomUUID } from 'node:crypto'
import type { Cart, CartItem, OrderDetail, OrderDraft, Quote, ShippingRate } from '@shared/types/commerce'
import type { Money } from '@shared/types/currency'
import { MOCK_PRODUCTS } from './fixtures'

/**
 * Mock 商务处理器（后端冻结期）：购物车 / 报价 / 订单 / 支付。
 * 契约对齐 docs/API_CONTRACT.md；金额一律整数分（C2）；金额对象必带 currency（C3）。
 */

interface MockCartRow {
  token: string
  items: CartItem[]
  currency: string
  locale?: string
}

interface MockOrderRow extends OrderDetail {
  idempotencyKey: string | null
  shippingRateId: string
  couponCode: string | null
}

const now = () => new Date().toISOString()

export class MockStore {
  carts = new Map<string, MockCartRow>()
  orders = new Map<string, MockOrderRow>()

  private findVariant(skuId: number) {
    for (const p of MOCK_PRODUCTS) {
      const v = p.variants.find((x) => x.id === skuId)
      if (v) return { product: p, variant: v }
    }
    return null
  }

  getOrCreateCart(token: string, currency: string, locale?: string): MockCartRow {
    let cart = this.carts.get(token)
    if (!cart) {
      cart = { token, items: [], currency, locale }
      this.carts.set(token, cart)
    } else if (locale) {
      cart.locale = locale
    }
    return cart
  }

  presentCart(cart: MockCartRow): Cart {
    return { token: cart.token, items: cart.items, currency: cart.currency, locale: cart.locale, itemCount: cart.items.reduce((n, i) => n + i.qty, 0) }
  }

  addItem(token: string, currency: string, skuId: number, qty: number, locale?: string): Cart {
    const cart = this.getOrCreateCart(token, currency, locale)
    const found = this.findVariant(skuId)
    if (!found) throw Object.assign(new Error('variant not found'), { code: 'PRODUCT_NOT_FOUND' })
    if (!found.variant.inStock) throw Object.assign(new Error('out of stock'), { code: 'INSUFFICIENT_STOCK' })
    const q = Math.max(1, Math.min(10, Math.floor(qty)))
    const existing = cart.items.find((i) => i.skuId === skuId)
    if (existing) {
      existing.qty = Math.min(10, existing.qty + q)
      existing.lineTotal = { amount: existing.unit.amount * existing.qty, currency: existing.unit.currency }
    } else {
      const price = found.variant.price as Money
      cart.items.push({
        id: cart.items.length + 1,
        skuId,
        spuId: found.product.id,
        title: found.product.title,
        spec: found.variant.spec,
        qty: q,
        unit: price,
        lineTotal: { amount: price.amount * q, currency: price.currency },
        sellable: true,
      })
    }
    return this.presentCart(cart)
  }

  updateItem(token: string, currency: string, itemId: number, qty: number, locale?: string): Cart {
    const cart = this.getOrCreateCart(token, currency, locale)
    if (qty <= 0) {
      cart.items = cart.items.filter((i) => i.id !== itemId)
    } else {
      const item = cart.items.find((i) => i.id === itemId)
      if (!item) throw Object.assign(new Error('cart item not found'), { code: 'CART_ITEM_NOT_FOUND' })
      item.qty = Math.min(10, Math.floor(qty))
      item.lineTotal = { amount: item.unit.amount * item.qty, currency: item.unit.currency }
    }
    return this.presentCart(cart)
  }

  /** 服务端报价（P3-T04 前端 mock 版）：重算价格，忽略前端总价；过期 15 分钟 */
  quote(token: string, currency: string, opts: { shippingRateId?: string; couponCode?: string } = {}): Quote {
    const cart = this.carts.get(token)
    if (!cart || cart.items.length === 0) throw Object.assign(new Error('cart is empty'), { code: 'CART_EMPTY' })
    if (cart.currency !== currency) throw Object.assign(new Error('currency changed'), { code: 'CURRENCY_CHANGED' })

    const subtotalAmount = cart.items.reduce((n, i) => n + i.unit.amount * i.qty, 0)
    const subtotal: Money = { amount: subtotalAmount, currency }

    const rates: ShippingRate[] = [
      { id: 'std', name: 'Standard', amount: { amount: 999, currency }, etaDays: '7-12' },
      { id: 'exp', name: 'Express', amount: { amount: 1999, currency }, etaDays: '3-5' },
    ]
    const rateId = opts.shippingRateId && rates.some((r) => r.id === opts.shippingRateId) ? opts.shippingRateId : 'std'
    const rate = rates.find((r) => r.id === rateId) as ShippingRate
    const shipping: Money = { amount: rate.amount.amount, currency }

    let discountAmount = 0
    let appliedCoupon: { code: string; discount: Money } | null = null
    if (opts.couponCode) {
      const code = opts.couponCode.toUpperCase()
      if (code === 'EXPIRED10') throw Object.assign(new Error('coupon expired'), { code: 'COUPON_EXPIRED' })
      if (code === 'USEDOUT10') throw Object.assign(new Error('coupon exhausted'), { code: 'COUPON_EXHAUSTED' })
      if (code === 'WIG10') {
        const wigOnly = cart.items.every((i) => i.skuId >= 10000)
        if (!wigOnly) throw Object.assign(new Error('coupon not applicable'), { code: 'COUPON_NOT_APPLICABLE' })
        discountAmount = Math.round(subtotalAmount * 0.1)
        appliedCoupon = { code, discount: { amount: discountAmount, currency } }
      } else {
        throw Object.assign(new Error('coupon not found'), { code: 'COUPON_NOT_APPLICABLE' })
      }
    }
    const discount: Money = { amount: discountAmount, currency }
    const taxAmount = Math.round(((subtotalAmount - discountAmount) * 700) / 10000)
    const tax: Money = { amount: taxAmount, currency }
    const total: Money = { amount: subtotalAmount - discountAmount + shipping.amount + tax.amount, currency }

    return {
      quoteId: `q_${randomUUID().slice(0, 12)}`,
      version: 1,
      expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
      currency,
      items: cart.items.map((i) => ({ skuId: i.skuId, title: i.title, qty: i.qty, unit: i.unit, lineTotal: i.lineTotal })),
      totals: { subtotal, discount, shipping, tax, total },
      shippingRates: rates,
      appliedCoupon,
      warnings: [],
    }
  }

  createOrder(
    token: string,
    currency: string,
    idempotencyKey: string | null,
    payload: { email: string; address: Record<string, string>; shippingRateId?: string; couponCode?: string },
  ): OrderDraft {
    if (idempotencyKey) {
      const existed = [...this.orders.values()].find((o) => o.idempotencyKey === idempotencyKey)
      if (existed) return this.presentOrderDraft(existed)
    }
    const q = this.quote(token, currency, { shippingRateId: payload.shippingRateId, couponCode: payload.couponCode })
    const orderNo = `SO${Date.now()}${Math.floor(Math.random() * 1000)}`
    const accessToken = randomUUID().replace(/-/g, '')
    const row: MockOrderRow = {
      orderNo,
      id: this.orders.size + 1,
      accessToken,
      status: 'pending_payment',
      paymentStatus: 'none',
      currency,
      email: payload.email,
      createdAt: now(),
      totals: q.totals,
      items: q.items.map((i) => ({ ...i, spec: {} })),
      shippingAddress: payload.address,
      idempotencyKey,
      shippingRateId: payload.shippingRateId || 'std',
      couponCode: payload.couponCode || null,
    }
    this.orders.set(orderNo, row)
    return this.presentOrderDraft(row)
  }

  presentOrderDraft(o: MockOrderRow): OrderDraft {
    return {
      orderNo: o.orderNo,
      id: o.id,
      accessToken: o.accessToken,
      status: o.status,
      paymentStatus: o.paymentStatus,
      totals: o.totals,
      currency: o.currency,
      email: o.email,
      createdAt: o.createdAt,
    }
  }

  /** 订单访问防枚举：orderNo + accessToken 双要素，缺一返回 404（T-10） */
  getOrder(orderNo: string, token: string): OrderDetail {
    const o = this.orders.get(orderNo)
    if (!o || o.accessToken !== token || !token) throw Object.assign(new Error('not found'), { code: 'ORDER_NOT_FOUND' })
    return {
      orderNo: o.orderNo,
      id: o.id,
      accessToken: o.accessToken,
      status: o.status,
      paymentStatus: o.paymentStatus,
      totals: o.totals,
      currency: o.currency,
      email: o.email,
      createdAt: o.createdAt,
      items: o.items,
      shippingAddress: o.shippingAddress,
    }
  }

  /** mock 支付：标记 captured 并返回结果页跳转（真实支付在后端阶段接 provider） */
  pay(orderNo: string): { sessionUrl: string; provider: string } {
    const o = this.orders.get(orderNo)
    if (!o) throw Object.assign(new Error('not found'), { code: 'ORDER_NOT_FOUND' })
    if (o.paymentStatus === 'captured') return { sessionUrl: `/checkout/result?order=${orderNo}&t=${o.accessToken}`, provider: 'mock' }
    o.paymentStatus = 'captured'
    o.status = 'processing'
    return { sessionUrl: `/checkout/result?order=${orderNo}&t=${o.accessToken}`, provider: 'mock' }
  }

  hmac(secret: string, payload: string): string {
    return createHmac('sha256', secret).update(payload).digest('hex')
  }
}

export const mockStore = new MockStore()
