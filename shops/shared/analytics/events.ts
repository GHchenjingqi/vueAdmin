import { readConsent } from './consent'

/**
 * P4-T10：GA4 电商事件字典（九个）+ 同意门控发送。
 * - 参数金额一律 Money{amount, currency}（currency 取订单快照或 store config）
 * - purchase/refund 以服务端事实为准（订单接口返回 paymentStatus 后才触发）
 * - 未同意 analytics 前：事件仅入队（dataLayer 不发 GA4），同意后由 Consent Mode 控制采集
 */

export interface MoneyParam {
  amount: number
  currency: string
}

/** 事件字典（GA4 推荐电商事件；refunded 为服务端侧事件，前端不直接发送） */
export const EVENT_DICTIONARY = {
  view_item_list: { required: ['item_list_id', 'items'] },
  select_item: { required: ['items'] },
  view_item: { required: ['currency', 'value', 'items'] },
  view_cart: { required: ['currency', 'value', 'items'] },
  add_to_cart: { required: ['currency', 'value', 'items'] },
  begin_checkout: { required: ['currency', 'value', 'items'] },
  add_shipping_info: { required: ['currency', 'value', 'items'] },
  add_payment_info: { required: ['currency', 'value', 'items'] },
  purchase: { required: ['transaction_id', 'currency', 'value', 'items'] },
} as const

export type EventName = keyof typeof EVENT_DICTIONARY

export interface AnalyticsItem {
  item_id: string
  item_name: string
  quantity: number
  price: number
}

/** 事件 → dataLayer（GA4 gtag 协议）；consent 未授予 analytics 时仅入队不入 GA4 */
export function trackEvent(name: EventName, params: Record<string, unknown>): void {
  if (typeof window === 'undefined') return
  const required = EVENT_DICTIONARY[name]?.required ?? []
  const missing = required.filter((k) => params[k] === undefined)
  if (missing.length) {
    if (import.meta.dev) console.warn(`[analytics] ${name} missing params: ${missing.join(',')}`)
    return
  }
  const w = window as unknown as { dataLayer?: unknown[] }
  w.dataLayer = w.dataLayer || []
  w.dataLayer.push({ event: name, consent: readConsent()?.analytics === true, ...params })
}

export function itemsFromLineItems(items: { skuId: number; title: string; qty: number; unit: MoneyParam }[]): AnalyticsItem[] {
  return items.map((i) => ({
    item_id: String(i.skuId),
    item_name: i.title,
    quantity: i.qty,
    price: i.unit.amount / 100,
  }))
}

/** 加载 GA4（仅 consent.analytics === true 且配置了 measurementId；幂等） */
export function loadGa4(measurementId: string): void {
  if (typeof window === 'undefined' || !measurementId) return
  if (document.querySelector(`script[src*="gtag/js?id=${measurementId}"]`)) return
  const s = document.createElement('script')
  s.async = true
  s.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`
  document.head.appendChild(s)
  const w = window as unknown as { dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void }
  w.dataLayer = w.dataLayer || []
  w.gtag = w.gtag || ((...args: unknown[]) => w.dataLayer?.push(args))
  w.gtag('js', new Date())
  w.gtag('config', measurementId, { anonymize_ip: true })
}
