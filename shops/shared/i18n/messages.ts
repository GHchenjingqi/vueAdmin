/** 轻量 i18n（P1-T05）：单语言 en-US 首发，结构预留 zh-CN 扩展（locale 一律来自 store config，不硬编码） */
export type Locale = 'en-US' | 'zh-CN'

export const locales: Locale[] = ['en-US', 'zh-CN']
export const defaultLocale: Locale = 'en-US'

const zh: Record<string, string> = {
  'shop.title': 'Aurora Hair Studio',
  'cart.title': '购物车',
  'cart.empty': '购物车是空的',
  'cart.backHome': '回到首页',
  'checkout.title': '结算',
  'product.addToCart': '加入购物车',
  'product.outOfStock': '缺货',
  'common.currency': '货币',
}

const en: Record<string, string> = {
  'shop.title': 'Aurora Hair Studio',
  'cart.title': 'Cart',
  'cart.empty': 'Your cart is empty',
  'cart.backHome': 'Back to home',
  'checkout.title': 'Checkout',
  'product.addToCart': 'Add to Cart',
  'product.outOfStock': 'Out of stock',
  'common.currency': 'Currency',
}

const messages: Record<Locale, Record<string, string>> = { 'en-US': en, 'zh-CN': zh }

export function translate(locale: Locale, key: string): string {
  return messages[locale]?.[key] ?? messages[defaultLocale][key] ?? key
}
