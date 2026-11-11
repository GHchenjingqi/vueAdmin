<template>
  <div class="page-container shop-reco-ctr">
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

    <el-row v-if="summary.length" :gutter="16" class="metric-row">
      <el-col v-for="s in summary" :key="s.placement" :xs="24" :sm="12" :md="6">
        <el-card shadow="never" class="metric-card">
          <div class="metric-label">{{ placementLabel(s.placement) }}</div>
          <div class="metric-value">{{ (s.ctr * 100).toFixed(2) }}%</div>
          <div class="metric-sub">{{ t('shop.analytics.recoImpressions') }} {{ s.impressions }} · {{ t('shop.analytics.recoClicks') }} {{ s.clicks }}</div>
        </el-card>
      </el-col>
    </el-row>

    <el-card shadow="never" class="report-card">
      <template #header>
        <div class="card-header">
          <span class="card-title">{{ t('shop.analytics.recoTitle') }}</span>
          <span v-if="rangeText" class="range-text">{{ rangeText }}</span>
        </div>
      </template>
      <el-table v-loading="loading" :data="rows" border stripe :empty-text="t('shop.analytics.recoEmpty')">
        <el-table-column prop="placement" :label="t('shop.analytics.recoPlacement')" min-width="170">
          <template #default="{ row }">{{ placementLabel((row as RecoCtrRow).placement) }}</template>
        </el-table-column>
        <el-table-column prop="strategy" :label="t('shop.analytics.recoStrategy')" min-width="160" />
        <el-table-column prop="impressions" :label="t('shop.analytics.recoImpressions')" min-width="120" />
        <el-table-column prop="clicks" :label="t('shop.analytics.recoClicks')" min-width="120" />
        <el-table-column :label="t('shop.analytics.recoCtr')" min-width="130">
          <template #default="{ row }">
            <span class="ctr-value">{{ ((row as RecoCtrRow).ctr * 100).toFixed(2) }}%</span>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { Search, Refresh } from '@element-plus/icons-vue'
import { analyticsApi, type RecoCtrRow, type RecoCtrSummary } from '@/api/shop'
import { getErrorMessage } from '@/utils/error'
import { useI18n } from '@/i18n'

const { t } = useI18n()

const loading = ref(false)
const rows = ref<RecoCtrRow[]>([])
const summary = ref<RecoCtrSummary[]>([])
const rangeText = ref('')
const query = reactive<{ startAt: string; endAt: string }>({ startAt: '', endAt: '' })

const placementLabel = (placement: string): string => {
  if (placement === 'related') return t('shop.analytics.recoRelated')
  if (placement === 'cross_sell') return t('shop.analytics.recoCrossSell')
  if (placement === 'home') return t('shop.analytics.recoHome')
  return placement
}

const load = async (): Promise<void> => {
  loading.value = true
  try {
    const res = await analyticsApi.recoCtr({
      startAt: query.startAt || undefined,
      endAt: query.endAt || undefined,
    })
    rows.value = res.data.items
    summary.value = res.data.summary
    rangeText.value = `${res.data.startAt.slice(0, 10)} ~ ${res.data.endAt.slice(0, 10)}`
  } catch (err: unknown) {
    ElMessage.error(t('shop.analytics.recoLoadFailed') + ': ' + getErrorMessage(err))
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

.range-text,
.ctr-value {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.ctr-value {
  font-weight: 600;
}
</style>
