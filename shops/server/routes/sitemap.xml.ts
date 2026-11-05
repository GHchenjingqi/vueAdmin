import { MOCK_CATEGORIES, MOCK_PRODUCTS } from '@shared/mock/fixtures'

/**
 * sitemap（P2-T10）：只收录 canonical 且允许索引的 URL（首页/集合/商品）；
 * 不含 noindex / 私有 / 参数页。后端阶段切换为读取真实目录接口。
 */
export default defineEventHandler((event) => {
  const siteUrl = useRuntimeConfig().public.siteUrl as string
  const urls: string[] = ['/', '/blog', ...MOCK_CATEGORIES.map((c) => `/c/${c.slug}`), ...MOCK_PRODUCTS.map((p) => `/products/${p.slug}`)]

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${siteUrl}${u}</loc></url>`).join('\n')}
</urlset>`

  setResponseHeader(event, 'content-type', 'application/xml')
  return xml
})
