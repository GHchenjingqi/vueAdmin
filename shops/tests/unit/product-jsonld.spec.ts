import { describe, expect, it } from 'vitest'
import type { CatalogProduct } from '../../shared/types/api'
import { DEFAULT_CURRENCY_CONFIG } from '../../shared/types/currency'
import { buildProductJsonLd, buildBreadcrumbJsonLd } from '../../shared/seo/product-jsonld'

/**
 * Product JSON-LD 门禁（PLAN 2.4 补完）
 *
 * 锁定两件事：
 * 1. aggregateRating 只在有已审核评价（ratingAvg 且 reviewCount > 0）时输出——
 *    无评价却报评分会被搜索引擎判为结构化数据造假；
 * 2. 价格格式与币种取自 store config（禁止写死 C1/C4），与页面可见价格同源。
 */
const USD = { ...DEFAULT_CURRENCY_CONFIG }

function product(overrides: Partial<CatalogProduct> = {}): CatalogProduct {
  return {
    id: 1,
    slug: 'lace-wig-1b',
    title: 'Lace Wig 1B',
    description: 'A test wig',
    cover: null,
    images: [],
    category: { id: 10, name: 'Lace Wigs', slug: 'lace-wigs' },
    price: { amount: 12990, currency: 'USD' },
    inStock: true,
    variants: [],
    ratingAvg: null,
    reviewCount: 0,
    ...overrides,
  }
}

describe('buildProductJsonLd', () => {
  it('outputs aggregateRating only when there is an approved rating', () => {
    const withRating = buildProductJsonLd(product({ ratingAvg: 4.6, reviewCount: 12 }), USD)
    expect(withRating?.aggregateRating).toEqual({
      '@type': 'AggregateRating',
      ratingValue: 4.6,
      reviewCount: 12,
      bestRating: 5,
      worstRating: 1,
    })
  })

  it('omits aggregateRating when reviewCount is zero even if ratingAvg is set', () => {
    const zeroCount = buildProductJsonLd(product({ ratingAvg: 4.6, reviewCount: 0 }), USD)
    expect(zeroCount?.aggregateRating).toBeUndefined()
  })

  it('omits aggregateRating when ratingAvg is absent', () => {
    const noRating = buildProductJsonLd(product({ ratingAvg: null, reviewCount: 12 }), USD)
    expect(noRating?.aggregateRating).toBeUndefined()
  })

  it('formats price with the configured currency digits and code', () => {
    const jp = { ...USD, code: 'JPY', decimalDigits: 0 }
    const out = buildProductJsonLd(product({ price: { amount: 12345, currency: 'JPY' } }), jp)
    expect(out?.offers.price).toBe('12345')
    expect(out?.offers.priceCurrency).toBe('JPY')
    const usd = buildProductJsonLd(product({ price: { amount: 12990, currency: 'USD' } }), USD)
    expect(usd?.offers.price).toBe('129.90')
    expect(usd?.offers.priceCurrency).toBe('USD')
  })

  it('maps availability from stock state', () => {
    expect(buildProductJsonLd(product({ inStock: true }), USD)?.offers.availability).toBe('https://schema.org/InStock')
    expect(buildProductJsonLd(product({ inStock: false }), USD)?.offers.availability).toBe('https://schema.org/OutOfStock')
  })

  it('returns null when the product has no price', () => {
    expect(buildProductJsonLd(product({ price: null }), USD)).toBeNull()
  })
})

describe('buildBreadcrumbJsonLd', () => {
  it('builds home + category crumbs when the product has a category', () => {
    const out = buildBreadcrumbJsonLd(product(), 'Home')
    expect(out.itemListElement).toEqual([
      { '@type': 'ListItem', position: 1, name: 'Home', item: '/' },
      { '@type': 'ListItem', position: 2, name: 'Lace Wigs', item: '/c/lace-wigs' },
    ])
  })

  it('falls back to the home crumb only when the product has no category', () => {
    const out = buildBreadcrumbJsonLd(product({ category: null }), 'Home')
    expect(out.itemListElement).toEqual([{ '@type': 'ListItem', position: 1, name: 'Home', item: '/' }])
  })
})
