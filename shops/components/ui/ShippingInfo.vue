<script setup lang="ts">
import { useStoreConfig } from '~/composables/useStoreConfig'

/** 基础 UI 组件（P1-T12）：配送承诺摘要（币种表述取 store config，不写死） */
const props = withDefaults(defineProps<{ standardDays?: string; expressDays?: string; freeThreshold?: number | null }>(), {
  standardDays: '7-12',
  expressDays: '3-5',
  freeThreshold: 9900,
})
const cfg = useStoreConfig()
const thresholdText = computed(() => (props.freeThreshold ? `Free standard shipping over ${cfg.format(props.freeThreshold)}` : 'Shipping calculated at checkout'))
</script>

<template>
  <div class="space-y-1 rounded-xl border border-stone-200 p-4 text-xs text-stone-600">
    <p>🚚 Standard {{ standardDays }} days · Express {{ expressDays }} days</p>
    <p>{{ thresholdText }} · Ships in 1-2 business days</p>
  </div>
</template>
