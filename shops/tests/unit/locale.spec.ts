import { describe, it, expect } from 'vitest'
import { localePath, detectLocale, isRealLocale } from '@shared/i18n/localePath'
import { translate, locales, defaultLocale } from '@shared/i18n/messages'

describe('P5-T01b 单语站 locale 语义', () => {
  it('localePath：单语站恒返回原路径（无语言前缀）', () => {
    expect(localePath('/cart')).toBe('/cart')
    expect(localePath('/products/x')).toBe('/products/x')
    expect(localePath('/')).toBe('/')
    expect(localePath('')).toBe('/')
  })

  it('localePath：忽略语言参数（前端不切换，URL 不承载语言）', () => {
    expect(localePath('/cart', 'en-US')).toBe('/cart')
    expect(localePath('/products/x', 'zh-CN')).toBe('/products/x')
  })

  it('detectLocale：单语站无 URL 前缀可检测 → 恒 null', () => {
    expect(detectLocale('/zh-CN/cart')).toBeNull()
    expect(detectLocale('/en-US/products/x')).toBeNull()
    expect(detectLocale('/cart')).toBeNull()
  })

  it('isRealLocale：仅 en-US / zh-CN 为后台可配置版本', () => {
    expect(isRealLocale('en-US')).toBe(true)
    expect(isRealLocale('zh-CN')).toBe(true)
    expect(isRealLocale('fr-FR')).toBe(false)
    expect(isRealLocale('xx')).toBe(false)
  })

  it('translate：zh-CN 返回中文，缺键回退 en（字典保留，后台可切语言）', () => {
    expect(translate('zh-CN', 'cart.title')).toBe('购物车')
    expect(translate('en-US', 'cart.title')).toBe('Cart')
    expect(translate('zh-CN', 'unknown.key')).toBe('unknown.key') // 回退键名
  })

  it('locales 保留后台可配置版本；defaultLocale en-US（英文站）', () => {
    expect(locales).toEqual(['en-US', 'zh-CN'])
    expect(defaultLocale).toBe('en-US')
  })
})
