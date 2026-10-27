<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { getUsage } from '@/api/billing'

const props = defineProps<{
  metric: string
  label?: string
}>()

const used = ref(0)
const limit = ref(0)
const loading = ref(false)

async function fetchUsage() {
  loading.value = true
  try {
    const res = await getUsage(props.metric)
    used.value = res.data.used
    limit.value = res.data.limit
  } catch {
    used.value = 0
    limit.value = 0
  } finally {
    loading.value = false
  }
}

const percentage = () => {
  if (limit.value <= 0) return 0
  return Math.min(100, Math.round((used.value / limit.value) * 100))
}

const status = () => {
  const pct = percentage()
  if (pct >= 90) return 'exception'
  if (pct >= 70) return 'warning'
  return 'success'
}

onMounted(fetchUsage)
</script>

<template>
  <div v-if="limit > 0" class="quota-bar">
    <span class="quota-label">{{ label || metric }}: {{ used }} / {{ limit }}</span>
    <el-progress :percentage="percentage()" :status="status()" :stroke-width="12" />
  </div>
  <div v-else-if="!loading" class="quota-bar">
    <span class="quota-label">{{ label || metric }}: 无限制</span>
  </div>
</template>

<style scoped>
.quota-bar {
  margin-bottom: 12px;
}
.quota-label {
  font-size: 13px;
  color: #666;
  margin-bottom: 4px;
  display: block;
}
</style>
