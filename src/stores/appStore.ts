/**
 * App Store - 全局 UI 状态管理（胶水层）
 *
 * 职责：
 * 统一对外暴露子 Store 的属性和方法，保持向后兼容
 *
 * 内部实际委托给：
 * - useThemeStore（主题）
 * - useLayoutStore（布局/侧边栏/字体）
 * - useLocaleStore（国际化语言）
 * - useSiteStore（站点信息/页面标题）
 */
import { defineStore } from 'pinia'
import { computed } from 'vue'
import { useThemeStore, presetPrimaryColors } from './themeStore'
import {
  useLayoutStore,
  fontSizeMap,
  layoutModeNames,
  navModeNames,
  SIDEBAR_WIDTH_MIN,
  SIDEBAR_WIDTH_MAX,
  SIDEBAR_WIDTH_DEFAULT,
  SIDEBAR_COLLAPSED_WIDTH,
} from './layoutStore'
import { useLocaleStore } from './localeStore'
import { useSiteStore } from './siteStore'

// 重新导出类型和常量（向后兼容）
export type { LayoutMode, NavMode, FontSizeScale } from './layoutStore'
export type { LocaleKey } from './localeStore'
export { fontSizeMap, layoutModeNames, navModeNames, presetPrimaryColors, SIDEBAR_WIDTH_MIN, SIDEBAR_WIDTH_MAX, SIDEBAR_WIDTH_DEFAULT, SIDEBAR_COLLAPSED_WIDTH }

export const useAppStore = defineStore('app', () => {
  const themeStore = useThemeStore()
  const layoutStore = useLayoutStore()
  const localeStore = useLocaleStore()
  const siteStore = useSiteStore()

  // ==================== State 代理 ====================

  // --- 主题 ---
  const theme = computed(() => themeStore.theme)
  const primaryColor = computed(() => themeStore.primaryColor)

  // --- 侧边栏 ---
  const sidebarCollapsed = computed(() => layoutStore.sidebarCollapsed)
  const sidebarWidth = computed(() => layoutStore.sidebarWidth)

  // --- 布局与导航 ---
  const layoutMode = computed(() => layoutStore.layoutMode)
  const navMode = computed(() => layoutStore.navMode)

  // --- 字体与语言 ---
  const fontSize = computed(() => layoutStore.fontSize)
  const locale = computed(() => localeStore.locale)

  // --- 全局加载 & 页面标题 ---
  const globalLoading = computed(() => layoutStore.globalLoading)
  const pageTitle = computed(() => siteStore.pageTitle)

  // --- 站点信息 ---
  const siteTitle = computed(() => siteStore.siteTitle)
  const siteLogo = computed(() => siteStore.siteLogo)
  const siteFavicon = computed(() => siteStore.siteFavicon)
  const siteDescription = computed(() => siteStore.siteDescription)
  const siteKeywords = computed(() => siteStore.siteKeywords)

  // ==================== Computed ====================

  const currentFontSize = computed(() => layoutStore.currentFontSize)

  // ==================== Actions ====================

  // 主题
  function toggleTheme(): void {
    themeStore.toggleTheme()
  }
  function setTheme(t: 'light' | 'dark'): void {
    themeStore.setTheme(t)
  }
  function setPrimaryColor(color: string): void {
    themeStore.setPrimaryColor(color)
  }
  function applyPrimaryColorToDom(color: string): void {
    themeStore.applyPrimaryColorToDom(color)
  }

  // 侧边栏
  function toggleSidebar(): void {
    layoutStore.toggleSidebar()
  }
  function setSidebarCollapsed(collapsed: boolean): void {
    layoutStore.setSidebarCollapsed(collapsed)
  }
  function setSidebarWidth(width: number): void {
    layoutStore.setSidebarWidth(width)
  }

  // 布局 & 导航
  function setLayoutMode(mode: Parameters<typeof layoutStore.setLayoutMode>[0]): void {
    layoutStore.setLayoutMode(mode)
  }
  function setNavMode(mode: Parameters<typeof layoutStore.setNavMode>[0]): void {
    layoutStore.setNavMode(mode)
  }

  // 字体 & 语言
  function setFontSize(size: Parameters<typeof layoutStore.setFontSize>[0]): void {
    layoutStore.setFontSize(size)
  }
  function setLocale(l: Parameters<typeof localeStore.setLocale>[0]): void {
    localeStore.setLocale(l)
  }

  // 全局加载
  function setGlobalLoading(loading: boolean): void {
    layoutStore.setGlobalLoading(loading)
  }

  // 页面标题 & 站点信息
  function setPageTitle(title: string): void {
    siteStore.setPageTitle(title)
  }
  function setSiteInfo(info: Parameters<typeof siteStore.setSiteInfo>[0]): void {
    siteStore.setSiteInfo(info)
  }

  /**
   * 重置所有个性化设置为默认值
   */
  function resetPersonalization(): void {
    themeStore.reset()
    layoutStore.reset()
    localeStore.reset()
  }

  /**
   * 初始化 DOM 配置
   */
  function ensureInitialized(): void {
    themeStore.initDom()
    layoutStore.initDom()
  }

  return {
    // State
    theme,
    primaryColor,
    sidebarCollapsed,
    sidebarWidth,
    layoutMode,
    navMode,
    fontSize,
    locale,
    globalLoading,
    pageTitle,
    siteTitle,
    siteLogo,
    siteFavicon,
    siteDescription,
    siteKeywords,
    // Computed
    currentFontSize,
    // Actions
    toggleTheme,
    setTheme,
    setPrimaryColor,
    applyPrimaryColorToDom,
    toggleSidebar,
    setSidebarCollapsed,
    setSidebarWidth,
    setLayoutMode,
    setNavMode,
    setFontSize,
    setLocale,
    setGlobalLoading,
    setPageTitle,
    setSiteInfo,
    resetPersonalization,
    ensureInitialized,
  }
})
