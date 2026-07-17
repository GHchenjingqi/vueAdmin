/**
 * Pinia Stores - 统一导出入口
 *
 * 使用方式：
 * ```ts
 * import { useUserStore, useAppStore } from '@/stores'
 * const userStore = useUserStore()
 * const appStore = useAppStore()
 * ```
 *
 * 子 Store 可直接按需导入，减少不必要的状态绑定：
 * ```ts
 * import { useThemeStore } from '@/stores'
 * const themeStore = useThemeStore()
 * ```
 */
export { useAppStore } from './appStore'
export { useThemeStore } from './themeStore'
export { useLayoutStore } from './layoutStore'
export { useLocaleStore } from './localeStore'
export { useSiteStore } from './siteStore'
export { useUserStore } from './userStore'
export { useMenuStore } from './menuStore'
export { useSettingStore } from './settingStore'
export { useNotificationStore } from './notificationStore'
