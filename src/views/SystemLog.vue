<template>
  <div class="page-container">
    <ProTable
      :title="t('log.title')"
      :columns="columns"
      :search-fields="searchFields"
      :data="logs"
      :loading="loading"
      :show-pagination="true"
      :pagination="pagination"
      :search-params="searchParams"
      column-settings-key="system_log"
      model-type="page"
      @query="onQuery"
    >
      <template #header-buttons>
        <el-button :icon="Download" @click="handleExport">
          {{ t('log.export') }}
        </el-button>
        <el-button :icon="Warning" type="warning" @click="showFailureStats">
          {{ t('log.loginFailureStats') }}
        </el-button>
        <el-button :icon="Delete" type="danger" @click="handleCleanup">
          {{ t('log.cleanup') }}
        </el-button>
      </template>
      <template #column-createdAt="{ row }">
        {{ formatTime(row.createdAt) }}
      </template>

      <template #column-actions="{ row }">
        <el-button type="primary" link size="small" @click="openDetailDialog(row)">
          {{ t('log.detail') }}
        </el-button>
      </template>
    </ProTable>

    <el-dialog v-model="detailVisible" :title="t('log.logDetail')" width="720px" :close-on-click-modal="false">
      <template v-if="currentLog">
        <el-descriptions :column="2" border size="small">
          <el-descriptions-item :label="t('log.logType')" :span="2">
            <el-tag :type="currentLog.type === 'login' ? 'success' : 'warning'" size="small">
              {{ currentLog.type === 'login' ? t('log.loginLog') : t('log.operationLog') }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item :label="t('log.operationTime')" :span="2">
            {{ formatTime(currentLog.createdAt) }}
          </el-descriptions-item>
          <el-descriptions-item :label="t('log.operator')">
            {{ currentLog.username || '-' }}
          </el-descriptions-item>
          <el-descriptions-item :label="t('log.userId')">
            {{ currentLog.userId || '-' }}
          </el-descriptions-item>
          <el-descriptions-item :label="t('log.action')" :span="2">
            {{ currentLog.action }}
          </el-descriptions-item>
          <el-descriptions-item :label="t('log.target')" :span="2">
            {{ currentLog.target || '-' }}
          </el-descriptions-item>
          <el-descriptions-item :label="t('log.ipAddress')" :span="2">
            {{ currentLog.ipAddress || '-' }}
          </el-descriptions-item>
          <el-descriptions-item label="User-Agent" :span="2">
            <pre class="detail-pre">{{ currentLog.userAgent || '-' }}</pre>
          </el-descriptions-item>
        </el-descriptions>

        <!-- 变更详情（Diff 格式） -->
        <template v-if="currentLog.type === 'operation' && parsedChanges.length > 0">
          <el-divider />
          <h4 class="diff-title">
            {{ t('log.changes') }}
          </h4>
          <div class="diff-table-wrap">
            <table class="diff-table">
              <thead>
                <tr>
                  <th class="diff-th" style="width: 120px">
                    {{ t('log.field') }}
                  </th>
                  <th class="diff-th diff-old">
                    {{ t('log.before') }}
                  </th>
                  <th class="diff-th diff-new">
                    {{ t('log.after') }}
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="change in parsedChanges" :key="change.field" class="diff-row">
                  <td class="diff-td diff-field">
                    {{ change.field }}
                  </td>
                  <td class="diff-td diff-old">
                    <span class="diff-val diff-val-old">{{ change.before || '-' }}</span>
                  </td>
                  <td class="diff-td diff-new">
                    <span class="diff-val diff-val-new">{{ change.after || '-' }}</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>

        <!-- 原始详情（作为 fallback） -->
        <template v-if="currentLog.type === 'login'">
          <el-divider />
          <el-descriptions :column="1" border size="small">
            <el-descriptions-item :label="t('log.operationDetail')">
              <pre class="detail-pre">{{ currentLog.details || '-' }}</pre>
            </el-descriptions-item>
          </el-descriptions>
        </template>
      </template>
    </el-dialog>

    <el-dialog v-model="failureVisible" :title="t('log.loginFailureTitle')" width="800px">
      <el-descriptions :column="2" border size="small" style="margin-bottom: 16px">
        <el-descriptions-item :label="t('log.totalFailures')">
          {{ failureData.total }}
        </el-descriptions-item>
        <el-descriptions-item :label="t('log.suspiciousIps')">
          {{ failureData.ipStats.length || 0 }}
        </el-descriptions-item>
      </el-descriptions>

      <h4 style="margin-bottom: 12px">
        {{ t('log.ipAttackStats') }}
      </h4>
      <el-table :data="failureData.ipStats" border stripe size="small" max-height="300">
        <el-table-column prop="ip" :label="t('log.ip')" width="160" />
        <el-table-column prop="count" :label="t('log.failureCount')" width="100" />
        <el-table-column prop="usernames" :label="t('log.attemptedUsernames')" min-width="180" />
        <el-table-column prop="lastTime" :label="t('log.lastTime')" width="180" />
      </el-table>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import { Download, Warning, Delete } from '@element-plus/icons-vue'
import { logApi } from '@/api'
import type { LogQueryParams } from '@/api/log'
import type { LogEntry } from '@/types/api'
import { getErrorMessage } from '@/utils/error'
import ProTable from '@/components/ProTable/index.vue'
import { useI18n } from '@/i18n'

const { t } = useI18n()

/** 本地扩展的日志条目类型，包含模板中使用的额外字段 */
interface LogEntryDisplay extends LogEntry {
  userId?: number
  action?: string
  target?: string
  ipAddress?: string
  userAgent?: string
  details?: string
}

const columns = computed(() => [
  { prop: 'index', label: t('common.index'), width: 60 },
  { prop: 'createdAt', label: t('log.operationTime'), width: 175 },
  {
    prop: 'type',
    label: t('log.logType'),
    width: 100,
    formatter: (row: Record<string, unknown>) => {
      const rowType = row.type as string
      return rowType === 'login' ? t('log.loginLog') : t('log.operationLog')
    },
  },
  { prop: 'username', label: t('log.operator'), width: 120 },
  { prop: 'action', label: t('log.action'), width: 140 },
  { prop: 'target', label: t('log.target'), minWidth: 200, showOverflowTooltip: true },
  { prop: 'ipAddress', label: t('log.ipAddress'), width: 150 },
  { prop: 'actions', label: t('common.actions'), width: 80, fixed: 'right', align: 'center' },
])

const searchFields = computed(() => [
  {
    prop: 'type',
    label: t('log.logType'),
    type: 'select',
    placeholder: t('log.allTypes'),
    options: () => [
      { label: t('log.loginLog'), value: 'login' },
      { label: t('log.operationLog'), value: 'operation' },
    ],
  },
  {
    prop: 'keyword',
    label: t('log.keyword'),
    type: 'input',
    placeholder: t('log.searchPlaceholder'),
  },
  {
    prop: 'dateRange',
    label: t('log.timeRange'),
    type: 'dateRange',
    placeholder: t('log.selectTimeRange'),
  },
])

const failureVisible = ref(false)

const failureData = reactive<{
  total: number
  ipStats: Array<{ ip: string; count: number; usernames?: string; lastTime?: string }>
  details: LogEntry[]
}>({
  total: 0,
  ipStats: [],
  details: [],
})

const logs = ref<LogEntryDisplay[]>([])
const loading = ref(false)
const searchParams = reactive<{
  type: string
  keyword: string
  dateRange: string[]
}>({
  type: '',
  keyword: '',
  dateRange: [],
})

const pagination = reactive({ pageNum: 1, pageSize: 10, total: 0 })

const detailVisible = ref(false)
const currentLog = ref<LogEntryDisplay | null>(null)

// 解析操作日志的变更diff
const parsedChanges = computed(() => {
  if (!currentLog.value || currentLog.value.type !== 'operation') return []
  try {
    const details = JSON.parse(currentLog.value.details || '{}')
    if (details && Array.isArray(details.changes)) {
      const changes = details.changes as Array<{ field: string; before: string; after: string }>
      return changes
    }
  } catch {
    // 非JSON格式details，忽略解析错误
  }
  return []
})

const fetchLogs = async (): Promise<void> => {
  loading.value = true
  try {
    const params: LogQueryParams = {
      page: pagination.pageNum,
      pageSize: pagination.pageSize,
      type: searchParams.type || undefined,
      keyword: searchParams.keyword || undefined,
    }
    if (searchParams.dateRange && searchParams.dateRange.length === 2) {
      params.startDate = searchParams.dateRange[0]
      params.endDate = searchParams.dateRange[1]
    }
    const res = await logApi.list(params)
    const rows = res.data.rows as LogEntryDisplay[]
    logs.value = rows
    pagination.total = res.data.total
  } catch (err: unknown) {
    ElMessage.error(t('log.fetchFailed') + ': ' + getErrorMessage(err))
  } finally {
    loading.value = false
  }
}

const onQuery = ({ pagination: newPagination }: { pagination: { pageNum: number; pageSize: number } }): void => {
  Object.assign(pagination, newPagination)
  fetchLogs()
}

const openDetailDialog = async (row: Record<string, unknown>): Promise<void> => {
  try {
    const logId = row.id as number
    const res = await logApi.getById(logId)
    const logData = res.data as LogEntryDisplay
    currentLog.value = logData
    detailVisible.value = true
  } catch (err: unknown) {
    ElMessage.error(t('log.fetchDetailFailed') + ': ' + getErrorMessage(err))
  }
}

const handleExport = async (): Promise<void> => {
  try {
    const params: LogQueryParams = {
      scope: 'export',
      type: searchParams.type || undefined,
    }
    if (searchParams.dateRange && searchParams.dateRange.length === 2) {
      params.startDate = searchParams.dateRange[0]
      params.endDate = searchParams.dateRange[1]
    }
    const response = await logApi.exportLogs(params)
    const url = window.URL.createObjectURL(new Blob([response.data]))
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', t('log.exportFileName') + '.xlsx')
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)
    ElMessage.success(t('log.exportSuccess'))
  } catch {
    ElMessage.error(t('log.exportFailed'))
  }
}

const handleCleanup = async (): Promise<void> => {
  try {
    const { value: beforeDays } = await ElMessageBox.prompt(t('log.cleanupPrompt'), t('log.cleanupTitle'), {
      confirmButtonText: t('common.confirm'),
      cancelButtonText: t('common.cancel'),
      inputValue: '',
      inputPattern: /^(\d*)$/,
      inputErrorMessage: t('log.inputDays'),
    })
    const days = beforeDays ? parseInt(beforeDays) : 0
    const res = await logApi.cleanup({ beforeDays: days })
    ElMessage.success(res.message || t('log.cleanupSuccess'))
    fetchLogs()
  } catch (err: unknown) {
    if (err !== 'cancel') {
      ElMessage.error(t('log.cleanupFailed') + ': ' + (getErrorMessage(err) || t('common.unknownError')))
    }
  }
}

const showFailureStats = async (): Promise<void> => {
  try {
    const res = await logApi.getLoginFailureStats()
    Object.assign(failureData, res.data)
    failureVisible.value = true
  } catch (err: unknown) {
    ElMessage.error(t('log.fetchStatsFailed') + ': ' + (getErrorMessage(err) || t('common.unknownError')))
  }
}

const formatTime = (time: string | number | Date | undefined | null): string => {
  if (!time) return '-'
  return new Date(time).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

onMounted(fetchLogs)
</script>

<style lang="scss" scoped>
.detail-pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-all;
  font-size: 13px;
  line-height: 1.6;
  max-height: 200px;
  overflow-y: auto;
}

.diff-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 12px 0;
}

.diff-table-wrap {
  overflow-x: auto;
}

.diff-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.diff-th {
  padding: 8px 12px;
  background: var(--hover-bg);
  color: var(--text-regular);
  font-weight: 500;
  text-align: left;
  border: 1px solid var(--border-light);
}

.diff-td {
  padding: 8px 12px;
  border: 1px solid var(--border-light);
  vertical-align: middle;
}

.diff-field {
  font-weight: 500;
  color: var(--text-primary);
  background: var(--hover-bg);
}

.diff-val {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 3px;
  font-family: monospace;
  font-size: 12px;
}

.diff-val-old {
  background: #fef0f0;
  color: #f56c6c;
  text-decoration: line-through;
}

.diff-val-new {
  background: #f0f9eb;
  color: #67c23a;
}

[data-theme='dark'] .diff-val-old {
  background: rgba(245, 108, 108, 0.15);
  color: #f89898;
}

[data-theme='dark'] .diff-val-new {
  background: rgba(103, 194, 58, 0.15);
  color: #95d475;
}
</style>
