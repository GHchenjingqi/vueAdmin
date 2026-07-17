/**
 * Pinia 实例
 * 独立导出以便在非组件环境（Router Guards、API 层等）中使用
 *
 * 使用方式：
 * ```ts
 * import { pinia } from '@/stores/pinia'
 * import { useUserStore } from '@/stores'
 * const userStore = useUserStore(pinia)
 * ```
 *
 * 持久化策略（使用 pinia-plugin-persistedstate）：
 * - themeStore: 主题模式、主色 → localStorage
 * - layoutStore: 侧边栏、布局、导航、字体 → localStorage
 * - localeStore: 语言 → localStorage
 * - 其他 store 不持久化（如 userStore、siteStore 等）
 */
import { createPinia } from 'pinia'
import piniaPersistedstate from 'pinia-plugin-persistedstate'

export const pinia = createPinia()
pinia.use(piniaPersistedstate)
