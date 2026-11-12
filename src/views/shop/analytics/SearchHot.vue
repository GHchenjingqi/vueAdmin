<template>
  <div class="page-container shop-search-hot">
    <el-card shadow="never" class="filter-card">
      <el-form :inline="true">
        <el-form-item :label="t('shop.analytics.startAt')">
          <el-date-picker v-model="query.startAt" type="date" value-format="YYYY-MM-DD" :placeholder="t('shop.analytics.startAt')" style="width: 160px" />
        </el-form-item>
        <el-form-item :label="t('shop.analytics.endAt')">
          <el-date-picker v-model="query.endAt" type="date" value-format="YYYY-MM-DD" :placeholder="t('shop.analytics.endAt')" style="width: 160px" />
        </el-form-item>
        <el-form-item :label="t('shop.analytics.hotLimit')">
          <el-input-number v-model="query.limit" :min="5" :max="100" :step="5" style="width: 110px" />
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
      <el-col :xs="24" :sm="8">
        <el-card shadow="never" class="metric-card">
          <div class="metric-label">{{ t('shop.analytics.hotTotal') }}</div>
          <div class="metric-value">{{ report.totalSearches }}</div>
          <div class="metric-sub">{{ rangeText }}</div>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="8">
        <el-card shadow="never" class="metric-card">
          <div class="metric-label">{{ t('shop.analytics.hotZero') }}</div>
          <div class="metric-value">
            {{ report.zeroResultSearches ?? t('shop.analytics.hotNoSignal') }}
          </div>
          <div class="metric-sub">
            {{ report.zeroResultRate != null ? (report.zeroResultRate * 100).toFixed(2) + '%' : t('shop.analytics.hotNoSignalHint') }}
          </div>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="8">
        <el-card shadow="never" class="metric-card">
          <div class="metric-label">{{ t('shop.analytics.hotDistinct') }}</div>
          <div class="metric-value">{{ report.keywords.length }}</div>
          <div class="metric-sub">{{ t('shop.analytics.hotMerged') }}</div>
        </el-card>
      </el-col>
    </el-row>

    <el-card shadow="never" class="report-card">
      <template #header>
        <div class="card-header">
          <span class="card-title">{{ t('shop.analytics.hotTitle') }}</span>
          <span v-if="rangeText" class="range-text">{{ rangeText }}</span>
        </div>
      </template>
      <el-table v-loading="loading" :data="report?.keywords ?? []" border stripe :empty-text="t('shop.analytics.hotEmpty')">
        <el-table-column type="index" :label="t('shop.analytics.hotRank')" width="70" />
        <el-table-column prop="term" :label="t('shop.analytics.hotTerm')" min-width="240" />
        <el-table-column prop="count" :label="t('shop.analytics.hotCount')" min-width="120" />
        <el-table-column :label="t('shop.analytics.hotShare')" min-width="140">
          <template #default="{ row }">
            <span>{{ sharePct(row.count) }}</span>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { Search, Refresh } from '@element-plus/icons-vue'
import { analyticsApi, type SearchHotReport } from '@/api/shop'
import { getErrorMessage } from '@/utils/error'
import { useI18n } from '@/i18n'

const { t } = useI18n()

const loading = ref(false)
const report = ref<SearchHotReport | null>(null)
const query = reactive<{ startAt: string; endAt: string; limit: number }>({ startAt: '', endAt: '', limit: 20 })

const rangeText = computed(() => (report.value ? `${report.value.startAt.slice(0, 10)} ~ ${report.value.endAt.slice(0, 10)}` : ''))

const sharePct = (count: number): string => {
  const total = report.value?.totalSearches ?? 0
  return total > 0 ? ((count / total) * 100).toFixed(2) + '%' : '0%'
}

const load = async (): Promise<void> => {
  loading.value = true
  try {
    const res = await analyticsApi.searchHot({
      startAt: query.startAt || undefined,
      endAt: query.endAt || undefined,
      limit: query.limit,
    })
    report.value = res.data
  } catch (err: unknown) {
    ElMessage.error(t('shop.analytics.hotLoadFailed') + ': ' + getErrorMessage(err))
  } finally {
    loading.value = false
  }
}

const handleReset = (): void => {
  query.startAt = ''
  query.endAt = ''
  query.limit = 20
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
</style>
