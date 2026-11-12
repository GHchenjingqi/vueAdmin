<template>
  <div class="page-container dashboard">
    <!-- 欢迎 -->
    <section class="welcome-card" :aria-label="t('accessibility.welcomeAndStatus')">
      <div class="welcome-left">
        <div class="welcome-greeting">{{ greetingText }}, {{ username }}</div>
        <div class="welcome-sub">
          {{ welcomeSubText }}
        </div>
      </div>
      <div class="welcome-right">
        <div class="welcome-meta">
          <span class="welcome-label">{{ t('dashboard.currentDate') }}</span>
          <span class="welcome-value">{{ currentDateText }}</span>
        </div>
        <div class="welcome-meta">
          <span class="welcome-label">{{ t('dashboard.systemStatus') }}</span>
          <span class="welcome-value status-online">
            <span class="dot-online" />
            {{ t('dashboard.running') }}
          </span>
        </div>
      </div>
    </section>

    <!-- 数据卡片 - 骨架屏 -->
    <el-row v-if="loading" :gutter="16">
      <el-col v-for="i in 4" :key="i" :xs="24" :sm="12" :md="6">
        <el-card shadow="hover" class="stat-card">
          <el-skeleton :rows="2" animated />
        </el-card>
      </el-col>
    </el-row>

    <!-- 数据卡片 - 实际内容 -->
    <section v-else :aria-label="t('accessibility.statsOverview')">
      <el-row :gutter="16">
        <el-col v-for="item in statsCards as unknown as any[]" :key="item.title" :xs="24" :sm="12" :md="6">
          <el-card shadow="hover" class="stat-card" :aria-label="item.title + ': ' + item.value">
            <div class="stat-content">
              <div class="stat-info">
                <div class="stat-title">
                  {{ item.title }}
                </div>
                <div class="stat-value">
                  {{ item.value }}
                </div>
                <div v-if="item.trendText" class="stat-trend">
                  <el-icon :size="12" :class="item.trendUp ? 'trend-up' : 'trend-down'">
                    <CaretTop v-if="item.trendUp" />
                    <CaretBottom v-else />
                  </el-icon>
                  <span>{{ item.trendText }}</span>
                </div>
              </div>
              <div class="stat-icon" :style="{ background: item.iconBg }">
                <MenuIcon :name="item.icon" :size="24" :color="item.iconColor" />
              </div>
            </div>
          </el-card>
        </el-col>
      </el-row>
    </section>

    <!-- 趋势图表（P2-12 ECharts 增强） -->
    <section class="trend-section">
      <el-card shadow="hover" class="chart-card">
        <template #header>
          <div class="chart-head">
            <span class="card-title">{{ t('dashboard.trendTitle') }}</span>
            <el-radio-group v-model="trendDays" size="small" @change="loadTrends">
              <el-radio-button :value="7">7D</el-radio-button>
              <el-radio-button :value="14">14D</el-radio-button>
              <el-radio-button :value="30">30D</el-radio-button>
            </el-radio-group>
          </div>
        </template>
        <div ref="trendChartRef" class="chart-box" />
      </el-card>
      <el-card shadow="hover" class="chart-card">
        <template #header>
          <span class="card-title">{{ t('dashboard.revenueTitle') }}</span>
        </template>
        <div ref="revenueChartRef" class="chart-box" />
      </el-card>
    </section>

    <!-- 快速入?提示 - 骨架屏 -->
    <el-card v-if="loading" shadow="hover" class="info-card">
      <template #header>
        <el-skeleton :rows="1" animated style="width: 120px" />
      </template>
      <el-skeleton :rows="3" animated />
    </el-card>

    <!-- 快速入?提示 - 实际内容 -->
    <el-card v-else shadow="hover" class="info-card">
      <template #header>
        <span class="card-title">{{ t('dashboard.systemInfo') }}</span>
      </template>
      <p>{{ t('dashboard.desc1') }}</p>
      <p>{{ t('dashboard.desc2') }}</p>
      <p>{{ t('dashboard.desc3') }}</p>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { CaretTop, CaretBottom } from '@element-plus/icons-vue'
import { dashboardApi } from '@/api'
import { getErrorMessage } from '@/utils/error'
import { useUserStore } from '@/stores'
import { useI18n } from '@/i18n'
import { onBeforeUnmount } from 'vue'
import type { ECharts } from 'echarts'
import type { DashboardTrend } from '@/api/dashboard'

const userStore = useUserStore()
const { t } = useI18n()
const username = computed(() => userStore.username || t('common.default'))

const loading = ref(true)

interface StatsCard {
  title: string
  value: number
  icon: string
  iconColor: string
  iconBg: string
  trendText: string
  trendUp: boolean
}

const statsCards = ref<StatsCard[]>([
  {
    title: t('dashboard.totalUsers'),
    value: 0,
    icon: 'User',
    iconColor: '#1890ff',
    iconBg: '#e6f4ff',
    trendText: t('dashboard.comparedToYesterday') + '12%',
    trendUp: true,
  },
  {
    title: t('dashboard.todayNew'),
    value: 0,
    icon: 'TrendCharts',
    iconColor: '#52c41a',
    iconBg: '#f6ffed',
    trendText: t('dashboard.comparedToYesterday') + '8%',
    trendUp: true,
  },
  {
    title: t('dashboard.activeUsers'),
    value: 0,
    icon: 'Refresh',
    iconColor: '#faad14',
    iconBg: '#fffbe6',
    trendText: t('dashboard.comparedToYesterday') + '3%',
    trendUp: false,
  },
  {
    title: t('dashboard.systemMessages'),
    value: 0,
    icon: 'Message',
    iconColor: '#f5222d',
    iconBg: '#fff1f0',
    trendText: t('dashboard.comparedToYesterday') + '5%',
    trendUp: true,
  },
])

const greetingText = computed(() => {
  const hour = new Date().getHours()
  if (hour < 6) return t('dashboard.morning')
  if (hour < 12) return t('dashboard.morning2')
  if (hour < 14) return t('dashboard.noon')
  if (hour < 18) return t('dashboard.afternoon')
  return t('dashboard.evening')
})

const welcomeSubText = computed(() => {
  const texts = [t('dashboard.welcome1'), t('dashboard.welcome2'), t('dashboard.welcome3')]
  return texts[Math.floor(Math.random() * texts.length)]
})

const currentDateText = computed(() => {
  const d = new Date()
  const weekdays = [t('dashboard.sun'), t('dashboard.mon'), t('dashboard.tue'), t('dashboard.wed'), t('dashboard.thu'), t('dashboard.fri'), t('dashboard.sat')]
  return `${d.getFullYear()}${t('common.year')}${d.getMonth() + 1}${t('common.month')}${d.getDate()}${t('common.day')} ${weekdays[d.getDay()]}`
})

onMounted(async () => {
  try {
    const res = await dashboardApi.getStats()
    const statsData: Array<{ value: number }> = res.data as unknown as Array<{ value: number }>
    statsCards.value = statsCards.value.map((card, index) => ({
      ...card,
      value: statsData[index]?.value ?? card.value,
    }))
  } catch (err: unknown) {
    ElMessage.error(t('dashboard.fetchFailed') + ' ' + getErrorMessage(err))
  } finally {
    loading.value = false
  }
})

// ===== P2-12 ECharts 增强 =====
const trendDays = ref(30)
const trendChartRef = ref<HTMLDivElement | null>(null)
const revenueChartRef = ref<HTMLDivElement | null>(null)
let echartsMod: typeof import('echarts') | null = null
let echartsPromise: Promise<typeof import('echarts')> | null = null
async function getEcharts(): Promise<typeof import('echarts')> {
  if (echartsMod) return echartsMod
  if (!echartsPromise) echartsPromise = import('echarts')
  echartsMod = await echartsPromise
  return echartsMod
}
let trendChart: ECharts | null = null
let revenueChart: ECharts | null = null

async function renderTrend(d: DashboardTrend): Promise<void> {
  const echarts = await getEcharts()
  if (!trendChartRef.value) return
  trendChart?.dispose()
  trendChart = echarts.init(trendChartRef.value)
  trendChart.setOption({
    tooltip: { trigger: 'axis' },
    legend: { data: [t('dashboard.newUsers'), t('dashboard.newOrders')] },
    grid: { left: 44, right: 16, top: 40, bottom: 30 },
    xAxis: { type: 'category', data: d.days, boundaryGap: false },
    yAxis: { type: 'value' },
    series: [
      { name: t('dashboard.newUsers'), type: 'line', smooth: true, data: d.newUsers, itemStyle: { color: '#409eff' }, areaStyle: { opacity: 0.08 } },
      { name: t('dashboard.newOrders'), type: 'line', smooth: true, data: d.newOrders, itemStyle: { color: '#67c23a' } },
    ],
  })
}

async function renderRevenue(d: DashboardTrend): Promise<void> {
  const echarts = await getEcharts()
  if (!revenueChartRef.value) return
  revenueChart?.dispose()
  revenueChart = echarts.init(revenueChartRef.value)
  revenueChart.setOption({
    tooltip: { trigger: 'axis' },
    grid: { left: 56, right: 16, top: 24, bottom: 30 },
    xAxis: { type: 'category', data: d.days, boundaryGap: true },
    yAxis: { type: 'value', name: t('dashboard.revenueUnit') },
    series: [{ name: t('dashboard.revenue'), type: 'bar', data: d.revenue, itemStyle: { color: '#e6a23c' }, barMaxWidth: 18 }],
  })
}

async function loadTrends(): Promise<void> {
  try {
    const res = await dashboardApi.getTrends(trendDays.value)
    await renderTrend(res.data)
    await renderRevenue(res.data)
  } catch (err: unknown) {
    // 趋势图加载失败不阻断主卡片展示
    console.warn('[dashboard] trends load failed:', err)
  }
}

function handleResize(): void {
  trendChart?.resize()
  revenueChart?.resize()
}

onMounted(() => {
  window.addEventListener('resize', handleResize)
  void loadTrends()
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  trendChart?.dispose()
  revenueChart?.dispose()
})
</script>

<style lang="scss" scoped>
.dashboard {
  /* padding handled by .page-container */
}

/* 欢迎卡片 */
.welcome-card {
  background: var(--card-bg);
  border-radius: 8px;
  padding: 24px;
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 16px;
  border: 1px solid var(--border-light);
}

.welcome-greeting {
  font-size: 20px;
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 6px;
}

.welcome-sub {
  color: var(--text-secondary);
  font-size: 13px;
}

.welcome-right {
  display: flex;
  gap: 32px;
}

.welcome-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.welcome-label {
  font-size: 12px;
  color: var(--text-secondary);
}

.welcome-value {
  font-size: 14px;
  color: var(--text-primary);
  font-weight: 500;
}

.status-online {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #52c41a;
}

.dot-online {
  width: 6px;
  height: 6px;
  background: #52c41a;
  border-radius: 50%;
  box-shadow: 0 0 0 3px rgba(82, 196, 26, 0.3);
}

/* 数据卡片 */
.stat-card {
  margin-bottom: 16px;
}

.stat-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.stat-info {
  flex: 1;
  min-width: 0;
}

.stat-title {
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.stat-value {
  font-size: 28px;
  font-weight: 600;
  color: var(--text-primary);
  letter-spacing: 0.5px;
  margin-bottom: 4px;
}

.stat-trend {
  font-size: 12px;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  gap: 2px;
}

.trend-up {
  color: #52c41a;
}

.trend-down {
  color: #f5222d;
}

.stat-icon {
  width: 52px;
  height: 52px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-left: 16px;
}

/* 信息卡片 */
.info-card {
  margin-top: 8px;
}

.card-title {
  font-size: 15px;
  font-weight: 500;
  color: var(--text-primary);
}

.info-card p {
  margin: 8px 0;
  color: var(--text-regular);
  font-size: 14px;
  line-height: 1.6;
}

.info-card b {
  color: var(--mainColor);
  font-weight: 500;
}

/* 趋势图表（P2-12 ECharts 增强） */
.trend-section {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-top: 16px;
}

@media (max-width: 900px) {
  .trend-section {
    grid-template-columns: 1fr;
  }
}

.chart-card {
  margin-bottom: 0;
}

.chart-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.chart-box {
  width: 100%;
  height: 300px;
}
</style>
