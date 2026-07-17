<template>
  <div>
    <template v-for="item in menus" :key="item.id">
      <el-sub-menu v-if="item.children && item.children.length" :index="item.path || item.id">
        <template #title>
          <MenuIcon :name="item.icon" />
          <span>{{ t(menuKey(item), {}, item.name) }}</span>
        </template>
        <SubMenu :menus="item.children" />
      </el-sub-menu>
      <el-menu-item v-else-if="item.type === 'M'" :index="item.path" @mouseenter="onMenuHover(item.path)">
        <MenuIcon :name="item.icon" />
        <template #title>
          {{ t(menuKey(item), {}, item.name) }}
        </template>
      </el-menu-item>
    </template>
  </div>
</template>

<script setup lang="ts">
import { preloadRoute } from '@/router/preload'
import { useI18n } from '@/i18n'

type MenuItem = {
  id: string
  path: string
  name: string
  type: string
  icon: string
  children?: MenuItem[]
}
defineProps<{
  menus: MenuItem[]
}>()

const { t } = useI18n()
const router = useRouter()

/**
 * 将菜单路径转换为 i18n key
 * /dashboard → menu.dashboard
 * /online-users → menu.onlineUsers
 */
function menuKey(item: MenuItem): string {
  if (!item.path) return ''
  const segments = item.path.split('/').filter(Boolean)
  if (segments.length === 0) return ''
  const key = segments
    .map((seg, i) => {
      if (i === 0) return seg
      return seg.replace(/-(\w)/g, (_, c: string) => c.toUpperCase())
    })
    .join('.')
  return `sidebar.${key}`
}

function onMenuHover(path: string) {
  if (path) preloadRoute(router, path)
}
</script>

<style lang="scss" scoped>
/* 子菜单样式继承Layout 中定义的全局 .side-menu 样式 */
</style>
