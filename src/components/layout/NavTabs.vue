<template>
  <div class="nav-tabs">
    <el-scrollbar>
      <div class="nav-tabs-inner">
        <div
          v-for="tab in tabs"
          :key="tab.path"
          class="nav-tab"
          :class="{ active: activePath === tab.path }"
          @click="handleTabClick(tab)"
          @contextmenu.prevent="showContextMenu($event, tab)"
        >
          <MenuIcon :name="tab.icon" class="nav-tab-icon" />
          <span class="nav-tab-title">{{ tab.title }}</span>
          <el-icon v-if="tabs.length > 1" class="nav-tab-close" @click.stop="handleClose(tab)">
            <Close />
          </el-icon>
        </div>
      </div>
    </el-scrollbar>

    <!-- 右键菜单 -->
    <teleport to="body">
      <div v-if="contextMenu.visible" class="tabs-context-menu" :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }">
        <div class="context-menu-item" @click="handleClose(contextMenu.tab!)">
          <el-icon><Close /></el-icon>
          {{ t('common.close') }}
        </div>
        <div class="context-menu-item" @click="handleCloseOthers(contextMenu.tab!)">
          <el-icon><SwitchButton /></el-icon>
          {{ t('common.closeOthers') }}
        </div>
        <div class="context-menu-item" @click="handleCloseLeft(contextMenu.tab!)">
          <el-icon><ArrowLeft /></el-icon>
          {{ t('common.closeLeft') }}
        </div>
        <div class="context-menu-item" @click="handleCloseRight(contextMenu.tab!)">
          <el-icon><ArrowRight /></el-icon>
          {{ t('common.closeRight') }}
        </div>
        <div class="context-menu-item" @click="handleCloseAll">
          <el-icon><Minus /></el-icon>
          {{ t('common.closeAll') }}
        </div>
      </div>
    </teleport>
  </div>
</template>

<script setup lang="ts">
import { Close, SwitchButton, ArrowLeft, ArrowRight, Minus } from '@element-plus/icons-vue'
import { useI18n } from '@/i18n'

interface TabItem {
  path: string
  title: string
  icon?: string
  closable?: boolean
}

const router = useRouter()
const route = useRoute()
const { t } = useI18n()

const tabs = ref<TabItem[]>([])
const activePath = computed(() => route.path)
const isMounted = ref(false)

// 右键菜单状态
const contextMenu = ref<{
  visible: boolean
  x: number
  y: number
  tab: TabItem | null
}>({
  visible: false,
  x: 0,
  y: 0,
  tab: null,
})

/**
 * 从 localStorage 恢复标签页
 */
function restoreTabs(): void {
  try {
    const raw = localStorage.getItem('navTabs')
    if (raw) {
      tabs.value = JSON.parse(raw) as TabItem[]
    }
  } catch {
    // 忽略解析失败
  }
}

/**
 * 持久化标签页到 localStorage
 */
function persistTabs(): void {
  try {
    localStorage.setItem('navTabs', JSON.stringify(tabs.value))
  } catch {
    // 忽略
  }
}

/**
 * 添加当前页面为标签页
 */
function addCurrentTab(): void {
  const title = (route.meta?.title as string) || route.path
  const icon = route.meta?.icon as string | undefined

  // 已存在则不重复添加
  if (tabs.value.some((t) => t.path === route.path)) return

  // 不添加空路径或登录页面
  if (!route.path || route.path === '/login' || route.path === '/register') return

  tabs.value.push({
    path: route.path,
    title,
    icon,
    closable: tabs.value.length > 0,
  })

  persistTabs()
}

/**
 * 点击切换标签
 */
function handleTabClick(tab: TabItem): void {
  if (tab.path !== activePath.value) {
    router.push(tab.path)
  }
}

/**
 * 关闭标签
 */
function handleClose(tab: TabItem): void {
  const idx = tabs.value.findIndex((t) => t.path === tab.path)
  if (idx === -1) return
  if (tabs.value.length <= 1) return // 至少保留一个

  tabs.value.splice(idx, 1)

  // 如果关闭的是当前页，则跳转到相邻页面
  if (tab.path === activePath.value) {
    const nextTab = tabs.value[idx] || tabs.value[idx - 1] || tabs.value[0]
    if (nextTab) {
      router.push(nextTab.path)
    }
  }

  contextMenu.value.visible = false
  persistTabs()
}

function handleCloseOthers(tab: TabItem): void {
  tabs.value = tabs.value.filter((t) => t.path === tab.path)
  if (tab.path !== activePath.value) {
    router.push(tab.path)
  }
  contextMenu.value.visible = false
  persistTabs()
}

function handleCloseLeft(tab: TabItem): void {
  const idx = tabs.value.findIndex((t) => t.path === tab.path)
  if (idx > 0) {
    tabs.value = tabs.value.slice(idx)
  }
  contextMenu.value.visible = false
  persistTabs()
}

function handleCloseRight(tab: TabItem): void {
  const idx = tabs.value.findIndex((t) => t.path === tab.path)
  if (idx >= 0 && idx < tabs.value.length - 1) {
    tabs.value = tabs.value.slice(0, idx + 1)
  }
  contextMenu.value.visible = false
  persistTabs()
}

function handleCloseAll(): void {
  // 跳转到首页
  tabs.value = []
  contextMenu.value.visible = false
  persistTabs()
  router.push('/dashboard')
}

function showContextMenu(event: MouseEvent, tab: TabItem): void {
  contextMenu.value = {
    visible: true,
    x: event.clientX,
    y: event.clientY,
    tab,
  }
}

function hideContextMenu(): void {
  if (!isMounted.value) return
  contextMenu.value.visible = false
}

// 监听路由变化，自动添加标签
watch(
  () => route.path,
  () => {
    addCurrentTab()
  },
  { immediate: true },
)

// 监听路由元信息更新（如标题动态变化）
watch(
  () => route.meta?.title,
  (newTitle) => {
    if (!newTitle) return
    const currentTab = tabs.value.find((t) => t.path === activePath.value)
    if (currentTab && currentTab.title !== newTitle) {
      currentTab.title = newTitle as string
      persistTabs()
    }
  },
)

onMounted(() => {
  isMounted.value = true
  restoreTabs()
  addCurrentTab()
  document.addEventListener('click', hideContextMenu)
  document.addEventListener('contextmenu', hideContextMenu)
})

onUnmounted(() => {
  isMounted.value = false
  document.removeEventListener('click', hideContextMenu)
  document.removeEventListener('contextmenu', hideContextMenu)
})
</script>

<style lang="scss" scoped>
.nav-tabs {
  background-color: var(--card-bg);
  border-bottom: 1px solid var(--border-light);
  padding: 0 4px;
  height: 40px;

  :deep(.el-scrollbar__wrap) {
    overflow-y: hidden;
  }
}

.nav-tabs-inner {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 4px;
  height: 40px;
}

.nav-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 12px;
  background-color: var(--content-bg);
  border: 1px solid var(--border-light);
  border-radius: 4px;
  font-size: 13px;
  color: var(--text-regular);
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
  flex-shrink: 0;

  &:hover {
    border-color: var(--mainColor);
    color: var(--mainColor);
  }

  &.active {
    background-color: var(--mainColor);
    border-color: var(--mainColor);
    color: #fff;

    .nav-tab-close {
      color: rgba(255, 255, 255, 0.85);

      &:hover {
        background-color: rgba(255, 255, 255, 0.2);
        color: #fff;
      }
    }
  }
}

.nav-tab-icon {
  font-size: 14px;
}

.nav-tab-title {
  line-height: 1;
}

.nav-tab-close {
  width: 16px;
  height: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 3px;
  font-size: 12px;
  color: var(--text-secondary);
  transition: background-color 0.15s;

  &:hover {
    background-color: var(--hover-bg);
    color: var(--text-primary);
  }
}

/* 右键菜单 */
.tabs-context-menu {
  position: fixed;
  z-index: 9999;
  background-color: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  padding: 4px;
  min-width: 140px;
}

.context-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  font-size: 13px;
  color: var(--text-regular);
  cursor: pointer;
  border-radius: 4px;
  transition: background-color 0.15s;

  .el-icon {
    font-size: 13px;
  }

  &:hover {
    background-color: var(--mainColor-bg);
    color: var(--mainColor);
  }
}
</style>
