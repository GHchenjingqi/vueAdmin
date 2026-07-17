/**
 * Menu Store - 菜单与动态路由管理
 *
 * 职责：
 * - 缓存后端菜单树
 * - 管理动态路由注册
 * - 查找当前激活菜单
 * - 替代模块级变量和散落的 localStorage 读写
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { menuApi } from '@/api/menu'
import type { Menu } from '@/types/api'

export const useMenuStore = defineStore('menu', () => {
  // ==================== State ====================

  /** 完整菜单树 */
  const menuTree = ref<Menu[]>([])

  /** 拍平的菜单列表（不含 children 嵌套） */
  const flatMenus = ref<Menu[]>([])

  /** 菜单加载状态 */
  const loading = ref(false)

  /** 当前激活的菜单路径 */
  const activePath = ref('')

  // ==================== Getters ====================

  /** 是否有菜单数据 */
  const hasMenus = computed(() => menuTree.value.length > 0)

  /** 获取可见的顶层菜单 */
  const visibleMenus = computed(() => {
    return menuTree.value.filter((m) => m.status === 1 && m.visible !== false)
  })

  /** 获取当前菜单的标题 */
  const currentMenuTitle = computed(() => {
    const menu = flatMenus.value.find((m) => m.path === activePath.value)
    return menu?.name || ''
  })

  /** 获取按钮级权限映射 { permission: true } */
  const permissionMap = computed<Record<string, boolean>>(() => {
    const map: Record<string, boolean> = {}
    for (const menu of flatMenus.value) {
      if (menu.type === 'F' && menu.permission) {
        map[menu.permission] = true
      }
    }
    return map
  })

  /** 检查是否有某个按钮权限 */
  function hasPermission(perm: string): boolean {
    return permissionMap.value[perm] === true
  }

  // ==================== Actions ====================

  /**
   * 从后端获取菜单树
   */
  async function fetchMenus(): Promise<void> {
    if (loading.value) return
    loading.value = true
    try {
      const res = await menuApi.getTree()
      menuTree.value = res.data || []
      flatMenus.value = flattenMenus(menuTree.value)
    } catch (err) {
      console.error('获取菜单失败:', err)
      menuTree.value = []
      flatMenus.value = []
    } finally {
      loading.value = false
    }
  }

  /**
   * 设置菜单树（由动态路由注册后调用）
   */
  function setMenus(menus: Menu[]): void {
    menuTree.value = menus
    flatMenus.value = flattenMenus(menus)
  }

  /**
   * 设置当前激活路径
   */
  function setActivePath(path: string): void {
    activePath.value = path
  }

  /**
   * 查找第一个可用菜单路径（用于默认首页跳转）
   */
  function findFirstMenuPath(): string | null {
    return findFirstPath(menuTree.value)
  }

  /**
   * 查找菜单的父级路径链
   */
  function findParentPaths(path: string): string[] {
    const paths: string[] = []
    const menu = flatMenus.value.find((m) => m.path === path)
    if (menu) {
      findParentRecursive(menuTree.value, menu.id, paths)
    }
    return paths
  }

  /**
   * 清理菜单（登出时调用）
   */
  function clearMenus(): void {
    menuTree.value = []
    flatMenus.value = []
    activePath.value = ''
  }

  // ==================== 内部辅助函数 ====================

  /** 递归拍平菜单树 */
  function flattenMenus(menus: Menu[]): Menu[] {
    const result: Menu[] = []
    for (const menu of menus) {
      result.push(menu)
      if (menu.children?.length) {
        result.push(...flattenMenus(menu.children))
      }
    }
    return result
  }

  /** 递归查找第一个可用路径 */
  function findFirstPath(menus: Menu[]): string | null {
    for (const menu of menus) {
      if (menu.type === 'M' && menu.status === 1 && menu.path) {
        return menu.path
      }
      if (menu.children?.length) {
        const found = findFirstPath(menu.children)
        if (found) return found
      }
    }
    return null
  }

  /** 递归查找父级 ID */
  function findParentRecursive(menus: Menu[], childId: number, result: string[]): boolean {
    for (const menu of menus) {
      if (menu.children?.some((c) => c.id === childId)) {
        result.unshift(menu.path || '')
        return true
      }
      if (menu.children?.length && findParentRecursive(menu.children, childId, result)) {
        result.unshift(menu.path || '')
        return true
      }
    }
    return false
  }

  return {
    // State
    menuTree,
    flatMenus,
    loading,
    activePath,
    // Getters
    hasMenus,
    visibleMenus,
    currentMenuTitle,
    permissionMap,
    hasPermission,
    // Actions
    fetchMenus,
    setMenus,
    setActivePath,
    findFirstMenuPath,
    findParentPaths,
    clearMenus,
  }
})
