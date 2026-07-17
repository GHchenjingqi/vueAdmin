/**
 * 会话与动态路由初始化
 *
 * 必须在渲染 Layout / 侧边栏之前完成「菜单拉取 + 动态路由注册」，
 * 否则用户点击菜单时对应路由尚未注册，会命中 catch-all（旧逻辑跳转首页 / 新逻辑 404）。
 *
 * 设计为幂等：重复调用不会重复注册路由（addDynamicRoutes 内部已去重）。
 */
import { pinia } from '@/stores/pinia'
import { useUserStore } from '@/stores/userStore'
import { useMenuStore } from '@/stores/menuStore'
import { addDynamicRoutes, tryRestorePath } from '@/router/dynamicRoutes'
import type { Menu } from '@/types/api'

/**
 * 拉取菜单并注册动态路由
 * @returns 是否成功注册（菜单非空）
 */
export async function initDynamicRoutes(): Promise<boolean> {
  const userStore = useUserStore(pinia)
  const menuStore = useMenuStore(pinia)

  // 未登录时无需加载菜单与动态路由
  if (!userStore.isLoggedIn) return false

  await menuStore.fetchMenus()
  const menus = menuStore.menuTree
  if (!menus || menus.length === 0) return false

  addDynamicRoutes(menus as Menu[])
  await tryRestorePath()
  return true
}
