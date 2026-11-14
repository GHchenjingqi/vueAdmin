import type { CatalogProduct } from '../types/api'
import type { CurrencyConfig } from '../types/currency'

/**
 * Product JSON-LD（P2-T11）
 *
 * - 价格用 store config 的币种与小数位，禁止写死 C1/C4；
 * - 价格与页面可见价格同源（同一 product.price 数据源）；
 * - `aggregateRating` 只在有已审核评价时输出：无评价却报评分会被搜索引擎判为结构化数据造假。
 *
 * 纯函数：抽出来便于单测锁定 aggregateRating 的开关逻辑与金额格式，页面通过 `useHead` 注入。
 */
export interface ProductJsonLd {
  '@context': 'https://schema.org'
  '@type': 'Product'
  name: string
  description: string
  offers: {
    '@type': 'Offer'
    price: string
    priceCurrency: string
    availability: string
  }
  aggregateRating?: {
    '@type': 'AggregateRating'
    ratingValue: number
    reviewCount: number
    bestRating: 5
    worstRating: 1
  }
}

export function buildProductJsonLd(product: CatalogProduct, currency: CurrencyConfig): ProductJsonLd | null {
  const p = product.price
  if (!p) return null
  const base = {
    '@context': 'https://schema.org' as const,
    '@type': 'Product' as const,
    name: product.title,
    description: product.description,
    offers: {
      '@type': 'Offer' as const,
      price: (p.amount / 10 ** currency.decimalDigits).toFixed(currency.decimalDigits),
      priceCurrency: currency.code,
      availability: product.inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
    },
  }
  if (product.ratingAvg && product.reviewCount && product.reviewCount > 0) {
    return {
      ...base,
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: product.ratingAvg,
        reviewCount: product.reviewCount,
        bestRating: 5,
        worstRating: 1,
      },
    }
  }
  return base
}

export interface BreadcrumbJsonLd {
  '@context': 'https://schema.org'
  '@type': 'BreadcrumbList'
  itemListElement: Array<{
    '@type': 'ListItem'
    position: number
    name: string
    item: string
  }>
}

export function buildBreadcrumbJsonLd(product: CatalogProduct, homeLabel: string): BreadcrumbJsonLd {
  const items = [
    { '@type': 'ListItem' as const, position: 1, name: homeLabel, item: '/' },
    ...(product.category
      ? [{ '@type': 'ListItem' as const, position: 2, name: product.category.name, item: `/c/${product.category.slug}` }]
      : []),
  ]
  return { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: items }
}
