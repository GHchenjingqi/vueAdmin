<template>
  <div class="page-container">
    <div class="instance-toolbar">
      <el-switch v-model="autoRefresh" :active-text="t('workflow.autoRefresh')" inline-prompt />
    </div>

    <ProTable
      :title="t('workflow.instance')"
      :columns="columns"
      :data="instances"
      :loading="loading"
      :search-fields="searchFields"
      :search-params="searchParams"
      :pagination="pagination"
      @query="onQuery"
    >
      <template #column-workflowName="{ row }">
        <span>{{ (row as WorkflowInstance).workflow?.name || '-' }}</span>
      </template>

      <template #column-starter="{ row }">
        <span>{{ starterLabel((row as WorkflowInstance).starter) }}</span>
      </template>

      <template #column-status="{ row }">
        <el-tag :type="statusType((row as WorkflowInstance).status)" size="small">
          {{ statusLabel((row as WorkflowInstance).status) }}
        </el-tag>
      </template>

      <template #column-actions="{ row }">
        <el-button type="primary" link size="small" :loading="actionLoadingId === (row as WorkflowInstance).id" @click="handleDetail(row as WorkflowInstance)">
          {{ t('common.detail') }}
        </el-button>
        <el-button
          v-if="(row as WorkflowInstance).status === 'failed'"
          type="success"
          link
          size="small"
          :loading="actionLoadingId === (row as WorkflowInstance).id"
          @click="handleRetry(row as WorkflowInstance)"
        >
          {{ t('workflow.retry') }}
        </el-button>
        <el-button
          v-if="['pending', 'running', 'partial'].includes((row as WorkflowInstance).status)"
          type="danger"
          link
          size="small"
          :loading="actionLoadingId === (row as WorkflowInstance).id"
          @click="handleTerminate(row as WorkflowInstance)"
        >
          {{ t('workflow.terminate') }}
        </el-button>
      </template>
    </ProTable>

    <el-drawer v-model="detailVisible" :title="t('workflow.instance')" size="50%" :destroy-on-close="true">
      <div v-if="detailData" v-loading="detailLoading" class="detail-content">
        <el-descriptions :column="2" border size="small">
          <el-descriptions-item :label="t('workflow.instanceTitle')">
            {{ detailData.instance.title || '-' }}
          </el-descriptions-item>
          <el-descriptions-item :label="t('workflow.workflowName')">
            {{ detailData.instance.workflow?.name || '-' }}
          </el-descriptions-item>
          <el-descriptions-item :label="t('common.status')">
            <el-tag :type="statusType(detailData.instance.status)" size="small">
              {{ statusLabel(detailData.instance.status) }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item :label="t('workflow.startedBy')">
            {{ starterLabel(detailData.instance.starter) }}
          </el-descriptions-item>
          <el-descriptions-item :label="t('workflow.startedAt')">
            {{ detailData.instance.startedAt || '-' }}
          </el-descriptions-item>
          <el-descriptions-item :label="t('workflow.finishedAt')">
            {{ detailData.instance.finishedAt || '-' }}
          </el-descriptions-item>
        </el-descriptions>

        <div class="section-title">
          {{ t('workflow.approvals') }}
        </div>
        <el-timeline v-if="detailData.approvals.length">
          <el-timeline-item v-for="ap in detailData.approvals" :key="ap.id" :timestamp="ap.finishedAt || ap.assignedAt || ''" placement="top">
            <div class="trail-item">
              <span class="trail-node">{{ ap.title || ap.nodeKey }}</span>
              <el-tag :type="approvalStatusType(ap.status)" size="small">
                {{ approvalStatusLabel(ap.status) }}
              </el-tag>
              <span v-if="ap.approverName" class="trail-user">{{ ap.approverName }}</span>
              <div v-if="ap.comment" class="trail-comment">
                {{ ap.comment }}
              </div>
            </div>
          </el-timeline-item>
        </el-timeline>
        <el-empty v-else :description="t('workflow.noApprovals')" />

        <div class="section-title">
          {{ t('workflow.executionLogs') }}
        </div>
        <el-timeline v-if="detailData.logs.length">
          <el-timeline-item v-for="log in detailData.logs" :key="log.id" :timestamp="log.finishedAt || log.startedAt || ''" placement="top">
            <div class="trail-item">
              <span class="trail-node">{{ log.nodeName }} ({{ log.nodeType }})</span>
              <el-tag :type="logStatusType(log.status)" size="small">
                {{ logStatusLabel(log.status) }}
              </el-tag>
              <div v-if="log.error" class="trail-error">
                {{ log.error }}
              </div>
            </div>
          </el-timeline-item>
        </el-timeline>
        <el-empty v-else :description="t('workflow.noLogs')" />
      </div>

      <template #footer>
        <el-button @click="detailVisible = false">
          {{ t('common.close') }}
        </el-button>
      </template>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import ProTable from '@/components/ProTable/index.vue'
import { workflowApi, type WorkflowInstance, type ApprovalTask } from '@/api/workflow'
import { useI18n } from '@/i18n'

const { t } = useI18n()

interface InstanceLog {
  id: number
  nodeKey: string
  nodeName: string
  nodeType: string
  status: string
  input: string
  output: string
  error: string
  duration: number
  startedAt: string
  finishedAt: string
}

interface InstanceDetail {
  instance: WorkflowInstance
  logs: InstanceLog[]
  approvals: ApprovalTask[]
}

const instances = ref<WorkflowInstance[]>([])
const loading = ref(false)
const detailVisible = ref(false)
const detailLoading = ref(false)
const detailData = ref<InstanceDetail | null>(null)
const actionLoadingId = ref<number | null>(null)
const pagination = reactive({ pageNum: 1, pageSize: 10, total: 0 })
const autoRefresh = ref(false)
let refreshTimer: ReturnType<typeof setInterval> | null = null

const searchParams = reactive({ status: '' })

const searchFields = computed(() => [
  {
    prop: 'status',
    label: t('common.status'),
    type: 'select',
    placeholder: t('common.all'),
    options: [
      { label: t('workflow.pending'), value: 'pending' },
      { label: t('workflow.running'), value: 'running' },
      { label: t('workflow.approved'), value: 'approved' },
      { label: t('workflow.rejected'), value: 'rejected' },
      { label: t('workflow.terminated'), value: 'terminated' },
      { label: t('workflow.failed'), value: 'failed' },
    ],
  },
])

const columns = computed(() => [
  { prop: 'id', label: t('common.id'), width: 70 },
  { prop: 'title', label: t('workflow.instanceTitle'), minWidth: 160 },
  { prop: 'workflowName', label: t('workflow.workflowName'), width: 130 },
  { prop: 'status', label: t('common.status'), width: 100 },
  { prop: 'starter', label: t('workflow.startedBy'), width: 110 },
  { prop: 'bindingKey', label: t('workflow.bindingKey'), width: 120 },
  { prop: 'bindingId', label: t('workflow.bindingId'), width: 80 },
  { prop: 'startedAt', label: t('workflow.startedAt'), width: 170 },
  { prop: 'finishedAt', label: t('workflow.finishedAt'), width: 170 },
  { prop: 'actions', label: t('common.actions'), width: 200, fixed: 'right' },
])

function starterLabel(starter?: { username: string; nickname?: string } | null): string {
  if (!starter) return '-'
  return starter.nickname || starter.username
}

function statusType(s: string): 'primary' | 'success' | 'warning' | 'info' | 'danger' {
  const map: Record<string, 'primary' | 'success' | 'warning' | 'info' | 'danger'> = {
    pending: 'info',
    running: 'warning',
    partial: 'warning',
    approved: 'success',
    rejected: 'danger',
    terminated: 'info',
    failed: 'danger',
  }
  return map[s] || 'info'
}

function statusLabel(s: string): string {
  const map: Record<string, string> = {
    pending: t('workflow.pending'),
    running: t('workflow.running'),
    partial: t('workflow.partial'),
    approved: t('workflow.approved'),
    rejected: t('workflow.rejected'),
    terminated: t('workflow.terminated'),
    failed: t('workflow.failed'),
  }
  return map[s] || s
}

function approvalStatusType(s: string): 'success' | 'warning' | 'danger' | 'info' {
  const map: Record<string, 'success' | 'warning' | 'danger' | 'info'> = {
    pending: 'warning',
    approved: 'success',
    rejected: 'danger',
    canceled: 'info',
  }
  return map[s] || 'info'
}

function approvalStatusLabel(s: string): string {
  const map: Record<string, string> = {
    pending: t('workflow.pendingApproval'),
    approved: t('workflow.approved'),
    rejected: t('workflow.rejected'),
    canceled: t('workflow.terminated'),
  }
  return map[s] || s
}

function logStatusType(s: string): 'success' | 'warning' | 'danger' {
  const map: Record<string, 'success' | 'warning' | 'danger'> = {
    success: 'success',
    failed: 'danger',
    running: 'warning',
  }
  return map[s] || 'warning'
}

function logStatusLabel(s: string): string {
  const map: Record<string, string> = {
    success: t('workflow.approved'),
    failed: t('workflow.failed'),
    running: t('workflow.running'),
  }
  return map[s] || s
}

function onQuery(params: { searchParams?: Record<string, unknown>; pagination?: { pageNum: number; pageSize: number } }) {
  if (params.searchParams) Object.assign(searchParams, params.searchParams)
  if (params.pagination) Object.assign(pagination, params.pagination)
  fetchInstances()
}

async function fetchInstances() {
  loading.value = true
  const res = await workflowApi.getInstances({ ...searchParams, page: pagination.pageNum, pageSize: pagination.pageSize })
  instances.value = res.data?.rows || []
  pagination.total = res.data?.total || 0
  loading.value = false
}

function hasActiveInstances(): boolean {
  return instances.value.some((i) => ['pending', 'running', 'partial'].includes(i.status))
}

function startAutoRefresh() {
  stopAutoRefresh()
  refreshTimer = setInterval(() => {
    if (hasActiveInstances()) fetchInstances()
  }, 10000)
}

function stopAutoRefresh() {
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }
}

watch(autoRefresh, (val) => {
  if (val) startAutoRefresh()
  else stopAutoRefresh()
})

async function handleDetail(row: WorkflowInstance) {
  detailVisible.value = true
  detailLoading.value = true
  try {
    const res = await workflowApi.getInstanceDetail(row.id)
    detailData.value = res.data as InstanceDetail
  } catch {
    ElMessage.error(t('workflow.loadDetailFailed'))
    detailVisible.value = false
  } finally {
    detailLoading.value = false
  }
}

async function handleRetry(row: WorkflowInstance) {
  actionLoadingId.value = row.id
  try {
    await ElMessageBox.confirm(t('workflow.confirmRetry'), t('common.tip'), { type: 'warning' })
    await workflowApi.retryInstance(row.id)
    ElMessage.success(t('workflow.retryTriggered'))
    fetchInstances()
  } catch (err) {
    if (err !== 'cancel') ElMessage.error(t('workflow.retryFailed'))
  } finally {
    actionLoadingId.value = null
  }
}

async function handleTerminate(row: WorkflowInstance) {
  actionLoadingId.value = row.id
  try {
    await ElMessageBox.confirm(t('workflow.confirmTerminate'), t('common.tip'), { type: 'warning' })
    await workflowApi.terminateInstance(row.id)
    ElMessage.success(t('workflow.terminatedMsg'))
    fetchInstances()
  } catch (err) {
    if (err !== 'cancel') ElMessage.error(t('workflow.operationFailed'))
  } finally {
    actionLoadingId.value = null
  }
}

onMounted(fetchInstances)
onUnmounted(stopAutoRefresh)
</script>

<style lang="scss" scoped>
.instance-toolbar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 8px;
}
.detail-content {
  padding: 0 4px;
  .section-title {
    font-size: 14px;
    font-weight: 600;
    margin: 16px 0 8px;
  }
  .trail-item {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    .trail-node {
      font-weight: 500;
    }
    .trail-user {
      color: var(--el-text-color-secondary);
      font-size: 12px;
    }
    .trail-comment {
      width: 100%;
      color: var(--el-text-color-regular);
      font-size: 12px;
      margin-top: 4px;
    }
    .trail-error {
      width: 100%;
      color: var(--el-color-danger);
      font-size: 12px;
      margin-top: 4px;
    }
  }
}
</style>
