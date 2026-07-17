/**
 * 路由组件预加载工具
 *
 * 策略：
 * 1. 用户 hover 菜单项时，预加载对应的页面组件 chunk
 * 2. 导航完成前，预加载兄弟路由（同层级其他菜单）
 * 3. 已预加载过的组件会被缓存，避免重复请求
 */
import type { Router, RouteRecordRaw } from 'vue-router'

const preloaded = new Set<string>()

function getComponentLoader(route: RouteRecordRaw): (() => Promise<unknown>) | null {
  const comp = route.components?.default ?? route.component
  if (typeof comp === 'function') return comp as () => Promise<unknown>
  return null
}

function preloadComponent(loader: () => Promise<unknown>): void {
  Promise.resolve(loader()).catch(() => {})
}

/**
 * 根据路径预加载对应路由组件
 */
export function preloadRoute(router: Router, path: string): void {
  if (preloaded.has(path)) return
  preloaded.add(path)

  const resolved = router.resolve(path)
  for (const match of resolved.matched) {
    const loader = getComponentLoader(match)
    if (loader) preloadComponent(loader)
  }
}

/**
 * 预加载兄弟路由（同父路由下的其他子路由）
 * 在导航完成前调用，预加载用户可能跳转的相邻页面
 */
export function preloadSiblingRoutes(router: Router, toPath: string): void {
  const to = router.resolve(toPath)
  if (to.matched.length < 2) return

  const parentRoute = to.matched[to.matched.length - 2]
  if (!parentRoute.children) return

  const maxPreload = 3
  let count = 0

  for (const child of parentRoute.children) {
    if (count >= maxPreload) break
    const childPath = child.path.startsWith('/') ? child.path : `${parentRoute.path}/${child.path}`.replace(/\/+/g, '/')
    const normalized = childPath || '/'
    if (normalized === toPath || preloaded.has(normalized)) continue
    preloaded.add(normalized)

    const loader = getComponentLoader(child)
    if (loader) {
      preloadComponent(loader)
      count++
    }
  }
}
