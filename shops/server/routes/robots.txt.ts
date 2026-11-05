/** robots（P2-T10）：不屏蔽重要页面；checkout/cart/account/api 屏蔽；声明 sitemap。 */
export default defineEventHandler((event) => {
  const siteUrl = useRuntimeConfig().public.siteUrl as string
  setResponseHeader(event, 'content-type', 'text/plain')
  return `User-agent: *
Allow: /
Disallow: /checkout
Disallow: /cart
Disallow: /account
Disallow: /api

Sitemap: ${siteUrl}/sitemap.xml
`
})
