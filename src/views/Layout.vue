<template>
  <el-container
    class="layout-container"
    :class="['layout-mode-' + layoutMode, { 'is-dark': theme === 'dark' }]"
    role="application"
    :aria-label="t('layout.applicationTitle')"
  >
    <!-- ========== 顶部栏（所有布局模式都有） ========== -->
    <el-header class="layout-header">
      <LayoutHeader
        ref="headerRef"
        :is-collapse="sidebarCollapsed"
        :site-title="siteTitle"
        :site-logo="siteLogo"
        :username="username"
        :user-avatar="userAvatar"
        :layout-mode="layoutMode"
        :menu-tree="menuTree"
        @toggle-collapse="appStore.toggleSidebar()"
        @toggle-mobile-menu="mobileMenuVisible = !mobileMenuVisible"
        @open-settings="settingsVisible = true"
        @profile="router.push('/profile')"
        @logout="handleLogout"
      />
    </el-header>

    <el-container class="body-container">
      <!-- ========== 桌面端：经典/混合布局的侧边栏 ========== -->
      <el-aside
        v-if="isDesktop && (layoutMode === 'classic' || layoutMode === 'mixed')"
        :width="sidebarCollapsed ? '64px' : sidebarWidth + 'px'"
        class="layout-aside"
      >
        <LayoutSidebar :is-collapse="sidebarCollapsed" :menu-tree="menuTree" :mode="layoutMode === 'mixed' ? 'sub' : 'main'" />
      </el-aside>

      <!-- ========== 移动端：抽屉式侧边栏 ========== -->
      <el-drawer
        v-if="!isDesktop"
        v-model="mobileMenuVisible"
        direction="ltr"
        size="260px"
        :with-header="false"
        :close-on-press-escape="true"
        :modal="true"
        :append-to-body="true"
        class="mobile-drawer"
      >
        <div class="mobile-drawer-header">
          <span class="mobile-drawer-title">{{ siteTitle || 'Vue Admin' }}</span>
        </div>
        <LayoutSidebar :is-collapse="false" :menu-tree="menuTree" :mode="layoutMode === 'mixed' ? 'sub' : 'main'" @select="mobileMenuVisible = false" />
      </el-drawer>

      <el-main id="main-content" class="layout-main" role="main" :aria-label="t('layout.mainContent')">
        <!-- 标签页导航（仅 tabs 模式显示） -->
        <NavTabs v-if="navMode === 'tabs'" />
        <!-- 路由视图 -->
        <ErrorBoundary :show-home="false">
          <template v-if="!loading">
            <router-view v-slot="{ Component, route }">
              <transition name="fade" mode="out-in">
                <keep-alive :include="cachedRoutes">
                  <component :is="Component" :key="route.path" />
                </keep-alive>
              </transition>
            </router-view>
          </template>
          <template v-else>
            <PageSkeleton />
          </template>
        </ErrorBoundary>
      </el-main>
    </el-container>

    <!-- 全局水印 -->
    <Watermark :text="watermarkText" :enabled="watermarkEnabled" />

    <!-- 主题设置面板（由用户头像下拉"布局设置"触发） -->
    <ThemeSettingsPanel v-model="settingsVisible" />

    <!-- AI 助手 -->
    <AIAssistant />
  </el-container>
</template>

<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { authApi } from '@/api'
import { getErrorMessage } from '@/utils/error'
import { debounce } from '@/utils/debounce'
import { useUserStore, useSettingStore, useMenuStore } from '@/stores'
import { useAppStore } from '@/stores/appStore'
import LayoutHeader from '@/components/layout/LayoutHeader.vue'
import LayoutSidebar from '@/components/layout/LayoutSidebar.vue'
import NavTabs from '@/components/layout/NavTabs.vue'
import ThemeSettingsPanel from '@/components/layout/ThemeSettingsPanel.vue'
import Watermark from '@/components/Watermark.vue'
import ErrorBoundary from '@/components/ErrorBoundary.vue'
import PageSkeleton from '@/components/PageSkeleton.vue'
import AIAssistant from '@/components/AIAssistant/index.vue'
import { addDynamicRoutes, tryRestorePath } from '@/router/dynamicRoutes'
import { initDynamicRoutes } from '@/router/initSession'
import { useKeepAlive } from '@/router/keepAlive'
import { useI18n, setLocale } from '@/i18n'

const router = useRouter()
const appStore = useAppStore()
const settingStore = useSettingStore()
const menuStore = useMenuStore()
const userStore = useUserStore()
const { t } = useI18n()

const loading = ref(true)
const settingsVisible = ref(false)
const mobileMenuVisible = ref(false)

// 路由组件缓存管理
const { cachedRoutes, addCache } = useKeepAlive()

// 路由切换时自动缓存已访问的组件
router.afterEach((to) => {
  if (to.name && typeof to.name === 'string') {
    addCache(to.name)
  }
})

/** 桌面端断点（>= 768px） */
const DESKTOP_BREAKPOINT = 768
const isDesktop = ref(window.innerWidth >= DESKTOP_BREAKPOINT)

// 防抖处理 resize 事件，避免频繁触发
const handleResize = debounce(() => {
  isDesktop.value = window.innerWidth >= DESKTOP_BREAKPOINT
  if (isDesktop.value) {
    mobileMenuVisible.value = false
  }
}, 100)

// 从 appStore 获取响应式配置
const theme = computed(() => appStore.theme)
const layoutMode = computed(() => appStore.layoutMode)
const navMode = computed(() => appStore.navMode)
const sidebarCollapsed = computed(() => appStore.sidebarCollapsed)
const sidebarWidth = computed(() => appStore.sidebarWidth)

const username = computed(() => userStore.username || t('common.admin'))
const userAvatar = computed(() => {
  const avatar = userStore.userInfo?.avatar || ''
  if (!avatar) return ''
  if (avatar.startsWith('http')) return avatar
  return avatar
})

const siteTitle = computed(() => appStore.siteTitle)
const siteLogo = computed(() => appStore.siteLogo)
const watermarkEnabled = computed(() => settingStore.watermark.enabled)
const watermarkText = computed(() => settingStore.watermark.text)
const menuTree = computed(() => menuStore.menuTree)

// 同步语言设置（从 appStore 同步到 i18n）
watch(
  () => appStore.locale,
  (val) => {
    setLocale(val)
  },
  { immediate: true },
)

const fetchSettings = async (): Promise<void> => {
  if (!settingStore.loaded) {
    await settingStore.loadSettings()
  }
  const title = settingStore.getString('site_title')
  const logo = settingStore.getString('site_logo')
  if (title) appStore.setSiteInfo({ title })
  if (logo) appStore.setSiteInfo({ logo })
}

const fetchMenuTree = async (): Promise<void> => {
  const MENU_TIMEOUT = 30000
  const timeoutId = setTimeout(() => {
    console.error('菜单加载超时，强制结束 loading')
    loading.value = false
  }, MENU_TIMEOUT)

  try {
    // 动态路由通常已由 App.vue 初始化阶段注册，这里仅为兜底（幂等）。
    await initDynamicRoutes()

    // 路由已在 App 初始化时注册；若因异常未注册，这里再尝试一次。
    const menus = menuStore.menuTree
    if (menus && menus.length > 0) {
      addDynamicRoutes(menus)
      await tryRestorePath()
    }
  } catch (err: unknown) {
    console.error('获取菜单失败:', getErrorMessage(err))
    // 菜单获取失败（多为 401/会话失效）时，若已无登录态则退回登录页，
    // 避免停留在空白首页、且点击任意菜单都被 catch-all 拦截。
    if (!userStore.isLoggedIn) {
      router.replace('/login')
      return
    }
    ElMessage.error(getErrorMessage(err) || '菜单加载失败，请刷新页面')
  } finally {
    clearTimeout(timeoutId)
    loading.value = false
  }
}

const handleLogout = async (): Promise<void> => {
  try {
    await authApi.logout()
  } catch {
    // 退出接口调用失败，仍继续清理本地状态
  }
  userStore.logout()
  menuStore.clearMenus()
  window.location.replace('/login')
}

onMounted(async () => {
  window.addEventListener('resize', handleResize)
  appStore.ensureInitialized()
  await fetchSettings()
  await fetchMenuTree()
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
})
</script>

<style lang="scss" scoped>
.layout-container {
  height: 100vh;
  background-color: var(--content-bg);
  min-width: 320px;
}

.layout-header {
  display: flex;
  align-items: center;
  height: 56px;
  background: var(--header-bg);
  box-shadow: var(--header-shadow);
  flex-shrink: 0;
  padding: 0;
}

.layout-mode-top .layout-header {
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
}

.body-container {
  height: calc(100vh - 56px);
  min-height: 0;
}

.layout-aside {
  background-color: var(--sidebar-bg);
  transition: width 0.25s;
  will-change: width;
  overflow: hidden;
  height: 100%;
  overflow-y: auto;
  flex-shrink: 0;
  border-right: 1px solid var(--border-light);

  :deep(ul > li > ul.el-menu) {
    padding: 0 20px;

    li {
      border-radius: 8px;
    }
  }
}

.layout-mode-top .layout-aside {
  display: none;
}

.layout-main {
  background-color: var(--content-bg);
  padding: 0;
  overflow-y: auto;
  overflow-x: hidden;
  min-width: 0;
}

.breadcrumb-wrapper {
  padding: 8px 20px;
  background-color: var(--card-bg);
  border-bottom: 1px solid var(--border-light);

  &.top-layout {
    background-color: var(--content-bg);
    border-bottom: none;
    padding: 12px 20px 4px;
  }
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* ========== 移动端适配 ========== */
@media (max-width: 767px) {
  .layout-container {
    min-width: 320px;
  }

  .layout-header {
    height: 48px;
    padding: 0;
  }

  .body-container {
    height: calc(100vh - 48px);
  }

  .layout-main {
    padding: 0;
  }

  .layout-aside {
    display: none !important;
  }
}

/* 移动端表格横向滚动 */
:deep(.el-table) {
  @media (max-width: 767px) {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }
}

/* 移动端抽屉菜单 */
.mobile-drawer {
  :deep(.el-drawer__body) {
    padding: 0;
  }
}

.mobile-drawer-header {
  display: flex;
  align-items: center;
  height: 48px;
  padding: 0 16px;
  border-bottom: 1px solid var(--border-light);
}

.mobile-drawer-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

/* 注意：退出登录弹窗不再使用 append-to-body，保持在本组件作用域内，
 * 样式由 theme.scss 的全局 .logout-dialog-root 规则覆盖。 */
</style>
