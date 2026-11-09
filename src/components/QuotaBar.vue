<script setup lang="ts">
import { useI18n } from '@/i18n'

const props = defineProps<{
  label: string
  used: number
  /** 0 或负数表示不限额（与后端 checkQuota 同一套语义） */
  limit: number
  unit?: string
}>()

const { t } = useI18n()

const unlimited = computed(() => props.limit <= 0)
const percent = computed(() => (unlimited.value ? 0 : Math.min(100, Math.round((props.used / props.limit) * 100))))
const status = computed(() => {
  if (unlimited.value) return 'success'
  if (percent.value >= 90) return 'exception'
  if (percent.value >= 70) return 'warning'
  return 'success'
})

function value(v: number): string {
  return `${v}${props.unit || ''}`
}
</script>

<template>
  <div class="quota-bar">
    <div class="quota-head">
      <span class="quota-label">{{ label }}</span>
      <span class="quota-value">
        <template v-if="unlimited">{{ used }}{{ unit || '' }} · {{ t('quota.unlimited') }}</template>
        <template v-else>{{ value(used) }} / {{ value(limit) }}</template>
      </span>
    </div>
    <el-progress v-if="!unlimited" :percentage="percent" :status="status" :stroke-width="8" :show-text="false" />
  </div>
</template>

<style scoped>
.quota-bar {
  padding: 8px 0;
}
.quota-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}
.quota-label {
  font-size: 13px;
  color: var(--text-secondary);
}
.quota-value {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
}
</style>
