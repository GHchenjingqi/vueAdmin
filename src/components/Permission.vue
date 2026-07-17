<template>
  <slot v-if="hasPermission" />
</template>

<script setup lang="ts">
/**
 * Permission 权限组件
 *
 * 用法：
 * ```html
 * <Permission codes="['admin']">
 *   <el-button>管理员按钮</el-button>
 * </Permission>
 * ```
 *
 * 与 v-permission 指令的区别：
 * - 指令通过 display:none 隐藏，DOM 仍存在
 * - 组件通过 v-if 控制，不渲染 DOM
 */
import { computed } from 'vue'
import { useUserStore } from '@/stores'

const props = withDefaults(
  defineProps<{
    codes?: string[]
  }>(),
  {
    codes: () => [],
  },
)

const userStore = useUserStore()

const hasPermission = computed(() => {
  if (!props.codes || props.codes.length === 0) return true

  const roles = userStore.roles || []
  const permissions = userStore.userInfo?.permissions || []

  if (roles.includes('admin') || roles.includes('super_admin')) {
    return true
  }

  return props.codes.some((code) => permissions.includes(code) || roles.includes(code))
})
</script>
