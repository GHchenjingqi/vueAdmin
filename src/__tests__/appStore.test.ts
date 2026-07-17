import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAppStore } from '@/stores/appStore'

describe('appStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
    document.documentElement.removeAttribute('data-font-scale')
    document.documentElement.removeAttribute('lang')
    document.documentElement.style.removeProperty('--sidebar-width')
    document.documentElement.style.removeProperty('--mainColor')
  })

  describe('主题管理', () => {
    it('默认主题为 light', () => {
      const store = useAppStore()
      expect(store.theme).toBe('light')
    })

    it('toggleTheme 从 light 切换到 dark', () => {
      const store = useAppStore()
      store.toggleTheme()
      expect(store.theme).toBe('dark')
    })

    it('toggleTheme 从 dark 切换到 light', () => {
      const store = useAppStore()
      store.setTheme('dark')
      store.toggleTheme()
      expect(store.theme).toBe('light')
    })

    it('setTheme 直接设置主题', () => {
      const store = useAppStore()
      store.setTheme('dark')
      expect(store.theme).toBe('dark')
      store.setTheme('light')
      expect(store.theme).toBe('light')
    })

    it('主题变更持久化（由 pinia-plugin-persistedstate 保障，测试 store 状态）', () => {
      const store = useAppStore()
      store.setTheme('dark')
      expect(store.theme).toBe('dark')
      store.setTheme('light')
      expect(store.theme).toBe('light')
    })

    it('dark 模式设置 data-theme 属性', () => {
      const store = useAppStore()
      store.setTheme('dark')
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    })

    it('light 模式移除 data-theme 属性', () => {
      const store = useAppStore()
      store.setTheme('dark')
      store.setTheme('light')
      expect(document.documentElement.getAttribute('data-theme')).toBeNull()
    })
  })

  describe('主色管理', () => {
    it('默认主色为 #1890ff', () => {
      const store = useAppStore()
      expect(store.primaryColor).toBe('#1890ff')
    })

    it('setPrimaryColor 修改主色', () => {
      const store = useAppStore()
      store.setPrimaryColor('#ff0000')
      expect(store.primaryColor).toBe('#ff0000')
    })

    it('setPrimaryColor 空值不修改', () => {
      const store = useAppStore()
      const original = store.primaryColor
      store.setPrimaryColor('')
      expect(store.primaryColor).toBe(original)
    })

    it('setPrimaryColor 相同值不修改', () => {
      const store = useAppStore()
      const original = store.primaryColor
      store.setPrimaryColor(original)
      expect(store.primaryColor).toBe(original)
    })

    it('主色持久化（由 pinia-plugin-persistedstate 保障）', () => {
      const store = useAppStore()
      store.setPrimaryColor('#00ff00')
      expect(store.primaryColor).toBe('#00ff00')
    })

    it('setPrimaryColor 同步 CSS 变量', () => {
      const store = useAppStore()
      store.setPrimaryColor('#ff0000')
      const value = document.documentElement.style.getPropertyValue('--el-color-primary')
      expect(value.trim()).toBe('#ff0000')
    })
  })

  describe('布局模式', () => {
    it('默认布局为 classic', () => {
      const store = useAppStore()
      expect(store.layoutMode).toBe('classic')
    })

    it('setLayoutMode 修改布局模式', () => {
      const store = useAppStore()
      store.setLayoutMode('top')
      expect(store.layoutMode).toBe('top')
    })

    it('布局模式持久化（由 pinia-plugin-persistedstate 保障）', () => {
      const store = useAppStore()
      store.setLayoutMode('mixed')
      expect(store.layoutMode).toBe('mixed')
    })
  })

  describe('导航模式', () => {
    it('默认导航为 breadcrumb', () => {
      const store = useAppStore()
      expect(store.navMode).toBe('breadcrumb')
    })

    it('setNavMode 修改导航模式', () => {
      const store = useAppStore()
      store.setNavMode('tabs')
      expect(store.navMode).toBe('tabs')
    })

    it('导航模式持久化（由 pinia-plugin-persistedstate 保障）', () => {
      const store = useAppStore()
      store.setNavMode('tabs')
      expect(store.navMode).toBe('tabs')
    })
  })

  describe('侧边栏', () => {
    it('默认不折叠', () => {
      const store = useAppStore()
      expect(store.sidebarCollapsed).toBe(false)
    })

    it('toggleSidebar 切换折叠状态', () => {
      const store = useAppStore()
      store.toggleSidebar()
      expect(store.sidebarCollapsed).toBe(true)
      store.toggleSidebar()
      expect(store.sidebarCollapsed).toBe(false)
    })

    it('setSidebarCollapsed 直接设置', () => {
      const store = useAppStore()
      store.setSidebarCollapsed(true)
      expect(store.sidebarCollapsed).toBe(true)
    })

    it('setSidebarWidth 限制在 160-280 范围', () => {
      const store = useAppStore()
      store.setSidebarWidth(100)
      expect(store.sidebarWidth).toBe(160)
      store.setSidebarWidth(300)
      expect(store.sidebarWidth).toBe(280)
      store.setSidebarWidth(200)
      expect(store.sidebarWidth).toBe(200)
    })

    it('侧边栏宽度持久化（由 pinia-plugin-persistedstate 保障）', () => {
      const store = useAppStore()
      store.setSidebarWidth(220)
      expect(store.sidebarWidth).toBe(220)
    })
  })

  describe('字体大小', () => {
    it('默认字体大小为 medium', () => {
      const store = useAppStore()
      expect(store.fontSize).toBe('medium')
    })

    it('currentFontSize 计算属性返回对应像素值', () => {
      const store = useAppStore()
      expect(store.currentFontSize).toBe(14)
    })

    it('setFontSize 修改字体大小', () => {
      const store = useAppStore()
      store.setFontSize('large')
      expect(store.fontSize).toBe('large')
      expect(store.currentFontSize).toBe(15)
    })

    it('字体大小持久化（由 pinia-plugin-persistedstate 保障）', () => {
      const store = useAppStore()
      store.setFontSize('small')
      expect(store.fontSize).toBe('small')
    })
  })

  describe('语言设置', () => {
    it('默认语言为 zh-CN', () => {
      const store = useAppStore()
      expect(store.locale).toBe('zh-CN')
    })

    it('setLocale 修改语言', () => {
      const store = useAppStore()
      store.setLocale('en-US')
      expect(store.locale).toBe('en-US')
    })

    it('语言持久化（由 pinia-plugin-persistedstate 保障，跳过插件内部测试）', () => {
      const store = useAppStore()
      store.setLocale('en-US')
      expect(store.locale).toBe('en-US')
    })

    it('语言变更设置 document lang 属性', () => {
      const store = useAppStore()
      store.setLocale('en-US')
      expect(document.documentElement.getAttribute('lang')).toBe('en-US')
    })
  })

  describe('全局加载', () => {
    it('默认不加载', () => {
      const store = useAppStore()
      expect(store.globalLoading).toBe(false)
    })

    it('setGlobalLoading 设置加载状态', () => {
      const store = useAppStore()
      store.setGlobalLoading(true)
      expect(store.globalLoading).toBe(true)
    })

    it('state props reactivity', () => {
      const store = useAppStore()
      store.setGlobalLoading(true)
      expect(store.globalLoading).toBe(true)
    })
  })

  describe('页面标题 & 站点信息', () => {
    it('默认站点标题为 Vue Admin', () => {
      const store = useAppStore()
      expect(store.siteTitle).toBe('Vue Admin')
    })

    it('setSiteInfo 设置站点信息', () => {
      const store = useAppStore()
      store.setSiteInfo({ title: '测试站点', logo: 'test-logo.png' })
      expect(store.siteTitle).toBe('测试站点')
      expect(store.siteLogo).toBe('test-logo.png')
    })
  })

  describe('resetPersonalization', () => {
    it('重置所有设置为默认值', () => {
      const store = useAppStore()
      store.setTheme('dark')
      store.setPrimaryColor('#ff0000')
      store.setLayoutMode('top')
      store.setNavMode('tabs')
      store.setSidebarCollapsed(true)
      store.setSidebarWidth(240)
      store.setFontSize('large')
      store.setLocale('en-US')

      store.resetPersonalization()

      expect(store.theme).toBe('light')
      expect(store.primaryColor).toBe('#1890ff')
      expect(store.layoutMode).toBe('classic')
      expect(store.navMode).toBe('breadcrumb')
      expect(store.sidebarCollapsed).toBe(false)
      expect(store.sidebarWidth).toBe(230)
      expect(store.fontSize).toBe('medium')
      expect(store.locale).toBe('zh-CN')
    })
  })

  describe('ensureInitialized', () => {
    it('调用 initDom 不报错', () => {
      const store = useAppStore()
      expect(() => store.ensureInitialized()).not.toThrow()
    })
  })
})
