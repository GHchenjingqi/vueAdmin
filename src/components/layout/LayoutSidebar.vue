<template>
  <el-menu
    :collapse="isCollapse"
    :default-active="activePath"
    :collapse-transition="false"
    :router="true"
    class="sidebar-menu"
    background-color="transparent"
    text-color="var(--text-regular)"
    active-text-color="#ffffff"
    role="navigation"
    :aria-label="isCollapse ? t('sidebar.collapsed') : t('sidebar.navigation')"
    @select="handleSelect"
  >
    <template v-for="item in displayMenuTree" :key="item.id || item.path">
      <!-- 有子菜单且不是叶子节点的菜单 -->
      <el-sub-menu v-if="item.children && item.children.length > 0" :index="item.path || String(item.id)">
        <template #title>
          <MenuIcon v-if="item.icon" :name="item.icon" />
          <span>{{ t(menuKey(item), {}, item.name) }}</span>
        </template>
        <template v-for="child in item.children" :key="child.id || child.path">
          <el-menu-item :index="child.path || String(child.id)">
            <MenuIcon v-if="child.icon" :name="child.icon" />
            <span>{{ t(menuKey(child), {}, child.name) }}</span>
          </el-menu-item>
        </template>
      </el-sub-menu>

      <!-- 叶子节点菜单 -->
      <el-menu-item v-else :index="item.path || String(item.id)">
        <MenuIcon v-if="item.icon" :name="item.icon" />
        <template #title>
          {{ t(menuKey(item), {}, item.name) }}
        </template>
      </el-menu-item>
    </template>
  </el-menu>
</template>

<script setup lang="ts">
import { loadIcons } from '@/utils/dynamicIcons'
import MenuIcon from '@/components/MenuIcon.vue'
import { useI18n } from '@/i18n'

interface MenuItem {
  id?: number | string
  path?: string
  name: string
  icon?: string
  children?: MenuItem[]
}

const { t } = useI18n()

/**
 * 将菜单路径转换为 i18n key
 * /dashboard → menu.dashboard
 * /online-users → menu.onlineUsers
 * /server-monitor → menu.serverMonitor
 * 路径为空时返回空字符串，让 t() 回退到 item.name
 */
function menuKey(item: MenuItem): string {
  if (!item.path) return ''
  const segments = item.path.split('/').filter(Boolean)
  if (segments.length === 0) return ''
  // 所有路径段都做 kebab → camel，避免 /ai-providers 映射成 sidebar.ai-providers
  // 例：/ai-providers → sidebar.aiProviders，/online-users → sidebar.onlineUsers
  const key = segments.map((seg) => seg.replace(/-(\w)/g, (_, c: string) => c.toUpperCase())).join('.')
  return `sidebar.${key}`
}

const props = withDefaults(
  defineProps<{
    isCollapse: boolean
    menuTree: MenuItem[]
    mode?: 'main' | 'sub'
  }>(),
  { mode: 'main' },
)

const route = useRoute()

const emit = defineEmits<{
  select: [index: string]
}>()

const activePath = computed(() => route.path)

/** 收集菜单中所有需要注册的图标名称 */
function collectIconNames(menus: MenuItem[]): string[] {
  const icons: string[] = []
  for (const menu of menus) {
    if (menu.icon) icons.push(menu.icon)
    if (menu.children?.length) icons.push(...collectIconNames(menu.children))
  }
  return icons
}

// 菜单渲染时，按需加载所有图标（使用 immediate: true 确保 setup 阶段就开始加载）
watch(
  () => props.menuTree,
  (menuTree) => {
    if (menuTree?.length) {
      const iconNames = collectIconNames(menuTree)
      loadIcons(iconNames).catch(() => {})
    }
  },
  { immediate: true },
)

// 混合布局的子模式：只显示子菜单。经典布局 / 顶部布局下显示完整菜单。
const displayMenuTree = computed<MenuItem[]>(() => {
  if (props.mode !== 'sub') {
    return props.menuTree || []
  }
  // 子模式：找出当前活跃的一级菜单，返回其 children 作为侧栏
  if (!props.menuTree || props.menuTree.length === 0) return []
  const firstSegment = '/' + (route.path.split('/')[1] || 'dashboard')
  const activeTop = props.menuTree.find((m) => m.path && (m.path === firstSegment || route.path.startsWith(m.path)))
  if (activeTop && activeTop.children && activeTop.children.length > 0) {
    return activeTop.children
  }
  // 没有匹配的一级菜单，默认显示第一个有 children 的菜单
  const firstWithChildren = props.menuTree.find((m) => m.children && m.children.length > 0)
  return firstWithChildren?.children || props.menuTree
})

const handleSelect = (index: string): void => {
  if (!index) return
  if (index.startsWith('http://') || index.startsWith('https://')) {
    window.open(index, '_blank')
    return
  }
  emit('select', index)
}
</script>

<style lang="scss" scoped>
.sidebar-menu {
  border-right: none;
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;

  // 含活跃子项的一级菜单标题：浅色背景 + 左边框，与子项纯色背景区分开
  :deep(.el-sub-menu.is-active .el-sub-menu__title) {
    background-color: var(--sidebar-active-bg-subtle) !important;
    color: var(--mainColor) !important;
    border-left: 3px solid var(--mainColor);

    .el-icon {
      color: var(--mainColor) !important;
    }
  }
}
</style>
