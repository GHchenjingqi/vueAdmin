import { describe, it, expect } from 'vitest'
import { localePath, detectLocale, isRealLocale } from '@shared/i18n/localePath'
import { translate, locales, defaultLocale } from '@shared/i18n/messages'

describe('P5-T01 多语言 locale 路由', () => {
  it('localePath：裸路径 → 加语言前缀', () => {
    expect(localePath('/cart', 'en-US')).toBe('/en-US/cart')
    expect(localePath('/cart', 'zh-CN')).toBe('/zh-CN/cart')
    expect(localePath('/products/x', 'zh-CN')).toBe('/zh-CN/products/x')
  })

  it('localePath：已带前缀 → 替换为目标语言', () => {
    expect(localePath('/zh-CN/cart', 'en-US')).toBe('/en-US/cart')
    expect(localePath('/en-US/products/x', 'zh-CN')).toBe('/zh-CN/products/x')
  })

  it('localePath：根路径 → 语言根', () => {
    expect(localePath('/', 'zh-CN')).toBe('/zh-CN')
    expect(localePath('', 'en-US')).toBe('/en-US')
  })

  it('localePath：未知语言 → 回退默认 en-US（禁止 404/非法 hreflang）', () => {
    expect(localePath('/cart', 'xx-XX' as never)).toBe('/en-US/cart')
  })

  it('detectLocale：识别前缀 / 无前缀返回 null', () => {
    expect(detectLocale('/zh-CN/cart')).toBe('zh-CN')
    expect(detectLocale('/en-US/products/x')).toBe('en-US')
    expect(detectLocale('/cart')).toBeNull()
  })

  it('isRealLocale：仅 en-US / zh-CN 为真实版本', () => {
    expect(isRealLocale('en-US')).toBe(true)
    expect(isRealLocale('zh-CN')).toBe(true)
    expect(isRealLocale('fr-FR')).toBe(false)
    expect(isRealLocale('xx')).toBe(false)
  })

  it('translate：zh-CN 返回中文，缺键回退 en', () => {
    expect(translate('zh-CN', 'cart.title')).toBe('购物车')
    expect(translate('en-US', 'cart.title')).toBe('Cart')
    expect(translate('zh-CN', 'unknown.key')).toBe('unknown.key') // 回退键名
  })

  it('locales 仅含真实版本（hreflang 不指向 404）', () => {
    expect(locales).toEqual(['en-US', 'zh-CN'])
    expect(defaultLocale).toBe('en-US')
  })
})
