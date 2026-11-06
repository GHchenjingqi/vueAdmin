import type { RouteRecordRaw } from 'vue-router'

/**
 * 多语言 locale 路由前缀（P5-T01）。
 *
 * 为全部页面路由添加「可选」首段 `:locale(en-US|zh-CN)?`（en-US / zh-CN，见 shared/i18n）。
 * - `/cart`、`/zh-CN/cart`、`/en-US/cart` 均匹配同一页面，locale 作为 route.params.locale 暴露
 * - 首页 `/` 与 `/zh-CN/` 等价
 * - 不破坏既有裸路径（前缀可选），客户端/SSR 一致（SSR 不再依赖 URL 改写）
 */
const LOCALE_SEG = ':locale(en-US|zh-CN)?'

export default {
  routes(routes: RouteRecordRaw[]) {
    return routes.map((r) => {
      if (r.path === '/' || r.path === '') {
        return { ...r, path: `/${LOCALE_SEG}` }
      }
      // 已带参数/子路径：在开头插入可选 locale 段
      return { ...r, path: `/${LOCALE_SEG}${r.path}` }
    })
  },
}
