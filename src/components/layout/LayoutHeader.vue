<template>
  <div class="layout-header-inner" role="banner" :aria-label="t('layout.header')">
    <!-- 移动端菜单按钮 -->
    <el-icon
      class="mobile-menu-btn"
      :size="20"
      role="button"
      :aria-label="t('accessibility.toggleMenu')"
      tabindex="0"
      @click="$emit('toggleMobileMenu')"
      @keydown.enter.prevent="$emit('toggleMobileMenu')"
    >
      <Menu />
    </el-icon>

    <!-- 左侧：品牌 + 折叠按钮 + 面包屑 -->
    <div class="header-left">
      <!-- 品牌区（经典布局显示侧边栏+logo+名称；顶部/混合布局显示 logo+完整名称） -->
      <div
        class="brand"
        :class="{
          'brand-compact': layoutMode === 'classic' && isCollapse,
          'brand-wide': layoutMode !== 'classic',
        }"
      >
        <div class="brand-icon">
          <img v-if="siteLogo" :src="previewUrl(siteLogo)" alt="Logo" class="brand-logo-img" />
          <svg v-else viewBox="0 0 64 64" width="32" height="32">
            <rect x="4" y="4" width="56" height="56" rx="8" fill="#1890ff" />
            <path d="M32 16 L44 32 L32 48 L20 32 Z" fill="#ffffff" />
          </svg>
        </div>
        <span v-show="!(layoutMode === 'classic' && isCollapse)" class="brand-text">{{ siteTitle || 'Vue Admin' }}</span>
      </div>

      <!-- 折叠按钮（仅经典/混合布局显示） -->
      <el-icon
        v-if="layoutMode === 'classic' || layoutMode === 'mixed'"
        class="collapse-btn"
        :size="20"
        role="button"
        :aria-label="isCollapse ? t('accessibility.expandSidebar') : t('accessibility.collapseSidebar')"
        tabindex="0"
        @click="$emit('toggleCollapse')"
        @keydown.enter.prevent="$emit('toggleCollapse')"
      >
        <Fold v-if="!isCollapse" />
        <Expand v-else />
      </el-icon>

      <!-- 顶部导航（顶部布局模式：主导航；混合布局：一级导航） -->
      <el-menu
        v-if="layoutMode === 'top' || layoutMode === 'mixed'"
        mode="horizontal"
        :default-active="activePath"
        :router="true"
        class="top-nav"
        @select="handleNavSelect"
      >
        <el-menu-item v-for="item in topLevelMenus" :key="item.path || item.name" :index="item.path || ''">
          <MenuIcon v-if="item.icon" :name="item.icon" />
          <span>{{ t(menuKey(item), {}, item.name) }}</span>
        </el-menu-item>
      </el-menu>
      <LayoutBreadcrumb v-if="layoutMode === 'classic'" />
    </div>

    <!-- 搜索框 -->
    <GlobalSearch />

    <!-- 右侧：通知 + 主题切换 + 语言 + 用户 -->
    <div class="header-right">
      <NotificationCenter @unread-change="handleUnreadChange" />

      <!-- 深色主题切换 -->
      <el-tooltip :content="theme === 'dark' ? t('themeSettings.switchLight') : t('themeSettings.switchDark')" placement="top">
        <span class="theme-toggle icon-btn" @click="handleToggleTheme">
          <el-icon :size="18">
            <Moon v-if="theme === 'dark'" />
            <Sunny v-else />
          </el-icon>
        </span>
      </el-tooltip>

      <!-- 语言切换 -->
      <el-dropdown trigger="click" popper-class="locale-dropdown-popper" @command="handleLocaleChange">
        <span class="locale-btn">
          <svg class="locale-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
          <span class="locale-label">{{ localeLabels[locale] }}</span>
          <el-icon :size="10"><ArrowDown /></el-icon>
        </span>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item v-for="(label, key) in localeLabels" :key="key" :command="key" :class="{ active: locale === key }">
              <span>{{ label }}</span>
              <el-icon v-if="locale === key" class="locale-checked">
                <Check />
              </el-icon>
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>

      <el-dropdown trigger="click" popper-class="user-dropdown-popper" @command="handleUserCommand">
        <span class="user-info">
          <el-avatar :size="32" :src="userAvatar">
            <template v-if="!userAvatar">
              {{ username?.charAt(0)?.toUpperCase() }}
            </template>
          </el-avatar>
          <span class="username">{{ username }}</span>
          <el-icon :size="12" class="caret-icon"><ArrowDown /></el-icon>
        </span>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="openSettings">
              <el-icon><Setting /></el-icon>
              {{ t('themeSettings.title') }}
            </el-dropdown-item>
            <el-dropdown-item command="profile">
              <el-icon><User /></el-icon>
              {{ t('layout.profile') }}
            </el-dropdown-item>
            <el-dropdown-item command="logout" divided>
              <el-icon><SwitchButton /></el-icon>
              {{ t('layout.logout') }}
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Fold, Expand, User, ArrowDown, SwitchButton, Setting, Menu, Check, Moon, Sunny } from '@element-plus/icons-vue'
import MenuIcon from '@/components/MenuIcon.vue'
import { useI18n } from '@/i18n'
import { useAppStore } from '@/stores'
import GlobalSearch from './GlobalSearch.vue'
import NotificationCenter from './NotificationCenter.vue'
import LayoutBreadcrumb from './LayoutBreadcrumb.vue'

interface MenuItem {
  path?: string
  name: string
  icon?: string
  children?: MenuItem[]
}

const props = defineProps<{
  isCollapse: boolean
  siteTitle: string
  siteLogo: string
  username: string
  userAvatar: string
  layoutMode: 'classic' | 'top' | 'mixed'
  menuTree?: MenuItem[]
}>()

const emit = defineEmits<{
  (e: 'toggleCollapse'): void
  (e: 'toggleMobileMenu'): void
  (e: 'openSettings'): void
  (e: 'profile'): void
  (e: 'logout'): void
  (e: 'unreadChange', count: number): void
}>()

const { t, locale, localeLabels } = useI18n()
const appStore = useAppStore()
const route = useRoute()

const theme = computed(() => appStore.theme)

function handleToggleTheme(): void {
  appStore.toggleTheme()
}

const activePath = computed(() => {
  // 顶部布局下，高亮当前路径对应的一级菜单
  if (props.layoutMode === 'top' || props.layoutMode === 'mixed') {
    const topPath = '/' + (route.path.split('/')[1] || 'dashboard')
    return topPath
  }
  return route.path
})

// 从菜单树中提取一级菜单（用于顶部导航）
const topLevelMenus = computed<MenuItem[]>(() => {
  if (!props.menuTree || props.menuTree.length === 0) return []
  // 只显示有 path（可跳转）的一级菜单，在顶部布局下作为主导航
  return props.menuTree.filter((m) => m.path && m.path.length > 0)
})

/**
 * 将菜单路径转换为 i18n key
 * /dashboard → menu.dashboard
 * /online-users → menu.onlineUsers
 */
function menuKey(item: MenuItem): string {
  if (!item.path) return ''
  const segments = item.path.split('/').filter(Boolean)
  if (segments.length === 0) return ''
  // 所有路径段都做 kebab → camel，避免 /ai-providers 映射成 sidebar.ai-providers
  const key = segments.map((seg) => seg.replace(/-(\w)/g, (_, c: string) => c.toUpperCase())).join('.')
  return `sidebar.${key}`
}

function handleNavSelect(_index: string): void {
  // 导航由 el-menu :router="true" 自动处理，此 handler 保留供后续扩展
}

function handleUnreadChange(val: number): void {
  // 可以在这里添加额外逻辑（如更新 document.title）
  void val
}

function handleLocaleChange(localeKey: string): void {
  appStore.setLocale(localeKey as 'zh-CN' | 'en-US')
}

function handleUserCommand(command: string): void {
  if (command === 'openSettings') {
    emit('openSettings')
  } else if (command === 'profile') {
    emit('profile')
  } else if (command === 'logout') {
    emit('logout')
  }
}

function previewUrl(url: string): string {
  if (!url) return ''
  if (url.startsWith('http')) return url
  return url
}
</script>

<style lang="scss" scoped>
.layout-header-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 0 12px;
  min-width: 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 0 1 auto;
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 56px;
  width: 200px;
  flex-shrink: 0;

  &-compact {
    width: auto;
    justify-content: center;
  }

  &-wide {
    min-width: 200px;
  }
}

.brand-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 16px;
  overflow: hidden;
  flex-shrink: 0;
  background-color: rgba(255, 255, 255, 0.15);
}

.brand-logo-img {
  height: 36px;
  max-width: 240px;
  object-fit: contain;
}

.brand-text {
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  white-space: nowrap;
  letter-spacing: 0.5px;
}

.collapse-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  cursor: pointer;
  font-size: 20px;
  color: var(--text-regular);
  transition:
    color 0.2s,
    background-color 0.2s;
  border-radius: 4px;
  margin-left: 8px;
  flex-shrink: 0;

  &:hover {
    color: var(--mainColor);
  }
}

/* 顶部导航 */
.top-nav {
  border-bottom: none !important;
  flex: 1;
  margin-left: 8px;
  background: transparent !important;
  min-width: 0;
}

/* 右侧工具区 */
.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.icon-btn {
  cursor: pointer;
  padding: 8px 10px;
  border-radius: 16px;
  color: var(--text-regular);
  transition: all 0.2s;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  // height: 40px;
  // width: 40px;

  &:hover {
    color: var(--mainColor);
    background-color: var(--hover-bg);
  }
}

.user-info {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  padding: 2px 12px;
  border-radius: 16px;
  transition: background-color 0.2s;

  &:hover {
    background-color: var(--hover-bg);
  }
}

.username {
  font-size: 14px;
  color: var(--text-primary);
  font-weight: 400;
}

.caret-icon {
  color: var(--text-secondary);
}

/* 语言切换按钮 */
.locale-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  padding: 8px 10px;
  border-radius: 16px;
  transition: background-color 0.2s;
  color: var(--text-regular);
  font-size: 13px;

  &:hover {
    color: var(--mainColor);
    background-color: var(--hover-bg);
  }
}

.locale-icon {
  flex-shrink: 0;
}

.locale-label {
  white-space: nowrap;
}

.locale-checked {
  margin-left: 4px;
  color: var(--mainColor);
  font-size: 14px;
}

/* 移动端菜单按钮：默认隐藏，小屏显示 */
.mobile-menu-btn {
  display: none;
  cursor: pointer;
  padding: 8px;
  margin-right: 4px;
  color: var(--text-regular);
  border-radius: 4px;
  flex-shrink: 0;

  &:hover {
    color: var(--mainColor);
    background-color: var(--hover-bg);
  }

  @media (max-width: 767px) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 22px;
    width: 36px;
    height: 36px;
  }
}

/* ========== 移动端适配 ========== */
@media (max-width: 767px) {
  .layout-header-inner {
    padding: 0 8px;
  }

  .header-left {
    gap: 2px;
    flex: 0 0 auto;
  }

  .brand {
    height: 48px;
    width: auto;
    padding: 0 8px;
    gap: 6px;
  }

  .brand-wide {
    min-width: auto;
    padding: 0 8px;
  }

  .brand-logo-img {
    height: 28px;
    max-width: 120px;
  }

  .brand-text {
    font-size: 14px;
    max-width: 100px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .collapse-btn {
    display: none !important;
  }

  .top-nav {
    display: none !important;
  }

  .header-right {
    gap: 0;
  }

  .user-info {
    padding: 4px 6px;
  }

  .username {
    display: none;
  }

  .caret-icon {
    display: none;
  }
}
</style>

<!-- 全局样式：用户下拉菜单 + 语言切换下拉菜单 hover 背景色改为主色调 -->
<style lang="scss">
.user-dropdown-popper {
  .el-dropdown-menu__item {
    &:hover,
    &:focus {
      background-color: #f5f6f7 !important;
      color: var(--el-color-primary) !important;
    }
  }
}

.locale-dropdown-popper {
  .el-dropdown-menu__item.active {
    color: var(--el-color-primary) !important;
    font-weight: 600;
  }
  .el-dropdown-menu__item.active:hover,
  .el-dropdown-menu__item.active:focus {
    color: var(--el-color-primary) !important;
  }
  .el-dropdown-menu__item {
    &:hover,
    &:focus {
      background-color: #f5f6f7 !important;
      color: var(--el-color-primary) !important;
    }
  }
  .locale-checked {
    margin-left: 4px;
    color: var(--el-color-primary);
    font-size: 14px;
  }
}
</style>
