<template>
  <div class="page-container">
    <el-tabs v-model="activeTab" class="approval-tabs">
      <el-tab-pane name="pending">
        <template #label>
          <span>{{ t('workflow.myPending') }}</span>
          <el-badge v-if="pendingCount > 0" :value="pendingCount" class="tab-badge" />
        </template>
      </el-tab-pane>
      <el-tab-pane :label="t('workflow.done')" name="done" />
    </el-tabs>

    <ProTable
      :title="t('workflow.approval')"
      :columns="columns"
      :data="tasks"
      :loading="loading"
      :pagination="pagination"
      :show-search="false"
      :show-selection="activeTab === 'pending'"
      @query="onQuery"
      @selection-change="handleSelectionChange"
    >
      <template #header-buttons>
        <template v-if="activeTab === 'pending'">
          <el-button type="success" :icon="Check" :disabled="selectedIds.length === 0" :loading="batchLoading" @click="handleBatchApprove">
            {{ t('workflow.batchApprove') }}
            <template v-if="selectedIds.length">({{ selectedIds.length }})</template>
          </el-button>
          <el-button type="danger" :icon="Close" :disabled="selectedIds.length === 0" :loading="batchLoading" @click="handleBatchReject">
            {{ t('workflow.batchReject') }}
            <template v-if="selectedIds.length">({{ selectedIds.length }})</template>
          </el-button>
        </template>
      </template>

      <template #column-workflowName="{ row }">
        <span>{{ (row as ApprovalTask).instance?.workflow?.name || '-' }}</span>
      </template>

      <template #column-status="{ row }">
        <el-tag :type="approvalStatusType((row as ApprovalTask).status)" size="small">
          {{ approvalStatusLabel((row as ApprovalTask).status) }}
        </el-tag>
      </template>

      <template #column-starter="{ row }">
        <span>{{ starterLabel((row as ApprovalTask).instance?.starter) }}</span>
      </template>

      <template #column-actions="{ row }">
        <el-button type="primary" link size="small" @click="handleOpenDetail(row as ApprovalTask)">
          {{ t('common.detail') }}
        </el-button>
      </template>
    </ProTable>

    <el-drawer v-model="detailVisible" :title="t('workflow.approvalDetail')" size="50%" :destroy-on-close="true">
      <div v-if="detailData" v-loading="detailLoading" class="detail-body">
        <el-descriptions :column="2" border size="small">
          <el-descriptions-item :label="t('workflow.approvalTitle')">
            {{ currentTask?.title || '-' }}
          </el-descriptions-item>
          <el-descriptions-item :label="t('workflow.title')">
            {{ currentTask?.instance?.workflow?.name || '-' }}
          </el-descriptions-item>
          <el-descriptions-item :label="t('workflow.startedBy')">
            {{ starterLabel(currentTask?.instance?.starter) }}
          </el-descriptions-item>
          <el-descriptions-item :label="t('workflow.instanceTitle')">
            {{ detailData.instance.title || '-' }}
          </el-descriptions-item>
          <el-descriptions-item :label="t('common.status')">
            <el-tag :type="instanceStatusType(detailData.instance.status)" size="small">
              {{ instanceStatusLabel(detailData.instance.status) }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item :label="t('workflow.startedAt')">
            {{ detailData.instance.startedAt || '-' }}
          </el-descriptions-item>
        </el-descriptions>

        <div class="section-title">
          {{ t('workflow.approvalTrail') }}
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
        <el-empty v-else :description="t('workflow.noApprovalTrail')" />

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
        <div v-if="currentTask?.status === 'pending'" class="approval-footer">
          <el-input
            v-model="approveComment"
            type="textarea"
            :rows="2"
            :placeholder="approveAction === 'rejected' ? t('workflow.placeholderRejectReason') : t('workflow.placeholderApprovalComment')"
          />
          <div class="footer-actions">
            <el-button @click="detailVisible = false">
              {{ t('common.cancel') }}
            </el-button>
            <el-button type="danger" :loading="submitting" @click="openReject">
              {{ t('workflow.reject') }}
            </el-button>
            <el-button type="success" :loading="submitting" @click="openApprove">
              {{ t('workflow.approve') }}
            </el-button>
          </div>
        </div>
        <div v-else class="footer-actions">
          <el-button @click="detailVisible = false">
            {{ t('common.close') }}
          </el-button>
        </div>
      </template>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import { Check, Close } from '@element-plus/icons-vue'
import ProTable from '@/components/ProTable/index.vue'
import { workflowApi, type ApprovalTask, type WorkflowInstance } from '@/api/workflow'
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

const activeTab = ref<'pending' | 'done'>('pending')
const tasks = ref<ApprovalTask[]>([])
const loading = ref(false)
const pendingCount = ref(0)
const pagination = reactive({ pageNum: 1, pageSize: 10, total: 0 })

const detailVisible = ref(false)
const detailLoading = ref(false)
const detailData = ref<InstanceDetail | null>(null)
const currentTask = ref<ApprovalTask | null>(null)
const approveAction = ref<'approved' | 'rejected'>('approved')
const approveComment = ref('')
const submitting = ref(false)
const selectedIds = ref<number[]>([])
const batchLoading = ref(false)

const proTableRef = ref<InstanceType<typeof ProTable> | null>(null)

const columns = computed(() => [
  { prop: 'id', label: t('common.id'), width: 70 },
  { prop: 'title', label: t('workflow.approvalTitle'), minWidth: 180 },
  { prop: 'workflowName', label: t('workflow.title'), width: 140 },
  { prop: 'status', label: t('common.status'), width: 100 },
  { prop: 'starter', label: t('workflow.startedBy'), width: 110 },
  { prop: 'approverName', label: t('workflow.approverName'), width: 100 },
  { prop: 'comment', label: t('workflow.comment'), minWidth: 150, showOverflowTooltip: true },
  { prop: 'assignedAt', label: t('workflow.assignedAt'), width: 170 },
  { prop: 'actions', label: t('common.actions'), width: 100, fixed: 'right' },
])

function starterLabel(starter?: { username: string; nickname?: string } | null): string {
  if (!starter) return '-'
  return starter.nickname || starter.username
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

function instanceStatusType(s: string): 'primary' | 'success' | 'warning' | 'info' | 'danger' {
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

function instanceStatusLabel(s: string): string {
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

function onQuery(params: { pagination?: { pageNum: number; pageSize: number } }) {
  if (params.pagination) Object.assign(pagination, params.pagination)
  fetchTasks()
}

async function fetchTasks() {
  loading.value = true
  const status = activeTab.value === 'pending' ? 'pending' : 'approved,rejected'
  const res = await workflowApi.getApprovalTasks({ status, page: pagination.pageNum, pageSize: pagination.pageSize })
  tasks.value = res.data?.rows || []
  pagination.total = res.data?.total || 0
  if (activeTab.value === 'pending') pendingCount.value = pagination.total
  loading.value = false
}

async function handleOpenDetail(row: ApprovalTask) {
  currentTask.value = row
  detailVisible.value = true
  detailLoading.value = true
  const res = await workflowApi.getInstanceDetail(row.instanceId)
  detailData.value = res.data as InstanceDetail
  detailLoading.value = false
}

function openApprove() {
  approveAction.value = 'approved'
  submitApprove()
}

function openReject() {
  approveAction.value = 'rejected'
  submitApprove()
}

async function submitApprove() {
  if (!currentTask.value) return
  if (approveAction.value === 'rejected' && !approveComment.value.trim()) {
    ElMessage.warning(t('workflow.placeholderRejectReason'))
    return
  }
  submitting.value = true
  try {
    await workflowApi.approveTask(currentTask.value.id, approveAction.value, approveComment.value || undefined)
    ElMessage.success(approveAction.value === 'approved' ? t('workflow.approvedMsg') : t('workflow.rejectedMsg'))
    detailVisible.value = false
    fetchTasks()
  } catch {
    ElMessage.error(t('workflow.operationFailed'))
  } finally {
    submitting.value = false
  }
}

function handleSelectionChange(selection: ApprovalTask[]): void {
  selectedIds.value = selection.map((task) => task.id)
}

async function handleBatch(action: 'approved' | 'rejected'): Promise<void> {
  if (!selectedIds.value.length) return
  const count = selectedIds.value.length
  const tipKey = action === 'approved' ? 'workflow.batchApproveConfirm' : 'workflow.batchRejectConfirm'
  try {
    await ElMessageBox.confirm(t(tipKey, { count }), t('common.tip'), {
      confirmButtonText: t('common.confirm'),
      cancelButtonText: t('common.cancel'),
      type: 'warning',
    })
  } catch {
    return
  }

  batchLoading.value = true
  let success = 0
  for (const id of selectedIds.value) {
    try {
      await workflowApi.approveTask(id, action, undefined)
      success++
    } catch {
      // 单条失败继续处理其余
    }
  }
  batchLoading.value = false
  selectedIds.value = []
  proTableRef.value?.clearSelection()
  const msgKey = action === 'approved' ? 'workflow.batchApproveSuccess' : 'workflow.batchRejectSuccess'
  ElMessage.success(t(msgKey, { count: success }))
  fetchTasks()
}

function handleBatchApprove(): Promise<void> {
  return handleBatch('approved')
}

function handleBatchReject(): Promise<void> {
  return handleBatch('rejected')
}

watch(activeTab, () => {
  pagination.pageNum = 1
  fetchTasks()
})

onMounted(fetchTasks)
</script>

<style lang="scss" scoped>
.approval-tabs {
  margin-bottom: 16px;
  .tab-badge {
    margin-left: 6px;
    margin-top: -2px;
  }
}
.detail-body {
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
.approval-footer {
  display: flex;
  flex-direction: column;
  gap: 8px;
  .footer-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
}
.footer-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
