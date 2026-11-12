<template>
  <div class="page-container shop-search-funnel">
    <el-card shadow="never" class="filter-card">
      <el-form :inline="true">
        <el-form-item :label="t('shop.analytics.startAt')">
          <el-date-picker v-model="query.startAt" type="date" value-format="YYYY-MM-DD" :placeholder="t('shop.analytics.startAt')" style="width: 160px" />
        </el-form-item>
        <el-form-item :label="t('shop.analytics.endAt')">
          <el-date-picker v-model="query.endAt" type="date" value-format="YYYY-MM-DD" :placeholder="t('shop.analytics.endAt')" style="width: 160px" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :icon="Search" :loading="loading" @click="load">
            {{ t('common.search') }}
          </el-button>
          <el-button :icon="Refresh" @click="handleReset">
            {{ t('common.reset') }}
          </el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-row v-if="report" :gutter="16" class="metric-row">
      <el-col v-for="step in steps" :key="step.key" :xs="24" :sm="12" :md="6">
        <el-card shadow="never" class="metric-card">
          <div class="metric-label">{{ step.label }}</div>
          <div class="metric-value">{{ step.count }}</div>
          <div class="metric-sub">{{ step.rate }}</div>
        </el-card>
      </el-col>
    </el-row>

    <el-card shadow="never" class="report-card">
      <template #header>
        <div class="card-header">
          <span class="card-title">{{ t('shop.analytics.funnelTitle') }}</span>
          <span v-if="rangeText" class="range-text">{{ rangeText }}</span>
        </div>
      </template>

      <el-alert
        v-if="report && report.noSessionEvents > 0"
        type="info"
        :closable="false"
        class="funnel-note"
        :title="t('shop.analytics.funnelNote') + report.noSessionEvents"
      />

      <!-- 漏斗可视化：条形宽度按相对 search 会话数比例 -->
      <div v-if="report && report.searched > 0" class="funnel-bars">
        <div v-for="step in bars" :key="step.key" class="funnel-row">
          <span class="funnel-label">{{ step.label }}</span>
          <div class="funnel-track">
            <div class="funnel-fill" :style="{ width: step.pct + '%' }" />
          </div>
          <span class="funnel-value">{{ step.count }} · {{ step.rate }}</span>
        </div>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { Search, Refresh } from '@element-plus/icons-vue'
import { analyticsApi, type SearchFunnelReport } from '@/api/shop'
import { getErrorMessage } from '@/utils/error'
import { useI18n } from '@/i18n'

const { t } = useI18n()

const loading = ref(false)
const report = ref<SearchFunnelReport | null>(null)
const query = reactive<{ startAt: string; endAt: string }>({ startAt: '', endAt: '' })

const rangeText = computed(() => (report.value ? `${report.value.startAt.slice(0, 10)} ~ ${report.value.endAt.slice(0, 10)}` : ''))

const pct = (n: number): number => (report.value && report.value.searched > 0 ? (n / report.value.searched) * 100 : 0)
const rateText = (n: number): string => (report.value && report.value.searched > 0 ? ((n / report.value.searched) * 100).toFixed(2) + '%' : '0%')

const steps = computed(() => {
  const r = report.value
  if (!r) return []
  return [
    { key: 'searched', label: t('shop.analytics.funnelSearch'), count: r.searched, rate: '100%' },
    { key: 'viewed', label: t('shop.analytics.funnelView'), count: r.viewed, rate: rateText(r.viewed) },
    { key: 'added', label: t('shop.analytics.funnelAdd'), count: r.added, rate: rateText(r.added) },
    { key: 'purchased', label: t('shop.analytics.funnelPurchase'), count: r.purchased, rate: rateText(r.purchased) },
  ]
})

const bars = computed(() => steps.value.map((s) => ({ ...s, pct: pct(s.count) })))

const load = async (): Promise<void> => {
  loading.value = true
  try {
    const res = await analyticsApi.searchFunnel({
      startAt: query.startAt || undefined,
      endAt: query.endAt || undefined,
    })
    report.value = res.data
  } catch (err: unknown) {
    ElMessage.error(t('shop.analytics.funnelLoadFailed') + ': ' + getErrorMessage(err))
  } finally {
    loading.value = false
  }
}

const handleReset = (): void => {
  query.startAt = ''
  query.endAt = ''
  load()
}

onMounted(load)
</script>

<style scoped lang="scss">
.filter-card,
.metric-row,
.report-card {
  margin-bottom: 16px;
}

.metric-card {
  text-align: center;
}

.metric-label {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.metric-value {
  margin-top: 6px;
  font-size: 26px;
  font-weight: 600;
  color: var(--el-color-primary);
}

.metric-sub {
  margin-top: 6px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.card-title {
  font-weight: 600;
}

.range-text {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.funnel-note {
  margin-bottom: 16px;
}

.funnel-bars {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.funnel-row {
  display: flex;
  align-items: center;
  gap: 16px;
}

.funnel-label {
  width: 120px;
  font-size: 13px;
  color: var(--el-text-color-regular);
  text-align: right;
}

.funnel-track {
  flex: 1;
  height: 28px;
  background: var(--el-fill-color-light);
  border-radius: 4px;
  overflow: hidden;
}

.funnel-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--el-color-primary-light-3), var(--el-color-primary));
  border-radius: 4px;
  transition: width 0.4s ease;
}

.funnel-value {
  width: 160px;
  font-size: 13px;
  color: var(--el-text-color-regular);
}
</style>
