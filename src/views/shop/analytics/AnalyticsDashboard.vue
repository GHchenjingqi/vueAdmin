<template>
  <div class="page-container shop-analytics">
    <!-- 筛选条 -->
    <el-card shadow="never" class="filter-card">
      <el-form :inline="true">
        <el-form-item :label="t('shop.analytics.startAt')">
          <el-date-picker v-model="query.startAt" type="date" value-format="YYYY-MM-DD" :placeholder="t('shop.analytics.startAt')" style="width: 160px" />
        </el-form-item>
        <el-form-item :label="t('shop.analytics.endAt')">
          <el-date-picker v-model="query.endAt" type="date" value-format="YYYY-MM-DD" :placeholder="t('shop.analytics.endAt')" style="width: 160px" />
        </el-form-item>
        <el-form-item :label="t('shop.analytics.channel')">
          <el-select v-model="query.channelId" :placeholder="t('shop.analytics.channelPlaceholder')" clearable style="width: 200px">
            <el-option v-for="c in channelOptions" :key="c.id" :label="c.name" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :icon="Search" :loading="loading" @click="loadAll">
            {{ t('common.search') }}
          </el-button>
          <el-button :icon="Refresh" @click="handleReset">
            {{ t('common.reset') }}
          </el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 利润概览 -->
    <el-row :gutter="16" class="metric-row">
      <el-col v-for="m in metrics" :key="m.label" :xs="12" :sm="8" :md="6">
        <el-card shadow="never" class="metric-card">
          <div class="metric-label">{{ m.label }}</div>
          <div class="metric-value" :class="m.cls">{{ m.value }}</div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 销售报表 -->
    <el-card shadow="never" class="report-card">
      <template #header>
        <div class="card-header">
          <span class="card-title">{{ t('shop.analytics.sales') }}</span>
          <el-select v-model="query.dimension" size="small" style="width: 140px" @change="loadSales">
            <el-option :label="t('shop.analytics.dimDay')" value="day" />
            <el-option :label="t('shop.analytics.dimMonth')" value="month" />
            <el-option :label="t('shop.analytics.dimChannel')" value="channel" />
            <el-option :label="t('shop.analytics.dimCategory')" value="category" />
            <!-- PLAN 3.2：按广告来源/活动看投放 ROI（无 utm 的订单归入 direct） -->
            <el-option :label="t('shop.analytics.dimUtm')" value="utm" />
          </el-select>
        </div>
      </template>
      <el-table v-loading="loading" :data="salesRows" border stripe max-height="360">
        <el-table-column :label="t('shop.analytics.dimension')" min-width="180">
          <template #default="{ row }">{{ formatDimensionKey(row.key) }}</template>
        </el-table-column>
        <el-table-column prop="usdTotal" :label="t('shop.analytics.usdTotal')" min-width="130">
          <template #default="{ row }">$ {{ Number(row.usdTotal).toFixed(2) }}</template>
        </el-table-column>
        <el-table-column prop="orderCount" :label="t('shop.analytics.orderCount')" width="110" />
        <el-table-column prop="itemQty" :label="t('shop.analytics.itemQty')" width="110" />
        <el-table-column :label="t('shop.analytics.usdTotal')" min-width="180">
          <template #default="{ row }">
            <span v-for="(v, k) in row.amountByCurrency" :key="k" class="currency-chip">{{ k }} {{ Number(v).toFixed(2) }}</span>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 利润明细 -->
    <el-card shadow="never" class="report-card">
      <template #header>
        <span class="card-title">{{ t('shop.analytics.profit') }}</span>
      </template>
      <el-table v-loading="loading" :data="profitSeries" border stripe max-height="360">
        <el-table-column :label="t('shop.analytics.dimension')" min-width="180">
          <template #default="{ row }">{{ formatDimensionKey(row.key) }}</template>
        </el-table-column>
        <el-table-column prop="revenueUSD" :label="t('shop.analytics.revenueUSD')" min-width="140">
          <template #default="{ row }">$ {{ Number(row.revenueUSD).toFixed(2) }}</template>
        </el-table-column>
        <el-table-column prop="costUSD" :label="t('shop.analytics.costUSD')" min-width="130">
          <template #default="{ row }">$ {{ Number(row.costUSD).toFixed(2) }}</template>
        </el-table-column>
        <el-table-column prop="profitUSD" :label="t('shop.analytics.grossProfitUSD')" min-width="140">
          <template #default="{ row }">$ {{ Number(row.profitUSD).toFixed(2) }}</template>
        </el-table-column>
        <el-table-column prop="fxGainLoss" :label="t('shop.analytics.fxGainLossUSD')" min-width="150">
          <template #default="{ row }">
            <span :class="Number(row.fxGainLoss) >= 0 ? 'fx-up' : 'fx-down'">$ {{ Number(row.fxGainLoss).toFixed(2) }}</span>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 库存周转 -->
    <el-card shadow="never" class="report-card">
      <template #header>
        <span class="card-title">{{ t('shop.analytics.turnover') }}</span>
      </template>
      <el-table v-loading="loading" :data="turnoverRows" border stripe max-height="360">
        <el-table-column prop="skuId" :label="t('shop.analytics.skuId')" min-width="140" />
        <el-table-column prop="outQty" :label="t('shop.analytics.outQty')" width="120" />
        <el-table-column prop="avgStock" :label="t('shop.analytics.avgStock')" width="130">
          <template #default="{ row }">{{ Number(row.avgStock).toFixed(2) }}</template>
        </el-table-column>
        <el-table-column prop="dailyOut" :label="t('shop.analytics.dailyOut')" width="130">
          <template #default="{ row }">{{ Number(row.dailyOut).toFixed(2) }}</template>
        </el-table-column>
        <el-table-column prop="turnoverDays" :label="t('shop.analytics.turnoverDays')" width="130">
          <template #default="{ row }">{{ Number(row.turnoverDays).toFixed(2) }}</template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 推荐效果看板：CTR（曝光/点击/转化率） -->
    <el-card shadow="never" class="report-card">
      <template #header>
        <span class="card-title">{{ t('shop.analytics.recoTitle') }}</span>
      </template>
      <el-table v-loading="loading" :data="recoCtrRows" border stripe max-height="360">
        <el-table-column prop="placement" :label="t('shop.analytics.recoPlacement')" min-width="140" />
        <el-table-column prop="strategy" :label="t('shop.analytics.recoStrategy')" min-width="160" />
        <el-table-column prop="impressions" :label="t('shop.analytics.recoImpressions')" width="120" />
        <el-table-column prop="clicks" :label="t('shop.analytics.recoClicks')" width="110" />
        <el-table-column :label="t('shop.analytics.recoCtr')" width="120">
          <template #default="{ row }">{{ (Number(row.ctr) * 100).toFixed(2) }}%</template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { Search, Refresh } from '@element-plus/icons-vue'
import {
  analyticsApi,
  channelApi,
  type AnalyticsDimension,
  type ChannelOption,
  type SalesRow,
  type ProfitPoint,
  type TurnoverRow,
  type RecoCtrRow,
} from '@/api/shop'
import { getErrorMessage } from '@/utils/error'
import { useI18n } from '@/i18n'

const { t } = useI18n()

const loading = ref(false)
const channelOptions = ref<ChannelOption[]>([])

const query = reactive<{ dimension: AnalyticsDimension; startAt: string; endAt: string; channelId: number | undefined }>({
  dimension: 'day',
  startAt: '',
  endAt: '',
  channelId: undefined,
})

const salesRows = ref<SalesRow[]>([])
const profitSeries = ref<ProfitPoint[]>([])
const turnoverRows = ref<TurnoverRow[]>([])
const recoCtrRows = ref<RecoCtrRow[]>([])
const profitSummary = ref<{ revenueUSD: number; costUSD: number; grossProfitUSD: number; fxGainLossUSD: number } | null>(null)

const metrics = computed(() => [
  { label: t('shop.analytics.revenueUSD'), value: `$${(profitSummary.value?.revenueUSD ?? 0).toFixed(2)}`, cls: '' },
  { label: t('shop.analytics.grossProfitUSD'), value: `$${(profitSummary.value?.grossProfitUSD ?? 0).toFixed(2)}`, cls: 'is-up' },
  {
    label: t('shop.analytics.fxGainLossUSD'),
    value: `$${(profitSummary.value?.fxGainLossUSD ?? 0).toFixed(2)}`,
    cls: (profitSummary.value?.fxGainLossUSD ?? 0) >= 0 ? 'is-up' : 'is-down',
  },
  { label: t('shop.analytics.costUSD'), value: `$${(profitSummary.value?.costUSD ?? 0).toFixed(2)}`, cls: 'is-down' },
])

/**
 * 分组键的可读化（PLAN 3.2）。
 *
 * 后端返回的键形如 `utm:google::spring`、`channel:3`、`category:12`、`day:2026-11-13`。
 * 直接展示原始键对运营不友好，这里做展示层映射；未知前缀原样返回，避免吞掉信息。
 */
function formatDimensionKey(key: string): string {
  if (!key) return '-'
  if (key.startsWith('utm:')) {
    const rest = key.slice(4)
    const [source, campaign] = rest.split('::')
    const src = !source || source === 'direct' ? t('shop.analytics.utmDirect') : source
    if (!campaign || campaign === '(none)') return src
    return `${src} / ${campaign}`
  }
  const [, value] = key.split(':')
  return value ?? key
}

const loadSales = async (): Promise<void> => {
  try {
    const res = await analyticsApi.sales({ ...query })
    salesRows.value = res.data.rows
  } catch (err: unknown) {
    ElMessage.error(t('shop.analytics.loadFailed') + ': ' + getErrorMessage(err))
  }
}

const loadProfit = async (): Promise<void> => {
  try {
    const res = await analyticsApi.profit({ ...query })
    profitSeries.value = res.data.series
    profitSummary.value = res.data.summary
  } catch (err: unknown) {
    ElMessage.error(t('shop.analytics.loadFailed') + ': ' + getErrorMessage(err))
  }
}

const loadTurnover = async (): Promise<void> => {
  try {
    const res = await analyticsApi.turnover({ ...query })
    turnoverRows.value = res.data.rows
  } catch (err: unknown) {
    ElMessage.error(t('shop.analytics.loadFailed') + ': ' + getErrorMessage(err))
  }
}

const loadRecoCtr = async (): Promise<void> => {
  try {
    const res = await analyticsApi.recoCtr({ startAt: query.startAt, endAt: query.endAt })
    recoCtrRows.value = res.data.items
  } catch (err: unknown) {
    ElMessage.error(t('shop.analytics.loadFailed') + ': ' + getErrorMessage(err))
  }
}

const loadAll = async (): Promise<void> => {
  loading.value = true
  try {
    await Promise.all([loadSales(), loadProfit(), loadTurnover(), loadRecoCtr()])
  } finally {
    loading.value = false
  }
}

const handleReset = (): void => {
  query.dimension = 'day'
  query.startAt = ''
  query.endAt = ''
  query.channelId = undefined
  loadAll()
}

onMounted(async () => {
  try {
    const res = await channelApi.options()
    channelOptions.value = res.data
  } catch {
    channelOptions.value = []
  }
  await loadAll()
})
</script>

<style lang="scss" scoped>
.filter-card {
  margin-bottom: 16px;
  border-radius: 8px;
}

.metric-row {
  margin-bottom: 16px;
}

.metric-card {
  border-radius: 8px;

  .metric-label {
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }

  .metric-value {
    margin-top: 8px;
    font-size: 22px;
    font-weight: 600;
    color: var(--el-text-color-primary);

    &.is-up {
      color: var(--el-color-danger);
    }

    &.is-down {
      color: var(--el-color-success);
    }
  }
}

.report-card {
  margin-bottom: 16px;
  border-radius: 8px;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.card-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.currency-chip {
  display: inline-block;
  margin-right: 8px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.fx-up {
  color: var(--el-color-danger);
}

.fx-down {
  color: var(--el-color-success);
}
</style>
