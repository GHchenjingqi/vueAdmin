/**
 * Layout Store - 布局配置管理
 *
 * 职责：
 * - 侧边栏折叠状态与宽度
 * - 布局模式（经典/顶部/混合）
 * - 导航模式（面包屑/标签页）
 * - 字体大小缩放
 * - 配置持久化（使用 pinia-plugin-persistedstate）
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export type LayoutMode = 'classic' | 'top' | 'mixed'
export type NavMode = 'breadcrumb' | 'tabs'
export type FontSizeScale = 'small' | 'medium' | 'large' | 'xlarge'

// 字体大小映射（相对于 14px 基准）
export const fontSizeMap: Record<FontSizeScale, number> = {
  small: 13,
  medium: 14,
  large: 15,
  xlarge: 16,
}

// 布局模式中文名称
export const layoutModeNames: Record<LayoutMode, string> = {
  classic: '经典布局',
  top: '顶部布局',
  mixed: '混合布局',
}

// 导航模式中文名称
export const navModeNames: Record<NavMode, string> = {
  breadcrumb: '面包屑导航',
  tabs: '标签页导航',
}

// 侧边栏宽度范围
export const SIDEBAR_WIDTH_MIN = 160
export const SIDEBAR_WIDTH_MAX = 280
export const SIDEBAR_WIDTH_DEFAULT = 230
export const SIDEBAR_COLLAPSED_WIDTH = 64

export const useLayoutStore = defineStore(
  'layout',
  () => {
    // ==================== State ====================

    /** 侧边栏是否折叠 */
    const sidebarCollapsed = ref(false)

    /** 侧边栏展开宽度（px，160-280 之间） */
    const sidebarWidth = ref<number>(SIDEBAR_WIDTH_DEFAULT)

    /** 布局模式 */
    const layoutMode = ref<LayoutMode>('classic')

    /** 导航模式 */
    const navMode = ref<NavMode>('breadcrumb')

    /** 字体大小缩放 */
    const fontSize = ref<FontSizeScale>('medium')

    /** 全局加载状态 */
    const globalLoading = ref(false)

    // ==================== Computed ====================

    /** 当前实际字体大小（px） */
    const currentFontSize = computed(() => fontSizeMap[fontSize.value])

    // ==================== Actions ====================

    /** 切换侧边栏折叠 */
    function toggleSidebar(): void {
      sidebarCollapsed.value = !sidebarCollapsed.value
    }

    /** 设置侧边栏折叠 */
    function setSidebarCollapsed(collapsed: boolean): void {
      sidebarCollapsed.value = collapsed
    }

    /** 设置侧边栏宽度 */
    function setSidebarWidth(width: number): void {
      const clamped = Math.max(SIDEBAR_WIDTH_MIN, Math.min(SIDEBAR_WIDTH_MAX, Math.round(width)))
      sidebarWidth.value = clamped
      document.documentElement.style.setProperty('--sidebar-width', `${clamped}px`)
    }

    /** 设置布局模式 */
    function setLayoutMode(mode: LayoutMode): void {
      layoutMode.value = mode
    }

    /** 设置导航模式 */
    function setNavMode(mode: NavMode): void {
      navMode.value = mode
    }

    /** 设置字体大小 */
    function setFontSize(size: FontSizeScale): void {
      fontSize.value = size
      document.documentElement.style.fontSize = `${fontSizeMap[size]}px`
      document.documentElement.setAttribute('data-font-scale', size)

      // 同步更新 Element Plus 的字体大小 CSS 变量
      // Element Plus 基准值（medium 14px）：
      //   --el-font-size-extra-large: 20px
      //   --el-font-size-large:      18px
      //   --el-font-size-medium:     16px
      //   --el-font-size-base:       14px
      //   --el-font-size-small:      13px
      //   --el-font-size-extra-small: 12px
      // 根据当前 scale 与基准的差值（offset）统一偏移
      const elBase = 14
      const offset = fontSizeMap[size] - elBase
      const elSizes: Record<string, number> = {
        '--el-font-size-extra-large': 20 + offset,
        '--el-font-size-large': 18 + offset,
        '--el-font-size-medium': 16 + offset,
        '--el-font-size-base': 14 + offset,
        '--el-font-size-small': 13 + offset,
        '--el-font-size-extra-small': 12 + offset,
      }
      for (const [prop, val] of Object.entries(elSizes)) {
        document.documentElement.style.setProperty(prop, `${val}px`)
      }
    }

    /** 设置全局加载状态 */
    function setGlobalLoading(loading: boolean): void {
      globalLoading.value = loading
    }

    /**
     * 重置布局配置为默认值
     */
    function reset(): void {
      sidebarCollapsed.value = false
      sidebarWidth.value = SIDEBAR_WIDTH_DEFAULT
      layoutMode.value = 'classic'
      navMode.value = 'breadcrumb'
      fontSize.value = 'medium'
      setFontSize(fontSize.value)
      setSidebarWidth(sidebarWidth.value)
    }

    /**
     * 初始化：应用配置到 DOM
     */
    function initDom(): void {
      document.documentElement.style.setProperty('--sidebar-width', `${sidebarWidth.value}px`)
      setFontSize(fontSize.value)
    }

    return {
      // State
      sidebarCollapsed,
      sidebarWidth,
      layoutMode,
      navMode,
      fontSize,
      globalLoading,
      // Computed
      currentFontSize,
      // Actions
      toggleSidebar,
      setSidebarCollapsed,
      setSidebarWidth,
      setLayoutMode,
      setNavMode,
      setFontSize,
      setGlobalLoading,
      reset,
      initDom,
    }
  },
  {
    persist: {
      key: 'layout',
      storage: localStorage,
      pick: ['sidebarCollapsed', 'sidebarWidth', 'layoutMode', 'navMode', 'fontSize'],
    },
  },
)
