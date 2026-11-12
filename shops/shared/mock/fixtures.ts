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

/**
 * Mock 评论（P4-T07）：isVerified 标记"已验证购买"（后端按订单归属判定；mock 示例混合）。
 * 提交进 pending 审核队列；GET 仅返回 approved（此处直接模拟审核通过）。
 */
export interface MockReview {
  id: number
  spuId: number
  rating: number
  title: string | null
  content: string
  customerNickname: string | null
  createdAt: string
  helpfulCount: number
  isVerified: boolean
}

export const MOCK_REVIEWS: MockReview[] = [
  {
    id: 1,
    spuId: 101,
    rating: 5,
    title: 'Best wig I have ever owned',
    content: 'The lace melted perfectly and the hair is soft and true to length. Zero glue needed, exactly as described.',
    customerNickname: 'Jasmine M.',
    createdAt: '2026-10-12T10:00:00Z',
    helpfulCount: 12,
    isVerified: true,
  },
  {
    id: 2,
    spuId: 101,
    rating: 4,
    title: 'Great lace, minor shedding',
    content: 'Very natural hairline and comfortable cap. A little shedding on the first brush but overall great value.',
    customerNickname: 'Amara',
    createdAt: '2026-10-02T14:30:00Z',
    helpfulCount: 4,
    isVerified: true,
  },
  {
    id: 3,
    spuId: 101,
    rating: 5,
    title: null,
    content: 'Fast shipping and the HD lace is invisible. Will buy again.',
    customerNickname: 'Tiana',
    createdAt: '2026-09-20T09:15:00Z',
    helpfulCount: 3,
    isVerified: false,
  },
  {
    id: 4,
    spuId: 102,
    rating: 5,
    title: 'Deep wave is gorgeous',
    content: 'The deep wave pattern holds beautifully after washing. 200% density is thick and full.',
    customerNickname: 'Denise',
    createdAt: '2026-10-08T11:00:00Z',
    helpfulCount: 8,
    isVerified: true,
  },
  {
    id: 5,
    spuId: 201,
    rating: 4,
    title: 'Cute summer dress',
    content: 'Lightweight and true to size. The fabric is a bit thin but perfect for summer.',
    customerNickname: 'Kayla',
    createdAt: '2026-09-28T16:45:00Z',
    helpfulCount: 2,
    isVerified: true,
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

/**
 * 首页 Banner mock（营销首屏 + 次屏）。
 * 真实模式走 BFF 直通 /storefront/v1/cms/banners；mock 模式回退静态 hero（首页已处理空数组）。
 */
export const MOCK_BANNERS = {
  hero: [
    {
      id: 1,
      position: 'hero',
      title: 'HD Lace, Invisible Hairline',
      subtitle: 'Glueless wigs that blend seamlessly — shop the new HD lace collection.',
      linkUrl: '/c/lace-wigs',
      buttonLabel: 'Shop Lace Wigs',
      image: '/img/banners/hero-hd-lace.jpg',
      sortOrder: 10,
    },
    {
      id: 2,
      position: 'hero',
      title: 'Body Wave Bestsellers',
      subtitle: 'Soft, bouncy waves with pre-plucked natural hairline.',
      linkUrl: '/c/body-wave',
      buttonLabel: 'Shop Body Wave',
      image: '/img/banners/hero-body-wave.jpg',
      sortOrder: 5,
    },
  ],
  secondary: [
    {
      id: 3,
      position: 'secondary',
      title: 'New Season Apparel',
      subtitle: 'Coordinate your look with our latest drops.',
      linkUrl: '/c/apparel',
      buttonLabel: 'Shop Apparel',
      image: '/img/banners/secondary-apparel.jpg',
      sortOrder: 10,
    },
    {
      id: 4,
      position: 'secondary',
      title: 'Wig Care Essentials',
      subtitle: 'Shampoos, deep conditioners, and lace glue — everything you need.',
      linkUrl: '/c/care',
      buttonLabel: 'Shop Care',
      image: '/img/banners/secondary-care.jpg',
      sortOrder: 5,
    },
  ],
}

/**
 * FAQ mock 兜底（真实模式走 BFF 直通 /storefront/v1/cms/faqs，复用 articles 表 tags 含 'faq'）
 * 结构对齐 server 端 cmsService.listFaqs 返回：question/answer/shortAnswer/category。
 */
export interface MockFaq {
  question: string
  answer: string
  shortAnswer: string
  category: string
  slug: string
}

export const MOCK_FAQS: MockFaq[] = [
  {
    question: 'How long does shipping take?',
    answer: '<p>Standard shipping takes 5-7 business days within the US. Expedited options (2-3 days) are available at checkout.</p>',
    shortAnswer: '5-7 business days standard; 2-3 days expedited.',
    category: 'shipping',
    slug: 'faq-shipping-time',
  },
  {
    question: 'What is your return policy?',
    answer: '<p>Unopened items can be returned within 30 days of delivery. Opened hair products are final sale for hygiene reasons.</p>',
    shortAnswer: '30 days for unopened items; opened hair products are final sale.',
    category: 'returns',
    slug: 'faq-return-policy',
  },
  {
    question: 'How do I choose the right wig size?',
    answer: '<p>Measure your head circumference at the hairline. Most wigs fit 21.5"-22.5". See our <a href="/size-guide">size guide</a> for details.</p>',
    shortAnswer: 'Measure head circumference; most fit 21.5-22.5 inches.',
    category: 'sizing',
    slug: 'faq-wig-sizing',
  },
  {
    question: 'Are the wigs human hair or synthetic?',
    answer: '<p>Our premium collection is 100% human hair (Remy). We also offer heat-resistant synthetic options clearly labeled on each product.</p>',
    shortAnswer: 'Premium = 100% human hair; synthetic options are labeled.',
    category: 'product',
    slug: 'faq-hair-type',
  },
  {
    question: 'Do you ship internationally?',
    answer: '<p>Yes, we ship to over 40 countries. International orders typically arrive in 7-14 business days and may incur customs duties.</p>',
    shortAnswer: 'Yes, to 40+ countries; 7-14 business days, duties may apply.',
    category: 'shipping',
    slug: 'faq-international-shipping',
  },
]
