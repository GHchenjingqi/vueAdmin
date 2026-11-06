import { randomUUID } from 'node:crypto'

/**
 * 多语言 locale 路由前缀（P5-T01）。
 *
 * 真实语言版本：en-US / zh-CN（见 shared/i18n/messages.ts locales）。
 * 页面路由经 app/router.options.ts 的 `:locale(en-US|zh-CN)?` 前缀匹配，
 * 因此 `/zh-CN/cart` 直接命中 cart 页面（SSR 与客户端一致，无需改写 URL）。
 * 本中间件只做两件事：
 * - 检测 URL 前缀并写 `store_locale` cookie + `x-store-locale` 响应头（SSR 首屏与后续请求可读）
 * - 将检测到的 locale 写入 event.context.locale（服务端组件可用）
 * 不处理 /api、/server、静态资源与 robots/sitemap。
 */
const LOCALES = ['en-US', 'zh-CN']

export default defineEventHandler((event) => {
  const path = getRequestURL(event).pathname
  // 仅页面请求；API/资源/控制文件不处理
  if (path.startsWith('/api/') || path.startsWith('/server/') || path === '/robots.txt' || path === '/sitemap.xml') return
  if (path.includes('.')) return // 静态文件

  const seg = path.split('/').filter(Boolean)[0]
  if (!LOCALES.includes(seg)) return

  event.context.locale = seg

  // 写 cookie + 响应头（客户端水合与后续请求可读；Nuxt locale.global 中间件也会同步）
  setCookie(event, 'store_locale', seg, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    httpOnly: false,
    sameSite: 'lax',
  })
  setResponseHeader(event, 'x-store-locale', seg)
  // 保留既有 requestId 约定（与 00-request-id 一致，缺失则补）
  if (!getHeader(event, 'x-request-id')) {
    setResponseHeader(event, 'x-request-id', randomUUID())
  }
})
