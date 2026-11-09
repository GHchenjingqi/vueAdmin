<script setup lang="ts">
import { useStoreConfig } from '~/composables/useStoreConfig'
import { useI18n } from '~/composables/useI18n'

/** 基础 UI 组件（P1-T12）：配送承诺摘要（币种表述取 store config，不写死）。文案接入 i18n（P5-T01）。 */
const { ti } = useI18n()
const props = withDefaults(defineProps<{ standardDays?: string; expressDays?: string; freeThreshold?: number | null }>(), {
  standardDays: '7-12',
  expressDays: '3-5',
  freeThreshold: 9900,
})
const cfg = useStoreConfig()
const thresholdText = computed(() =>
  props.freeThreshold
    ? ti('shipping.freeOver', { amount: cfg.format(props.freeThreshold) })
    : ti('shipping.calculated', {}),
)
</script>

<template>
  <div class="space-y-1 rounded-xl border border-stone-200 p-4 text-xs text-stone-600">
    <p>{{ ti('shipping.standard', { days: standardDays, express: expressDays }) }}</p>
    <p>{{ thresholdText }} · {{ ti('shipping.shipsIn', {}) }}</p>
  </div>
</template>
