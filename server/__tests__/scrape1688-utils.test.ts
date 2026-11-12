import { describe, it, expect } from 'vitest'
import { slugify, makeSlug, inferImageExt } from '../modules/shop/utils/scrape1688.js'

describe('slugify', () => {
  it('英文标题转小写连字符串', () => {
    expect(slugify('Wireless Bluetooth Headphones')).toBe('wireless-bluetooth-headphones')
  })

  it('中文标题保留', () => {
    expect(slugify('无线蓝牙耳机')).toBe('无线蓝牙耳机')
  })

  it('混合中英数字，去除特殊符号', () => {
    expect(slugify('新款 iPhone 15 手机壳 (硅胶)')).toBe('新款-iphone-15-手机壳-硅胶')
  })

  it('连续特殊字符折叠为单个连字符', () => {
    // \w 含下划线，故 ___ 保留；空格折叠为 -
    expect(slugify('a---b___c   d')).toBe('a-b___c-d')
  })

  it('首尾连字符去除', () => {
    expect(slugify('  hello world  ')).toBe('hello-world')
  })

  it('截断到 80 字符', () => {
    const long = 'a'.repeat(200)
    expect(slugify(long).length).toBeLessThanOrEqual(80)
  })

  it('空串返回空', () => {
    expect(slugify('')).toBe('')
  })

  it('纯符号返回空', () => {
    expect(slugify('!!!@@@###')).toBe('')
  })
})

describe('makeSlug', () => {
  it('标题可生成 slug 时用标题', () => {
    expect(makeSlug('蓝牙耳机', 'https://detail.1688.com/offer/123.html')).toBe('蓝牙耳机')
  })

  it('标题无法生成时用 offerId 兜底', () => {
    expect(makeSlug('!!!', 'https://detail.1688.com/offer/123456.html')).toBe('c1688-123456')
  })

  it('标题和 offerId 都没有时用时间戳兜底（c1688- 前缀）', () => {
    const slug = makeSlug('!!!', 'https://detail.1688.com/page/x')
    expect(slug).toMatch(/^c1688-[a-z0-9]+$/)
  })
})

describe('inferImageExt', () => {
  it('识别 jpg', () => {
    expect(inferImageExt('https://cbu01.alicdn.com/img/abc.jpg')).toBe('.jpg')
  })

  it('识别 png', () => {
    expect(inferImageExt('https://cbu01.alicdn.com/img/abc.png')).toBe('.png')
  })

  it('识别 webp', () => {
    expect(inferImageExt('https://cbu01.alicdn.com/img/abc.webp')).toBe('.webp')
  })

  it('带查询参数仍能识别', () => {
    expect(inferImageExt('https://cbu01.alicdn.com/img/abc.jpg?x=1&y=2')).toBe('.jpg')
  })

  it('无扩展名默认 jpg', () => {
    expect(inferImageExt('https://cbu01.alicdn.com/img/abc')).toBe('.jpg')
  })

  it('白名单外扩展名默认 jpg', () => {
    expect(inferImageExt('https://cbu01.alicdn.com/img/abc.svg')).toBe('.jpg')
  })
})
