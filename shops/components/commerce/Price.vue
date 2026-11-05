<script setup lang="ts">
import { useStoreConfig } from '~/composables/useStoreConfig'
import type { Money } from '~/shared/types/currency'

/**
 * Price 组件（P1-T11）：全站唯一价格渲染入口，配置驱动、零硬编码符号（C1/C4）。
 */
const props = defineProps<{ money: Money | null; size?: 'sm' | 'md' | 'lg' }>()
const cfg = useStoreConfig()
const text = computed(() => (props.money ? cfg.format(props.money.amount) : '—'))
</script>

<template>
  <span :class="size === 'lg' ? 'text-2xl font-semibold' : size === 'sm' ? 'text-sm' : 'text-base font-medium'" class="tabular-nums">
    {{ text }}
  </span>
</template>
