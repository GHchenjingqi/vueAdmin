<template>
  <div class="server-monitor">
    <!-- 4张系统信息卡-->
    <el-row :gutter="16">
      <el-col v-for="card in systemCards" :key="card.label" :xs="12" :sm="6">
        <el-card shadow="hover" class="info-card">
          <div class="info-card__content">
            <div class="info-card__label">
              {{ card.label }}
            </div>
            <div class="info-card__value">
              {{ card.value }}
            </div>
            <MenuIcon :name="card.icon" :size="40" :color="card.iconColor" class="info-card__icon" />
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- CPU & 内存 实时折线-->
    <el-row :gutter="16" class="chart-row">
      <el-col :span="12">
        <el-card shadow="hover">
          <template #header>
            <span class="card-title">
              <el-icon :size="16"><Cpu /></el-icon>
              {{ t('server.cpuUsage') }}
            </span>
          </template>
          <div ref="cpuChartRef" class="line-chart" />
          <div class="line-detail">
            <div class="line-stat">
              <span class="line-stat__label">{{ t('server.model') }}</span>
              <span class="line-stat__value">{{ stats.cpu.model || '-' }}</span>
            </div>
            <div class="line-stat">
              <span class="line-stat__label">{{ t('server.cores') }}</span>
              <span class="line-stat__value">{{ stats.cpu.coreCount || 0 }}</span>
            </div>
            <div class="line-stat">
              <span class="line-stat__label">{{ t('server.systemLoad') }}</span>
              <span class="line-stat__value">1m: {{ stats.load.load1 || 0 }} / 5m: {{ stats.load.load5 || 0 }} / 15m: {{ stats.load.load15 || 0 }}</span>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card shadow="hover">
          <template #header>
            <span class="card-title">
              <el-icon :size="16"><Coin /></el-icon>
              {{ t('server.memoryUsage') }}
            </span>
          </template>
          <div ref="memoryChartRef" class="line-chart" />
          <div class="line-detail">
            <div class="line-stat">
              <span class="line-stat__label">{{ t('server.totalMemory') }}</span>
              <span class="line-stat__value">{{ formatMB(stats.memory.total) }}</span>
            </div>
            <div class="line-stat">
              <span class="line-stat__label">{{ t('server.used') }}</span>
              <span class="line-stat__value" style="color: #e6a23c">{{ formatMB(stats.memory.used) }}</span>
            </div>
            <div class="line-stat">
              <span class="line-stat__label">{{ t('server.free') }}</span>
              <span class="line-stat__value" style="color: #67c23a">{{ formatMB(stats.memory.free) }}</span>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 磁盘 仪表-->
    <el-row :gutter="16" class="chart-row">
      <el-col v-for="disk in stats.disks" :key="disk.caption" :span="12">
        <el-card shadow="hover">
          <template #header>
            <span class="card-title">
              <el-icon :size="16"><FolderOpened /></el-icon>
              {{ disk.caption }}
              <span class="disk-size-tag">{{ disk.total ? formatGB(disk.total) : '' }}</span>
            </span>
          </template>
          <div :ref="(el: Element | ComponentPublicInstance | null) => setDiskGaugeRef(el, disk.caption)" class="disk-gauge" />
          <div class="disk-gauge-detail">
            <div class="line-stat">
              <span class="line-stat__label">{{ t('server.used2') }}</span>
              <span class="line-stat__value" style="color: #409eff">{{ disk.used ? disk.used + ' GB' : '-' }}</span>
            </div>
            <div class="line-stat">
              <span class="line-stat__label">{{ t('server.free') }}</span>
              <span class="line-stat__value" style="color: #67c23a">{{ disk.free ? disk.free + ' GB' : '-' }}</span>
            </div>
            <div class="line-stat">
              <span class="line-stat__label">{{ t('server.total') }}</span>
              <span class="line-stat__value">{{ disk.total ? disk.total + ' GB' : '-' }}</span>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col v-if="!stats.disks || stats.disks.length === 0" :span="24">
        <el-card shadow="hover">
          <el-empty :description="t('server.noDiskData')" />
        </el-card>
      </el-col>
    </el-row>

    <!-- 底部 -->
    <div class="monitor-footer">
      <span class="update-time">{{ t('server.lastUpdate') }}{{ lastUpdate }}</span>
      <el-switch
        v-model="autoRefresh"
        :active-text="t('server.autoRefresh')"
        :inactive-text="t('server.pauseRefresh')"
        size="small"
        @change="handleRefreshToggle"
      />
      <el-popover placement="top" :width="280" trigger="click">
        <template #reference>
          <el-button size="small" :icon="Setting">
            {{ t('server.historyConfig') }}
          </el-button>
        </template>
        <div class="config-popover">
          <div class="config-item">
            <span>{{ t('server.persistentStorage') }}</span>
            <el-switch v-model="config.persistEnabled" size="small" @change="handleConfigChange" />
          </div>
          <div class="config-item">
            <span>{{ t('server.retentionMinutes') }}</span>
            <el-input-number
              v-model="config.retentionMinutes"
              :min="5"
              :max="1440"
              :step="5"
              size="small"
              controls-position="right"
              @change="handleConfigChange"
            />
          </div>
          <div class="config-hint">
            {{ t('server.configHint') }}
          </div>
        </div>
      </el-popover>
      <el-button size="small" type="primary" :icon="Refresh" :loading="loading" @click="fetchStats">
        {{ t('server.refreshNow') }}
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { type ComponentPublicInstance } from 'vue'
import { ElMessage } from 'element-plus'
import { Cpu, Coin, FolderOpened, Refresh, Setting } from '@element-plus/icons-vue'
import type { ECharts } from 'echarts'
import { serverApi } from '@/api'
import { useI18n } from '@/i18n'

interface DiskInfo {
  caption: string
  total: number
  used: number
  free: number
  usagePercent: number
}

interface ServerStats {
  cpu: { usagePercent: number; coreCount: number; model: string }
  memory: { total: number; used: number; free: number; usagePercent: number }
  disks: DiskInfo[]
  load: { load1: number; load5: number; load15: number }
  uptime: { days: number; hours: number; minutes: number; text: string }
  os: { platform: string; arch: string; hostname: string; nodeVersion: string }
}

interface TimedValue {
  value: number
  time: number
}

const { t } = useI18n()

// ---------- 状态---------
const stats = ref<ServerStats>({
  cpu: { usagePercent: 0, coreCount: 0, model: '' },
  memory: { total: 0, used: 0, free: 0, usagePercent: 0 },
  disks: [],
  load: { load1: 0, load5: 0, load15: 0 },
  uptime: { days: 0, hours: 0, minutes: 0, text: '' },
  os: { platform: '', arch: '', hostname: '', nodeVersion: '' },
})
const loading = ref(false)
const autoRefresh = ref(true)
const lastUpdate = ref('')
const cpuChartRef = ref<HTMLElement | null>(null)
const memoryChartRef = ref<HTMLElement | null>(null)
let refreshTimer: ReturnType<typeof setInterval> | null = null

// ---------- 懒加载 ECharts 初始化（大体积库，页面进入时按需加载）----------
let echartsModule: typeof import('echarts') | null = null
let echartsPromise: Promise<typeof import('echarts')> | null = null

async function getECharts(): Promise<typeof import('echarts')> {
  if (echartsModule) return echartsModule
  if (!echartsPromise) {
    echartsPromise = import('echarts')
  }
  echartsModule = await echartsPromise
  return echartsModule
}

let cpuChart: ECharts | null = null
let memoryChart: ECharts | null = null
const diskGauges: Record<string, ECharts> = {}

// ---------- 配置（localStorage 持久+ 保留时长，可动态调整）----------
const CONFIG_KEY = 'monitor_config'

interface MonitorConfig {
  persistEnabled: boolean
  retentionMinutes: number
}

const config = ref<MonitorConfig>(loadConfig())

function loadConfig(): MonitorConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY)
    return raw ? { persistEnabled: true, retentionMinutes: 60, ...JSON.parse(raw) } : { persistEnabled: true, retentionMinutes: 60 }
  } catch {
    // localStorage 配置读取失败，使用默认值
    return { persistEnabled: true, retentionMinutes: 60 }
  }
}
function saveConfig(): void {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config.value))
  } catch {
    // localStorage 写入失败（如存储空间不足），忽略
  }
}

// ---------- 历史数据（localStorage 持久化）----------
const CPU_KEY = 'monitor_cpu'
const MEM_KEY = 'monitor_mem'

/** 根据配置的保留时长（分钟）计算最大点数：分钟 × 60 ÷ 5 秒间隔） */
function getMaxHistory(): number {
  return Math.min(Math.round((config.value.retentionMinutes * 60) / 5), 1440)
}

function loadTimed(key: string): TimedValue[] {
  try {
    const raw = localStorage.getItem(key)
    if (!raw || !config.value.persistEnabled) return []
    const data: TimedValue[] = JSON.parse(raw) as TimedValue[]
    const now = Date.now()
    const retentionMs = config.value.retentionMinutes * 60 * 1000
    return data.filter((d) => now - d.time < retentionMs).slice(-getMaxHistory())
  } catch {
    // localStorage 历史数据读取失败，返回空数组
    return []
  }
}
function saveTimed(key: string, data: TimedValue[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(data.slice(-getMaxHistory())))
  } catch {
    // localStorage 写入失败，忽略
  }
}

// localStorage 恢复（含时间戳）
const cpuTimed = loadTimed(CPU_KEY)
const memTimed = loadTimed(MEM_KEY)

// 图表数组 = 实际数据点数（无零填充），刚好占满横坐标
const cpuHistory = cpuTimed.map((d) => d.value)
const memoryHistory = memTimed.map((d) => d.value)

// ---------- 磁盘仪表----------
const diskGaugeRefs: Record<string, HTMLElement> = {}

const systemCards = ref<{ label: string; value: string; icon: string; iconColor?: string }[]>([
  { label: t('server.serverName'), value: '-', icon: 'Monitor' },
  { label: t('server.os'), value: '-', icon: 'Service' },
  { label: t('server.uptime'), value: '-', icon: 'Timer' },
  { label: t('server.nodeVersion'), value: '-', icon: 'Connection' },
])

const formatMB = (mb: number): string => (!mb ? '0 MB' : mb >= 1024 ? (mb / 1024).toFixed(2) + ' GB' : mb + ' MB')
const formatGB = (gb: number): string => (gb ? gb.toFixed(1) + ' GB' : '0 GB')

// ========== CPU 折线==========
async function createCPUChart() {
  if (!cpuChartRef.value) return
  const echarts = await getECharts()
  if (cpuChart) cpuChart.dispose()
  cpuChart = echarts.init(cpuChartRef.value)
  const dataLen = Math.max(cpuHistory.length, 1)
  cpuChart.setOption({
    grid: { left: 8, right: 8, top: 8, bottom: 8 },
    tooltip: {
      trigger: 'axis',
      formatter: '{c0}%',
      backgroundColor: 'rgba(255,255,255,0.9)',
      borderWidth: 0,
      textStyle: { fontSize: 12 },
      axisPointer: { type: 'line', lineStyle: { color: '#409eff', type: 'dashed', width: 1 } },
    },
    xAxis: { type: 'category', show: false, data: Array(dataLen).fill('') },
    yAxis: { type: 'value', min: 0, max: 100, splitLine: { lineStyle: { color: '#f0f0f0', type: 'dashed' } }, axisLabel: { fontSize: 11, color: '#999' } },
    series: [
      {
        type: 'line',
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 2, color: '#409eff' },
        data: cpuHistory,
      },
    ],
  })
}

// ========== 内存折线==========
async function createMemoryChart() {
  if (!memoryChartRef.value) return
  const echarts = await getECharts()
  if (memoryChart) memoryChart.dispose()
  memoryChart = echarts.init(memoryChartRef.value)
  const dataLen = Math.max(memoryHistory.length, 1)
  memoryChart.setOption({
    grid: { left: 8, right: 8, top: 8, bottom: 8 },
    tooltip: {
      trigger: 'axis',
      formatter: '{c0}%',
      backgroundColor: 'rgba(255,255,255,0.9)',
      borderWidth: 0,
      textStyle: { fontSize: 12 },
      axisPointer: { type: 'line', lineStyle: { color: '#67c23a', type: 'dashed', width: 1 } },
    },
    xAxis: { type: 'category', show: false, data: Array(dataLen).fill('') },
    yAxis: { type: 'value', min: 0, max: 100, splitLine: { lineStyle: { color: '#f0f0f0', type: 'dashed' } }, axisLabel: { fontSize: 11, color: '#999' } },
    series: [
      {
        type: 'line',
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 2, color: '#67c23a' },
        data: memoryHistory,
      },
    ],
  })
}

// ========== 磁盘仪表==========
function setDiskGaugeRef(el: Element | ComponentPublicInstance | null, caption: string): void {
  const htmlEl = el as HTMLElement | null
  if (htmlEl && caption) diskGaugeRefs[caption] = htmlEl
}

async function createDiskGauge(caption: string, usagePercent: number): Promise<void> {
  const el = diskGaugeRefs[caption]
  if (!el) return
  const echarts = await getECharts()
  if (diskGauges[caption]) diskGauges[caption].dispose()
  const chart = echarts.init(el)
  diskGauges[caption] = chart
  chart.setOption({
    series: [
      {
        type: 'gauge',
        startAngle: 220,
        endAngle: -40,
        min: 0,
        max: 100,
        splitNumber: 5,
        progress: { show: true, width: 10 },
        axisLine: {
          lineStyle: {
            width: 10,
            color: [
              [0.5, '#67c23a'],
              [0.8, '#e6a23c'],
              [1, '#f56c6c'],
            ],
          },
        },
        axisTick: { show: false },
        splitLine: { length: 6, lineStyle: { width: 2, color: '#999' } },
        axisLabel: { distance: 16, color: '#999', fontSize: 10 },
        pointer: { width: 3, length: '50%' },
        anchor: { show: true, size: 14, itemStyle: { borderColor: '#999', borderWidth: 2 } },
        detail: { valueAnimation: true, fontSize: 22, fontWeight: 700, formatter: '{value}%', color: '#303133' },
        data: [{ value: usagePercent }],
      },
    ],
  })
}

function updateDiskGauge(caption: string, usagePercent: number): void {
  const chart = diskGauges[caption]
  if (chart) chart.setOption({ series: [{ data: [{ value: usagePercent }] }] })
}

// ========== 更新所有图==========
function updateCharts(): void {
  const maxLen = getMaxHistory()

  // CPU
  cpuHistory.push(stats.value.cpu.usagePercent)
  while (cpuHistory.length > maxLen) cpuHistory.shift()
  if (config.value.persistEnabled) {
    cpuTimed.push({ value: stats.value.cpu.usagePercent, time: Date.now() })
    saveTimed(CPU_KEY, cpuTimed)
  }
  if (cpuChart)
    cpuChart.setOption({
      xAxis: { data: Array(cpuHistory.length).fill('') },
      series: [{ data: cpuHistory }],
    })

  // 内存
  memoryHistory.push(stats.value.memory.usagePercent)
  while (memoryHistory.length > maxLen) memoryHistory.shift()
  if (config.value.persistEnabled) {
    memTimed.push({ value: stats.value.memory.usagePercent, time: Date.now() })
    saveTimed(MEM_KEY, memTimed)
  }
  if (memoryChart)
    memoryChart.setOption({
      xAxis: { data: Array(memoryHistory.length).fill('') },
      series: [{ data: memoryHistory }],
    })

  // 磁盘仪表
  for (const disk of stats.value.disks) {
    if (diskGauges[disk.caption]) {
      updateDiskGauge(disk.caption, disk.usagePercent)
    }
  }
}

const handleResize = (): void => {
  if (cpuChart) cpuChart.resize()
  if (memoryChart) memoryChart.resize()
  Object.values(diskGauges).forEach((c) => c.resize())
}

const fetchStats = async (): Promise<void> => {
  loading.value = true
  try {
    const res = await serverApi.getStats()
    stats.value = res.data
    systemCards.value = [
      { label: t('server.serverName'), value: res.data.os.hostname, icon: 'Monitor' },
      { label: t('server.os'), value: `${res.data.os.platform} (${res.data.os.arch})`, icon: 'Aim' },
      { label: t('server.uptime'), value: res.data.uptime.text, icon: 'Timer' },
      { label: t('server.nodeVersion'), value: res.data.os.nodeVersion, icon: 'Connection' },
    ]
    lastUpdate.value = new Date().toLocaleTimeString()
    await nextTick()
    // 初始化磁盘仪表盘（DOM 渲染完成ref 回调已触发）
    for (const disk of stats.value.disks) {
      if (disk.total > 0 && !diskGauges[disk.caption]) {
        await createDiskGauge(disk.caption, disk.usagePercent)
      }
    }
    updateCharts()
  } catch (_err) {
    // 服务器监控数据获取失败
    ElMessage.error(t('server.fetchFailed') || t('common.fetchFailed'))
  } finally {
    loading.value = false
  }
}

const handleRefreshToggle = (val: string | number | boolean): void => {
  if (val) startAutoRefresh()
  else stopAutoRefresh()
}
const startAutoRefresh = (): void => {
  stopAutoRefresh()
  refreshTimer = setInterval(fetchStats, 5000)
}
const stopAutoRefresh = (): void => {
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }
}

// ---------- 配置变更处理 ----------
function reloadHistory(): void {
  const rebuild = (timedArr: TimedValue[], storageKey: string, valueArr: number[]): void => {
    const maxLen = getMaxHistory()
    const loaded = config.value.persistEnabled ? loadTimed(storageKey) : []
    timedArr.length = 0
    timedArr.push(...loaded.slice(-maxLen))
    valueArr.length = 0
    timedArr.forEach((d: TimedValue) => valueArr.push(d.value))
  }
  rebuild(cpuTimed, CPU_KEY, cpuHistory)
  rebuild(memTimed, MEM_KEY, memoryHistory)
  // 重建图表使横坐标匹配新长
  createCPUChart()
  createMemoryChart()
}

function handleConfigChange(): void {
  saveConfig()
  if (!config.value.persistEnabled) {
    // 关闭持久化时清除 localStorage 中的历史
    localStorage.removeItem(CPU_KEY)
    localStorage.removeItem(MEM_KEY)
    cpuTimed.length = 0
    memTimed.length = 0
  }
  reloadHistory()
}

onMounted(async () => {
  await fetchStats()
  await nextTick()
  await createCPUChart()
  await createMemoryChart()
  window.addEventListener('resize', handleResize)
  if (autoRefresh.value) startAutoRefresh()
})
onUnmounted(() => {
  stopAutoRefresh()
  window.removeEventListener('resize', handleResize)
  if (cpuChart) cpuChart.dispose()
  if (memoryChart) memoryChart.dispose()
  Object.values(diskGauges).forEach((c) => c.dispose())
})
</script>

<style lang="scss" scoped>
.server-monitor {
  padding: 16px;
}
.info-card {
  margin-bottom: 16px;
  padding-bottom: 10px;
  height: 100px;
}
.info-card__content {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.info-card__label {
  font-size: 13px;
  color: var(--text-secondary, #909399);
}
.info-card__value {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary, #303133);
  margin-top: 12px;
}
.info-card__icon {
  position: absolute;
  right: 0;
  top: 4px;
  opacity: 0.6;
}
.chart-row {
  margin-bottom: 16px;
}

/* CPU / 内存 折线*/
.line-chart {
  width: 100%;
  height: 280px;
}
.line-detail {
  display: flex;
  gap: 20px;
  padding: 8px 0 4px;
  border-top: 1px solid var(--border-color, #ebeef5);
}
.line-stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  align-items: center;
}
.line-stat__label {
  font-size: 12px;
  color: var(--text-secondary, #909399);
}
.line-stat__value {
  font-size: 13px;
  color: var(--text-primary, #303133);
  font-weight: 500;
}

/* 磁盘仪表*/
.disk-gauge {
  width: 100%;
  height: 240px;
}
.disk-gauge-detail {
  display: flex;
  gap: 20px;
  padding: 4px 0 8px;
}
.disk-gauge-detail .line-stat {
  flex: 1;
}
.disk-size-tag {
  font-size: 12px;
  color: var(--text-secondary, #909399);
  font-weight: 400;
  margin-left: 4px;
}
.monitor-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 16px;
  padding: 12px 0;
}
.update-time {
  font-size: 12px;
  color: var(--text-secondary, #909399);
  margin-right: auto;
}
.card-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
}
.config-popover {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.config-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
}
.config-hint {
  font-size: 11px;
  color: var(--text-secondary, #909399);
  line-height: 1.4;
}
</style>
