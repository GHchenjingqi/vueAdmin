import { MOCK_CATEGORIES, MOCK_PRODUCTS } from '@shared/mock/fixtures'

/**
 * sitemap（P2-T10 → PLAN 2.6）
 *
 * 只收录 canonical 且允许索引的 URL（首页/集合/商品）。真实目录优先（经 /api/catalog BFF
 * 透传后台），后台不可达或为空时回退 mock fixtures。
 *
 * 历史实现只取 `pageSize=60` 一页，商品数超过 60 后剩余商品静默不进 sitemap；
 * 且每个 `<url>` 只有 `<loc>`，缺少 SEO_SPEC 要求的 `<lastmod>`。
 * 现改为按 total 遍历全部分页，并输出 lastmod。
 */
const PAGE_SIZE = 60
/** 单个 sitemap 的 URL 上限（协议上限 50000，留余量便于排查） */
const MAX_URLS = 45000

interface SitemapEntry {
  loc: string
  lastmod?: string
}

export default defineEventHandler(async (event) => {
  const siteUrl = useRuntimeConfig().public.siteUrl as string

  let entries: SitemapEntry[] = []
  try {
    const cats = await $fetch<{ categories: { slug: string }[] }>('/api/catalog/categories')
    const catEntries: SitemapEntry[] = (cats.categories ?? []).filter((c) => c.slug).map((c) => ({ loc: `/c/${c.slug}` }))

    // 先取第一页拿 total，再按 total 遍历剩余页
    const first = await $fetch<{ list: { slug: string; updatedAt?: string }[]; total: number }>(
      `/api/catalog/products?page=1&pageSize=${PAGE_SIZE}`,
    )
    const total = Number(first.total ?? 0) || 0
    const prodEntries: SitemapEntry[] = (first.list ?? [])
      .filter((p) => p.slug)
      .map((p) => ({ loc: `/products/${p.slug}`, lastmod: p.updatedAt }))

    const pageCount = Math.ceil(total / PAGE_SIZE)
    for (let page = 2; page <= pageCount; page += 1) {
      if (prodEntries.length + catEntries.length >= MAX_URLS) break
      const next = await $fetch<{ list: { slug: string; updatedAt?: string }[] }>(
        `/api/catalog/products?page=${page}&pageSize=${PAGE_SIZE}`,
      )
      for (const p of next.list ?? []) {
        if (p.slug) prodEntries.push({ loc: `/products/${p.slug}`, lastmod: p.updatedAt })
      }
    }

    entries = [
      { loc: '/' },
      { loc: '/blog' },
      ...catEntries,
      ...prodEntries.slice(0, Math.max(0, MAX_URLS - catEntries.length - 2)),
    ]
    if (entries.length <= 2) throw new Error('empty catalog')
  } catch (err) {
    console.error('[sitemap] real source failed, fallback to mock:', err instanceof Error ? err.message : err)
    entries = [
      { loc: '/' },
      { loc: '/blog' },
      ...MOCK_CATEGORIES.map((c) => ({ loc: `/c/${c.slug}` })),
      ...MOCK_PRODUCTS.map((p) => ({ loc: `/products/${p.slug}` })),
    ]
  }

  const escapeXml = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const body = entries
    .map((e) => {
      const lastmod = e.lastmod ? `<lastmod>${new Date(e.lastmod).toISOString()}</lastmod>` : ''
      return `  <url><loc>${escapeXml(`${siteUrl}${e.loc}`)}</loc>${lastmod}</url>`
    })
    .join('\n')

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>`

  setResponseHeader(event, 'content-type', 'application/xml')
  return xml
})
