import type { CatalogCategory, CatalogProduct, CatalogVariant } from '../types/api'
import type { Money } from '../types/currency'

/**
 * Mock 数据源（后端冻结期的前端独立数据；契约与 docs/API_CONTRACT.md 一致）
 * 后端阶段完成后，/api/catalog/* 将直连现有后台 storefront 目录接口，本文件仅作回退。
 */

const usd = (amount: number): Money => ({ amount, currency: 'USD' })

export const MOCK_CATEGORIES: CatalogCategory[] = [
  {
    id: 1,
    slug: 'lace-wigs',
    name: 'Lace Wigs',
    level: 1,
    kind: 'wig',
    children: [
      { id: 11, slug: 'hd-lace', name: 'HD Lace', level: 2, kind: 'wig', children: [] },
      { id: 12, slug: 'full-lace', name: 'Full Lace', level: 2, kind: 'wig', children: [] },
    ],
  },
  {
    id: 2,
    slug: 'apparel',
    name: 'Apparel',
    level: 1,
    kind: 'apparel',
    children: [{ id: 21, slug: 'dresses', name: 'Dresses', level: 2, kind: 'apparel', children: [] }],
  },
]

function wigVariants(base: number, prices: number[]): CatalogVariant[] {
  const textures = ['straight', 'body-wave', 'deep-wave']
  const lengths = ['18', '20', '22']
  const list: CatalogVariant[] = []
  let i = 0
  for (const texture of textures) {
    for (const length of lengths) {
      list.push({
        id: base * 100 + i,
        code: `WG-${base}-${texture.slice(0, 3).toUpperCase()}-${length}`,
        spec: { hairMaterial: 'human-hair', texture, laceType: 'HD', capSize: '22', length, color: 'natural-black', density: '180%', glueless: 'yes' },
        price: usd(prices[i % prices.length]),
        inStock: i % 7 !== 5,
        stockNote: i % 7 === 3 ? 'low-stock' : undefined,
      })
      i++
    }
  }
  return list
}

export const MOCK_PRODUCTS: CatalogProduct[] = [
  {
    id: 101,
    slug: '101-hd-lace-glueless-body-wave-wig',
    title: 'HD Lace Glueless Body Wave Wig 180% Density',
    description: 'Pre-cut HD lace, glueless install in 3 minutes. 100% human hair, 180% density, natural hairline with pre-plucked baby hair.',
    cover: null,
    images: [],
    category: { id: 11, name: 'HD Lace', slug: 'hd-lace' },
    price: usd(129900),
    inStock: true,
    categoryKind: 'wig',
    variants: wigVariants(101, [129900, 139900, 149900]),
  },
  {
    id: 102,
    slug: '102-transparent-lace-deep-wave-wig',
    title: 'Transparent Lace Deep Wave Wig 200% Density',
    description: 'Melt-skin transparent lace with deep wave texture. Soft, bouncy waves that hold curl for weeks.',
    cover: null,
    images: [],
    category: { id: 12, name: 'Full Lace', slug: 'full-lace' },
    price: usd(159900),
    inStock: true,
    categoryKind: 'wig',
    variants: wigVariants(102, [159900, 169900]),
  },
  {
    id: 201,
    slug: '201-summer-slip-dress',
    title: 'Summer Slip Dress',
    description: 'Bias-cut satin slip dress with adjustable straps. Model is 175cm wearing size S.',
    cover: null,
    images: [],
    category: { id: 21, name: 'Dresses', slug: 'dresses' },
    price: usd(4900),
    inStock: true,
    categoryKind: 'apparel',
    variants: (['XS', 'S', 'M', 'L', 'XL'] as const).map((size, i) => ({
      id: 20100 + i,
      code: `AP-201-${size}`,
      spec: {
        sizeSystem: 'US',
        size,
        color: 'champagne',
        fabric: '95% polyester 5% elastane',
        fit: 'regular',
        measurements: 'Bust 82-88cm, Length 92cm',
        tryOnInfo: 'Model 175cm wears S',
      },
      price: usd(4900 + (i > 2 ? 500 : 0)),
      inStock: i !== 4,
    })),
  },
]

export const MOCK_POLICY_PAGES: Record<string, { title: string; body: string }> = {
  privacy: { title: 'Privacy Policy', body: 'We collect only the data needed to fulfil your order...' },
  terms: { title: 'Terms of Service', body: 'By placing an order you agree to our terms...' },
  shipping: { title: 'Shipping Policy', body: 'Free standard shipping on orders over $99 (displayed in your active currency)...' },
  returns: { title: 'Return & Refund Policy', body: '30-day return window from delivery date. Items must be unworn...' },
}

export const MOCK_BLOG_POSTS = [
  {
    slug: 'how-to-install-glueless-wig',
    title: 'How to Install a Glueless Wig in 3 Minutes',
    date: '2026-10-20',
    excerpt: 'Step-by-step guide with no glue, no damage...',
    body: 'Glueless wigs use combs and an adjustable band...',
  },
  {
    slug: 'wig-care-101',
    title: 'Wig Care 101: Make Your Wig Last a Year',
    date: '2026-10-05',
    excerpt: 'Washing, deep conditioning and storage tips...',
    body: 'Wash every 8-10 wears with sulfate-free shampoo...',
  },
]
