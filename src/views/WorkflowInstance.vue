<template>
  <div class="page-container">
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
      <template #column-status="{ row }">
        <el-tag :type="statusType((row as WorkflowInstance).status)" size="small">
          {{ statusLabel((row as WorkflowInstance).status) }}
        </el-tag>
      </template>

      <template #column-actions="{ row }">
        <el-button type="primary" link size="small" @click="handleDetail(row as WorkflowInstance)">
          {{ t('common.detail') }}
        </el-button>
        <el-button v-if="(row as WorkflowInstance).status === 'failed'" type="success" link size="small" @click="handleRetry(row as WorkflowInstance)">
          {{ t('workflow.retry') }}
        </el-button>
        <el-button
          v-if="['pending', 'running', 'partial'].includes((row as WorkflowInstance).status)"
          type="danger"
          link
          size="small"
          @click="handleTerminate(row as WorkflowInstance)"
        >
          {{ t('workflow.terminate') }}
        </el-button>
      </template>
    </ProTable>

    <el-dialog v-model="detailVisible" :title="t('workflow.instance')" width="700px" top="5vh">
      <div v-if="detailData" class="detail-content">
        <el-descriptions :column="2" border size="small">
          <el-descriptions-item :label="t('common.status')">
            <el-tag :type="statusType(detailData.instance.status)" size="small">
              {{ statusLabel(detailData.instance.status) }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item :label="t('workflow.startedBy')">
            {{ detailData.instance.startedBy }}
          </el-descriptions-item>
          <el-descriptions-item :label="t('workflow.startedAt')">
            {{ detailData.instance.startedAt || '-' }}
          </el-descriptions-item>
          <el-descriptions-item :label="t('workflow.finishedAt')">
            {{ detailData.instance.finishedAt || '-' }}
          </el-descriptions-item>
        </el-descriptions>

        <div class="section-title">
          {{ t('workflow.executionLogs') }}
        </div>
        <el-timeline>
          <el-timeline-item v-for="log in detailData.logs" :key="log.id" :timestamp="log.finishedAt || log.startedAt" placement="top">
            <div class="log-item">
              <span class="log-node">{{ log.nodeName }} ({{ log.nodeType }})</span>
              <el-tag :type="log.status === 'success' ? 'success' : log.status === 'failed' ? 'danger' : 'warning'" size="small">
                {{ log.status }}
              </el-tag>
              <div v-if="log.error" class="log-error">
                {{ log.error }}
              </div>
            </div>
          </el-timeline-item>
        </el-timeline>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import ProTable from '@/components/ProTable/index.vue'
import { workflowApi, type WorkflowInstance } from '@/api/workflow'
import type { ApprovalTask } from '@/api/workflow'
import { useI18n } from '@/i18n'

const { t } = useI18n()

interface InstanceDetail {
  instance: WorkflowInstance
  logs: Array<{
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
  }>
  approvals: ApprovalTask[]
}

const instances = ref<WorkflowInstance[]>([])
const loading = ref(false)
const detailVisible = ref(false)
const detailData = ref<InstanceDetail | null>(null)
const pagination = reactive({ pageNum: 1, pageSize: 10, total: 0 })

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
  { prop: 'status', label: t('common.status'), width: 100 },
  { prop: 'bindingKey', label: t('workflow.bindingKey'), width: 120 },
  { prop: 'bindingId', label: t('workflow.bindingId'), width: 80 },
  { prop: 'startedAt', label: t('workflow.startedAt'), width: 170 },
  { prop: 'finishedAt', label: t('workflow.finishedAt'), width: 170 },
  { prop: 'actions', label: t('common.actions'), width: 200, fixed: 'right' },
])

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

function onQuery(params: { searchParams?: Record<string, unknown>; pagination?: { pageNum: number; pageSize: number } }) {
  if (params.searchParams) Object.assign(searchParams, params.searchParams)
  if (params.pagination) Object.assign(pagination, params.pagination)
  fetchInstances()
}

async function fetchInstances() {
  loading.value = true
  try {
    const res = await workflowApi.getInstances({ ...searchParams, page: pagination.pageNum, pageSize: pagination.pageSize })
    instances.value = res.data?.rows || []
    pagination.total = res.data?.total || 0
  } catch {
    instances.value = []
  } finally {
    loading.value = false
  }
}

async function handleDetail(row: WorkflowInstance) {
  try {
    const res = await workflowApi.getInstanceDetail(row.id)
    detailData.value = res.data as InstanceDetail | null
    detailVisible.value = true
  } catch {
    ElMessage.error(t('workflow.loadDetailFailed'))
  }
}

async function handleRetry(row: WorkflowInstance) {
  try {
    await workflowApi.retryInstance(row.id)
    ElMessage.success(t('workflow.retryTriggered'))
    fetchInstances()
  } catch {
    ElMessage.error(t('workflow.retryFailed'))
  }
}

async function handleTerminate(row: WorkflowInstance) {
  try {
    await ElMessageBox.confirm(t('workflow.confirmTerminate'), t('common.tip'), { type: 'warning' })
    await workflowApi.terminateInstance(row.id)
    ElMessage.success(t('workflow.terminatedMsg'))
    fetchInstances()
  } catch {
    // 用户取消或操作失败
  }
}

onMounted(fetchInstances)
</script>

<style lang="scss" scoped>
.detail-content {
  .section-title {
    font-size: 14px;
    font-weight: 600;
    margin: 16px 0 8px;
  }
  .log-item {
    .log-node {
      font-weight: 500;
      margin-right: 8px;
    }
    .log-error {
      color: var(--el-color-danger);
      font-size: 12px;
      margin-top: 4px;
    }
  }
}
</style>
