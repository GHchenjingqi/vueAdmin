/**
 * 路由组件缓存管理
 *
 * 策略：
 * - 默认缓存已访问过的路由组件（返回不重新渲染）
 * - 支持配置 keepAlive: false 禁止缓存
 * - 支持按需清除缓存（如编辑后强制刷新列表）
 */
import { ref, computed, nextTick } from 'vue'

// 缓存白名单（路由 name）
const cachedRoutes = ref<Set<string>>(new Set())

export function useKeepAlive() {
  function addCache(routeName: string): void {
    cachedRoutes.value.add(routeName)
  }

  function removeCache(routeName: string): void {
    cachedRoutes.value.delete(routeName)
  }

  // 清除缓存并立即重建（用于编辑后回到列表页面，强制刷新数据）
  async function refreshCache(routeName: string): Promise<void> {
    removeCache(routeName)
    await nextTick()
    addCache(routeName)
  }

  return {
    cachedRoutes: computed(() => [...cachedRoutes.value]),
    addCache,
    removeCache,
    refreshCache,
  }
}
