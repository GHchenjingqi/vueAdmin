<template>
  <el-icon v-if="resolvedComponent" :size="parsedSize" :color="color">
    <component :is="resolvedComponent" />
  </el-icon>
</template>

<script setup lang="ts">
import { iconRegistry, loadIcon } from '@/utils/dynamicIcons'
import { computed, onMounted, watch } from 'vue'

const props = defineProps<{
  name?: string
  size?: number | string
  color?: string
}>()

const parsedSize = computed(() => {
  if (props.size === undefined) return undefined
  return typeof props.size === 'string' ? Number(props.size) : props.size
})

const resolvedComponent = computed(() => (props.name ? iconRegistry.value[props.name] : undefined))

function ensureLoaded(): void {
  if (props.name) {
    loadIcon(props.name).catch(() => {})
  }
}

onMounted(ensureLoaded)
watch(() => props.name, ensureLoaded)
</script>
