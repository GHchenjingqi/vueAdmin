/**
 * 动态路由管理
 *
 * 功能：
 * 1. 根据后端菜单配置动态注册路由
 * 2. 页面刷新后恢复路径
 * 3. 查找第一个可用菜单作为默认首页
 *
 * 配合 Pinia menuStore 使用，替代模块级变量管理。
 */
import router, { savedPath } from './index'
import { pinia } from '@/stores/pinia'
import { useMenuStore } from '@/stores/menuStore'
import type { Menu } from '@/types/api'

/** 已注册的动态路由名称集合，用于避免重复注册 */
const addedRoutes: Set<string> = new Set()

/** 所有视图页面的 Vite glob 导入 */
const viewModules: Record<string, () => Promise<unknown>> = import.meta.glob('/src/views/**/*.vue')

/**
 * 递归注册动态路由
 * @param menus - 菜单树
 */
export function addDynamicRoutes(menus: Menu[]): void {
  const menuStore = useMenuStore(pinia)

  for (const menu of menus) {
    if (menu.type === 'M' && menu.component && menu.status === 1) {
      const key = `/src/${menu.component}`
      const componentFn = viewModules[key]
      if (componentFn && menu.path) {
        const routeName = menu.path.replace(/^\//, '')
        if (!addedRoutes.has(routeName)) {
          addedRoutes.add(routeName)
          router.addRoute('Layout', {
            path: routeName,
            name: routeName,
            component: () => componentFn(),
            meta: { title: menu.name, hidden: menu.visible === false },
          })
        }
      } else {
        // 组件或路径缺失：记录告警，避免单条脏数据导致整棵菜单树失效。
        console.warn(`[dynamicRoutes] 跳过无效菜单: path=${menu.path}, component=${menu.component}, name=${menu.name}`)
      }
    }
    if (menu.children && menu.children.length) {
      addDynamicRoutes(menu.children)
    }
  }

  // 同步到 MenuStore
  menuStore.setMenus(menus)
}

/**
 * 页面刷新后尝试恢复路径。
 * 若 savedPath 未匹配到任何已注册路由（如动态路由尚未注册完成），
 * 则回退到第一个可用菜单路径，避免停留在空白首页或命中 404。
 */
export async function tryRestorePath(): Promise<boolean> {
  if (savedPath !== '/' && savedPath !== '/login') {
    const resolved = router.resolve(savedPath)
    if (resolved.matched.length > 0) {
      await router.replace(savedPath)
      return true
    }
  }
  const menuStore = useMenuStore(pinia)
  const first = menuStore.findFirstMenuPath()
  if (first) {
    await router.replace(first)
    return true
  }
  return false
}

/**
 * 清理所有动态路由（用于热更新或登出）
 */
export function clearDynamicRoutes(): void {
  addedRoutes.clear()
}
