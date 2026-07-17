/**
 * Theme Store - 主题配置管理
 *
 * 职责：
 * - 主题模式（亮色/暗黑）
 * - 自定义主色
 * - CSS 变量应用到 DOM
 * - 配置持久化（使用 pinia-plugin-persistedstate）
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'

// 预设主色
export const presetPrimaryColors = [
  { name: '科技蓝', value: '#0081fa' },
  { name: '活力橙', value: '#fa8c16' },
  { name: '成功绿', value: '#52c41a' },
  { name: '警示红', value: '#f5222d' },
  { name: '青春紫', value: '#722ed1' },
  { name: '深邃青', value: '#13c2c2' },
  { name: '樱花粉', value: '#eb2f96' },
  { name: '雅黑', value: '#2f3a4a' },
]

/**
 * 将十六进制颜色调整明度
 * @param hex 十六进制颜色（如 #1890ff）
 * @param amount 调整量（-100 到 100，负值变暗）
 */
function adjustColorBrightness(hex: string, amount: number): string {
  const clean = hex.replace('#', '')
  const num = parseInt(
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean,
    16,
  )

  let r = (num >> 16) + amount
  let g = ((num >> 8) & 0x00ff) + amount
  let b = (num & 0x0000ff) + amount

  r = Math.max(0, Math.min(255, r))
  g = Math.max(0, Math.min(255, g))
  b = Math.max(0, Math.min(255, b))

  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '')
  const num = parseInt(
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean,
    16,
  )
  const r = (num >> 16) & 0xff
  const g = (num >> 8) & 0xff
  const b = num & 0xff
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export const useThemeStore = defineStore(
  'theme',
  () => {
    // ==================== State ====================

    /** 主题模式 */
    const theme = ref<'light' | 'dark'>('light')

    /** 主色（自定义品牌色） */
    const primaryColor = ref<string>('#1890ff')

    // ==================== Actions ====================

    const applyThemeAttribute = (t: 'light' | 'dark'): void => {
      if (t === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark')
      } else {
        document.documentElement.removeAttribute('data-theme')
      }
    }

    /** 切换主题（使用 View Transitions API，兼容 Element Plus 官网效果） */
    function toggleTheme(): void {
      const newTheme = theme.value === 'light' ? 'dark' : 'light'
      theme.value = newTheme

      if (document.startViewTransition) {
        // 设置动画方向标记，CSS 根据此属性决定 clip-path 起始/结束位置
        const direction = newTheme === 'dark' ? 'to-dark' : 'to-light'
        document.documentElement.setAttribute('data-vt-direction', direction)

        const transition = document.startViewTransition(() => {
          applyThemeAttribute(newTheme)
        })

        transition.finished.finally(() => {
          document.documentElement.removeAttribute('data-vt-direction')
        })
      } else {
        // 降级：不支持 View Transitions 的浏览器直接切换
        applyThemeAttribute(newTheme)
      }
    }

    /** 设置主题 */
    function setTheme(t: 'light' | 'dark'): void {
      theme.value = t

      if (document.startViewTransition) {
        const direction = t === 'dark' ? 'to-dark' : 'to-light'
        document.documentElement.setAttribute('data-vt-direction', direction)

        const transition = document.startViewTransition(() => {
          applyThemeAttribute(t)
        })

        transition.finished.finally(() => {
          document.documentElement.removeAttribute('data-vt-direction')
        })
      } else {
        applyThemeAttribute(t)
      }
    }

    /**
     * 设置主色（支持任意合法颜色值）
     * 同时同步到 CSS 变量和 Element Plus
     */
    function setPrimaryColor(color: string): void {
      if (!color || color === primaryColor.value) return
      primaryColor.value = color
      applyPrimaryColorToDom(color)
    }

    /**
     * 将主色及其衍生色应用到 DOM CSS 变量
     */
    function applyPrimaryColorToDom(color: string): void {
      if (!color) return
      const root = document.documentElement

      // 主色
      root.style.setProperty('--mainColor', color)
      root.style.setProperty('--el-color-primary', color)

      // 衍生色：light 系列（越浅数字越大）
      for (let i = 1; i <= 9; i++) {
        const lightColor = adjustColorBrightness(color, i * 12)
        root.style.setProperty(`--el-color-primary-light-${i}`, lightColor)
      }
      // 更亮的衍生色用于 hover 背景
      root.style.setProperty('--mainColor-light', adjustColorBrightness(color, 20))
      root.style.setProperty('--mainColor-lighter', adjustColorBrightness(color, 40))
      root.style.setProperty('--mainColor-bg', adjustColorBrightness(color, 90))
      root.style.setProperty('--mainColor-hover', hexToRgba(color, 0.3))

      // 深色系
      root.style.setProperty('--el-color-primary-dark-2', adjustColorBrightness(color, -15))
    }

    /**
     * 重置主题配置为默认值
     */
    function reset(): void {
      theme.value = 'light'
      primaryColor.value = '#1890ff'
      applyPrimaryColorToDom(primaryColor.value)
    }

    /**
     * 初始化：应用配置到 DOM
     */
    function initDom(): void {
      applyPrimaryColorToDom(primaryColor.value)
      if (theme.value === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark')
      } else {
        document.documentElement.removeAttribute('data-theme')
      }
    }

    return {
      // State
      theme,
      primaryColor,
      // Actions
      toggleTheme,
      setTheme,
      setPrimaryColor,
      applyPrimaryColorToDom,
      reset,
      initDom,
    }
  },
  {
    persist: {
      key: 'theme',
      storage: localStorage,
      pick: ['theme', 'primaryColor'],
    },
  },
)
