// @vitest-environment node
/**
 * 营销邮件 CTA 与退订（PLAN 4.4）
 *
 * 缺口：弃购召回 / 降价提醒的正文只有商品名与金额，没有商品链接、没有退订入口。
 * 前者让转化断在邮件里，后者是合规风险（CAN-SPAM / GDPR 要求商业邮件提供退订方式）。
 *
 * 这里锁定纯函数口径，不依赖 DB：
 * - CTA 与退订行都被追加到正文尾部，保留原正文内容；
 * - 没有 token 时不伪造退订链接（宁缺勿假）；
 * - 站点地址缺省时返回相对路径，不拼接出 `undefined/products/...`。
 */
import { describe, expect, it, afterEach } from 'vitest'
import {
  buildUnsubscribeUrl,
  cartUrl,
  productUrl,
  withCallToAction,
} from '../modules/storefront/services/mailFooterService.js'

const ORIGINAL_SITE = process.env.NUXT_PUBLIC_SITE_URL

afterEach(() => {
  if (ORIGINAL_SITE === undefined) delete process.env.NUXT_PUBLIC_SITE_URL
  else process.env.NUXT_PUBLIC_SITE_URL = ORIGINAL_SITE
})

describe('mail links', () => {
  it('builds absolute product and cart urls from the configured site base', () => {
    process.env.NUXT_PUBLIC_SITE_URL = 'https://shop.example.com/'
    expect(productUrl('123-lace-wig')).toBe('https://shop.example.com/products/123-lace-wig')
    expect(cartUrl()).toBe('https://shop.example.com/cart')
  })

  it('falls back to relative paths when no site base is configured', () => {
    delete process.env.NUXT_PUBLIC_SITE_URL
    expect(productUrl(42)).toBe('/products/42')
    expect(cartUrl()).toBe('/cart')
  })

  it('builds the unsubscribe url only when a token exists', () => {
    process.env.NUXT_PUBLIC_SITE_URL = 'https://shop.example.com'
    expect(buildUnsubscribeUrl('abc123')).toBe('https://shop.example.com/api/newsletter/unsubscribe?token=abc123')
    expect(buildUnsubscribeUrl('')).toBeNull()
    expect(buildUnsubscribeUrl(null)).toBeNull()
    expect(buildUnsubscribeUrl(undefined)).toBeNull()
  })
})

describe('withCallToAction', () => {
  it('appends the CTA and unsubscribe line while keeping the original body', () => {
    process.env.NUXT_PUBLIC_SITE_URL = 'https://shop.example.com'
    const out = withCallToAction('Your cart is waiting.', {
      cta: { label: 'Resume your cart', url: 'https://shop.example.com/cart' },
      unsubscribeToken: 'tok-1',
      siteName: 'Aurora Hair Studio',
    })
    expect(out).toContain('Your cart is waiting.')
    expect(out).toContain('Resume your cart: https://shop.example.com/cart')
    expect(out).toContain('Unsubscribe: https://shop.example.com/api/newsletter/unsubscribe?token=tok-1')
    expect(out).toContain('Aurora Hair Studio')
  })

  it('omits the unsubscribe line instead of fabricating one when token is missing', () => {
    const out = withCallToAction('Body', { unsubscribeToken: null })
    expect(out).not.toContain('Unsubscribe')
    expect(out).toContain('Body')
  })

  it('omits the CTA block when no cta is given', () => {
    const out = withCallToAction('Body', { unsubscribeToken: 'tok-2' })
    expect(out).not.toContain('Resume your cart')
    expect(out).toContain('Unsubscribe')
  })
})
