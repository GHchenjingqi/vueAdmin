import { MOCK_CATEGORIES, MOCK_PRODUCTS } from '@shared/mock/fixtures'

/**
 * sitemap（P2-T10）：只收录 canonical 且允许索引的 URL（首页/集合/商品）。
 * 真实目录优先（经 /api/catalog BFF 透传后台），后台不可达或为空时回退 mock fixtures。
 * 不含 noindex / 私有 / 参数页。
 */
export default defineEventHandler(async (event) => {
  const siteUrl = useRuntimeConfig().public.siteUrl as string

  let urls: string[] = []
  try {
    const [cats, prods] = await Promise.all([
      $fetch<{ categories: { slug: string }[] }>('/api/catalog/categories'),
      $fetch<{ list: { slug: string }[]; total: number }>('/api/catalog/products?pageSize=60'),
    ])
    const catUrls = (cats.categories ?? []).map((c) => `/c/${c.slug}`)
    const prodUrls = (prods.list ?? []).map((p) => `/products/${p.slug}`)
    urls = ['/', '/blog', ...catUrls, ...prodUrls]
    if (urls.length <= 2) throw new Error('empty catalog')
  } catch (err) {
    console.error('[sitemap] real source failed, fallback to mock:', err instanceof Error ? err.message : err)
    urls = ['/', '/blog', ...MOCK_CATEGORIES.map((c) => `/c/${c.slug}`), ...MOCK_PRODUCTS.map((p) => `/products/${p.slug}`)]
  }

  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + urls.map((u) => `  <url><loc>${siteUrl}${u}</loc></url>`).join('\n') + '\n</urlset>'

  setResponseHeader(event, 'content-type', 'application/xml')
  return xml
})
