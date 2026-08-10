<template>
  <div class="breadcrumb-bar">
    <el-breadcrumb separator="/">
      <el-breadcrumb-item :to="{ path: '/dashboard' }">
        {{ t('common.home') }}
      </el-breadcrumb-item>
      <el-breadcrumb-item
        v-for="(matched, index) in breadcrumbItems"
        :key="matched.path"
        :to="index < breadcrumbItems.length - 1 ? { path: matched.path } : undefined"
      >
        {{ matched.title }}
      </el-breadcrumb-item>
    </el-breadcrumb>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from '@/i18n'

const route = useRoute()
const { t } = useI18n()

const breadcrumbItems = computed(() => {
  return route.matched
    .filter((r) => r.name !== 'Layout' && (r.meta?.title || r.name))
    .map((r) => ({
      path: r.path,
      title: resolveBreadcrumbTitle(r),
    }))
})

function resolveBreadcrumbTitle(route: { path: string; meta?: { title?: string }; name?: unknown }): string {
  const key = breadcrumbKey(route.path)
  const translated = t(key)
  if (translated !== key) return translated
  const metaTitle = route.meta?.title
  if (metaTitle) {
    const translatedMeta = t(metaTitle)
    if (translatedMeta !== metaTitle) return translatedMeta
  }
  return (route.name as string) || ''
}

/**
 * 将路由路径转换为面包屑 i18n key
 * /dashboard → menu.dashboard
 * /users → menu.users
 */
function breadcrumbKey(path: string): string {
  if (!path) return ''
  const segments = path.split('/').filter(Boolean)
  if (segments.length === 0) return ''
  // 所有路径段都做 kebab → camel，与侧边栏菜单 key 保持一致
  const key = segments.map((seg) => seg.replace(/-(\w)/g, (_, c: string) => c.toUpperCase())).join('.')
  return `sidebar.${key}`
}
</script>

<style lang="scss" scoped>
.breadcrumb-bar {
  background-color: var(--breadcrumb-bg);
  padding: 12px 20px;
}

.breadcrumb-bar :deep(.el-breadcrumb__inner) {
  font-size: 11px;
  font-weight: 400;
  color: var(--text-secondary);
}

.breadcrumb-bar :deep(.el-breadcrumb__inner.is-link) {
  color: var(--text-secondary);
}

.breadcrumb-bar :deep(.el-breadcrumb__inner.is-link:hover) {
  color: var(--mainColor);
}

.breadcrumb-bar :deep(.el-breadcrumb__item:last-child .el-breadcrumb__inner) {
  color: var(--text-regular);
  font-weight: 400;
}

.breadcrumb-bar :deep(.el-breadcrumb__separator) {
  font-size: 11px;
  color: var(--border-dark);
}
</style>
