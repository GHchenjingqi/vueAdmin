import { trackEvent, itemsFromLineItems, type MoneyParam } from './events'

/** 电商埋点便捷封装（P4-T10）：页面按需调用，consent 门控在 trackEvent 内 */
export function trackViewItem(item: { skuId: number; title: string; qty: number; unit: MoneyParam }): void {
  trackEvent('view_item', {
    currency: item.unit.currency,
    value: item.unit.amount / 100,
    items: itemsFromLineItems([item]),
  })
}

export function trackAddToCart(item: { skuId: number; title: string; qty: number; unit: MoneyParam }): void {
  trackEvent('add_to_cart', {
    currency: item.unit.currency,
    value: (item.unit.amount * item.qty) / 100,
    items: itemsFromLineItems([item]),
  })
}

export function trackViewCart(items: { skuId: number; title: string; qty: number; unit: MoneyParam }[], total: MoneyParam): void {
  trackEvent('view_cart', {
    currency: total.currency,
    value: total.amount / 100,
    items: itemsFromLineItems(items),
  })
}

export function trackBeginCheckout(items: { skuId: number; title: string; qty: number; unit: MoneyParam }[], total: MoneyParam): void {
  trackEvent('begin_checkout', {
    currency: total.currency,
    value: total.amount / 100,
    items: itemsFromLineItems(items),
  })
}

export function trackAddShippingInfo(items: { skuId: number; title: string; qty: number; unit: MoneyParam }[], total: MoneyParam): void {
  trackEvent('add_shipping_info', {
    currency: total.currency,
    value: total.amount / 100,
    items: itemsFromLineItems(items),
  })
}

export function trackAddPaymentInfo(items: { skuId: number; title: string; qty: number; unit: MoneyParam }[], total: MoneyParam): void {
  trackEvent('add_payment_info', {
    currency: total.currency,
    value: total.amount / 100,
    items: itemsFromLineItems(items),
  })
}

/** purchase：仅由服务端订单事实触发（paymentStatus=captured 才调用；金额/币种取订单快照） */
export function trackPurchase(order: { orderNo: string; totals: { total: MoneyParam }; items: { skuId: number; title: string; qty: number; unit: MoneyParam }[] }): void {
  trackEvent('purchase', {
    transaction_id: order.orderNo,
    currency: order.totals.total.currency,
    value: order.totals.total.amount / 100,
    items: itemsFromLineItems(order.items),
  })
}
