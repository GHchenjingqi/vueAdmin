import { fileURLToPath } from 'node:url'

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: false },
  modules: ['@nuxtjs/tailwindcss'],
  alias: {
    '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
  },
  app: {
    head: {
      htmlAttrs: { lang: 'en' },
      // PLAN 5.4：titleTemplate 不再硬编码站点名。
      // 由 useSeo / layout 用后端下发的 siteName 动态设置（见 plugins/site-head.ts）。
      meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1' }],
    },
  },
  runtimeConfig: {
    // 服务端私有：现有后台（vue-admin server/，HTTPS 自签名 dev 证书）。币种不得进环境变量（P1-T03），一律来自 /api/store-config。
    apiBase: process.env.NUXT_API_BASE || 'https://127.0.0.1:5173',
    // 商务接口数据源：auto（默认，real 优先 + 网络级失败回退 mock）/ real / mock
    commerceSource: process.env.NUXT_COMMERCE_SOURCE || 'auto',
    public: {
      siteUrl: process.env.NUXT_PUBLIC_SITE_URL || 'http://localhost:3000',
      // P4-T10：GA4 测量 ID（空=仅 dataLayer；analytics 同意后才加载脚本）
      ga4MeasurementId: process.env.NUXT_PUBLIC_GA4_MEASUREMENT_ID || '',
    },
  },
  nitro: {
    compressPublicAssets: true,
    // P2-T13 缓存分层（C8：含币种 HTML TTL ≤60s；私有页 no-store）
    routeRules: {
      '/': { headers: { 'cache-control': 'public, max-age=30, stale-while-revalidate=30' } },
      '/c/**': { headers: { 'cache-control': 'public, max-age=30, stale-while-revalidate=30' } },
      '/products/**': { headers: { 'cache-control': 'public, max-age=30, stale-while-revalidate=30' } },
      '/policies/**': { headers: { 'cache-control': 'public, max-age=300' } },
      '/blog/**': { headers: { 'cache-control': 'public, max-age=300' } },
      '/cart': { headers: { 'cache-control': 'private, no-store' } },
      '/checkout/**': { headers: { 'cache-control': 'private, no-store' } },
      '/account/**': { headers: { 'cache-control': 'private, no-store' } },
      // P4-T04：轨迹页 URL 含访问凭证，不进 CDN/公共缓存
      '/track': { headers: { 'cache-control': 'private, no-store' } },
      '/search': { headers: { 'cache-control': 'private, max-age=0' } },
    },
  },
  typescript: { strict: true },
})
