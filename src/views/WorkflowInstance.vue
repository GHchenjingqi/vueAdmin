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
          <el-descriptions-item label="状态">
            <el-tag :type="statusType(detailData.instance.status)" size="small">
              {{ statusLabel(detailData.instance.status) }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="发起人">
            {{ detailData.instance.startedBy }}
          </el-descriptions-item>
          <el-descriptions-item label="开始时间">
            {{ detailData.instance.startedAt || '-' }}
          </el-descriptions-item>
          <el-descriptions-item label="结束时间">
            {{ detailData.instance.finishedAt || '-' }}
          </el-descriptions-item>
        </el-descriptions>

        <div class="section-title">执行日志</div>
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

const searchFields = [
  {
    prop: 'status',
    label: '状态',
    type: 'select',
    placeholder: '全部',
    options: [
      { label: '待处理', value: 'pending' },
      { label: '运行中', value: 'running' },
      { label: '已通过', value: 'approved' },
      { label: '已驳回', value: 'rejected' },
      { label: '已终止', value: 'terminated' },
      { label: '失败', value: 'failed' },
    ],
  },
]

const searchParams = reactive({ status: '' })

const columns = [
  { prop: 'id', label: 'ID', width: 70 },
  { prop: 'title', label: '标题', minWidth: 160 },
  { prop: 'status', label: '状态', width: 100 },
  { prop: 'bindingKey', label: '业务标识', width: 120 },
  { prop: 'bindingId', label: '业务ID', width: 80 },
  { prop: 'startedAt', label: '开始时间', width: 170 },
  { prop: 'finishedAt', label: '结束时间', width: 170 },
  { prop: 'actions', label: '操作', width: 200, fixed: 'right' },
]

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
    pending: '待处理',
    running: '运行中',
    partial: '审批中',
    approved: '已通过',
    rejected: '已驳回',
    terminated: '已终止',
    failed: '失败',
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
    ElMessage.error('加载详情失败')
  }
}

async function handleRetry(row: WorkflowInstance) {
  try {
    await workflowApi.retryInstance(row.id)
    ElMessage.success('重试已触发')
    fetchInstances()
  } catch {
    ElMessage.error('重试失败')
  }
}

async function handleTerminate(row: WorkflowInstance) {
  try {
    await ElMessageBox.confirm('确认终止当前实例？', '提示', { type: 'warning' })
    await workflowApi.terminateInstance(row.id)
    ElMessage.success('已终止')
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
