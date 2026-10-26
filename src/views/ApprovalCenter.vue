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

    <!-- 筛选栏 -->
    <div class="filter-bar">
      <el-select v-model="filterWorkflowId" :placeholder="t('workflow.filterWorkflow')" clearable style="width: 160px" @change="applyFilters">
        <el-option v-for="w in workflowOptions" :key="w.id" :label="w.name" :value="w.id" />
      </el-select>
      <el-input
        v-model="filterKeyword"
        :placeholder="t('workflow.filterKeyword')"
        clearable
        style="width: 180px"
        @keyup.enter="applyFilters"
        @clear="applyFilters"
      />
      <el-select v-model="filterTimeRange" :placeholder="t('workflow.filterTimeRange')" style="width: 130px" @change="applyFilters">
        <el-option :label="t('workflow.rangeAll')" value="all" />
        <el-option :label="t('workflow.rangeToday')" value="today" />
        <el-option :label="t('workflow.rangeWeek')" value="week" />
        <el-option :label="t('workflow.rangeOverdue')" value="overdue" />
      </el-select>
      <el-button type="primary" :icon="Search" @click="applyFilters">
        {{ t('common.search') }}
      </el-button>
      <el-button @click="resetFilters">
        {{ t('common.reset') }}
      </el-button>
      <el-button type="warning" plain :icon="Switch" @click="openDelegation">
        {{ t('workflow.delegation') }}
      </el-button>
    </div>

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
        <el-button :icon="Download" :loading="exportLoading" @click="handleExport">
          {{ t('common.export') }}
        </el-button>
        <el-button :icon="EditPen" @click="reasonManageVisible = true">
          {{ t('workflow.reasonManage') }}
        </el-button>
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
        <template v-if="(row as ApprovalTask).status === 'pending'">
          <el-button type="success" link size="small" @click="handleQuickApprove(row as ApprovalTask)">
            {{ t('workflow.approve') }}
          </el-button>
          <el-button type="danger" link size="small" @click="openRejectDialog(row as ApprovalTask)">
            {{ t('workflow.quickReject') }}
          </el-button>
        </template>
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

    <!-- 快速驳回（预设理由） -->
    <el-dialog v-model="rejectDialogVisible" :title="t('workflow.reject')" width="440px">
      <div v-if="rejectTarget" class="reject-dialog">
        <div class="reject-target">{{ rejectTarget.instance?.workflow?.name }} · {{ rejectTarget.title }}</div>
        <div class="section-label">
          {{ t('workflow.rejectReasonPreset') }}
        </div>
        <div class="preset-chips">
          <el-tag v-for="r in reasonOptions" :key="r" class="preset-chip" :effect="rejectForm.reason === r ? 'dark' : 'plain'" @click="rejectForm.reason = r">
            {{ r }}
          </el-tag>
        </div>
        <el-input v-model="rejectForm.reason" type="textarea" :rows="3" :placeholder="t('workflow.rejectReasonPlaceholder')" style="margin-top: 10px" />
      </div>
      <template #footer>
        <el-button @click="rejectDialogVisible = false">
          {{ t('common.cancel') }}
        </el-button>
        <el-button type="danger" :loading="submitting" @click="submitReject">
          {{ t('workflow.reject') }}
        </el-button>
      </template>
    </el-dialog>

    <!-- 委托审批管理 -->
    <el-dialog v-model="delegationVisible" :title="t('workflow.delegationDialogTitle')" width="520px">
      <el-form label-width="90px" size="small">
        <el-form-item :label="t('workflow.delegationTo')">
          <el-select v-model="delegationForm.toUserId" filterable :placeholder="t('workflow.delegationTo')" style="width: 100%">
            <el-option v-for="u in userOptions" :key="u.id" :label="u.nickname || u.username" :value="u.id" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('workflow.delegationStart')">
          <el-date-picker v-model="delegationForm.startAt" type="datetime" value-format="YYYY-MM-DD HH:mm:ss" style="width: 100%" />
        </el-form-item>
        <el-form-item :label="t('workflow.delegationEnd')">
          <el-date-picker v-model="delegationForm.endAt" type="datetime" value-format="YYYY-MM-DD HH:mm:ss" style="width: 100%" />
        </el-form-item>
        <el-form-item :label="t('workflow.delegationRemark')">
          <el-input v-model="delegationForm.remark" :placeholder="t('workflow.delegationTimeTip')" />
        </el-form-item>
      </el-form>
      <div class="delegation-tip">
        {{ t('workflow.delegationTimeTip') }}
      </div>

      <div class="section-label">
        {{ t('workflow.delegation') }}
      </div>
      <el-table :data="delegationList" border size="small" :empty-text="t('workflow.delegationEmpty')">
        <el-table-column :label="t('workflow.delegationTo')" prop="toUserName" min-width="100" />
        <el-table-column :label="t('workflow.delegationStart')" prop="startAt" min-width="140" />
        <el-table-column :label="t('workflow.delegationEnd')" min-width="140">
          <template #default="{ row }">
            {{ row.endAt || '-' }}
          </template>
        </el-table-column>
        <el-table-column :label="t('common.status')" width="90">
          <template #default="{ row }">
            <el-tag :type="isDelegationActive(row as DelegationItem) ? 'success' : 'info'" size="small">
              {{ isDelegationActive(row as DelegationItem) ? t('workflow.delegationActive') : t('workflow.delegationExpired') }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('common.actions')" width="80" align="center">
          <template #default="{ row }">
            <el-button type="danger" link size="small" @click="cancelDelegation((row as DelegationItem).id)">
              {{ t('workflow.cancelDelegation') }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <template #footer>
        <el-button @click="delegationVisible = false">
          {{ t('common.close') }}
        </el-button>
        <el-button type="primary" :loading="submitting" @click="submitDelegation">
          {{ t('workflow.setDelegation') }}
        </el-button>
      </template>
    </el-dialog>

    <!-- 常用驳回理由维护 -->
    <el-dialog v-model="reasonManageVisible" :title="t('workflow.reasonManage')" width="560px" @open="loadRejectReasons">
      <div class="reason-add">
        <el-input
          v-model="newReason"
          :placeholder="t('workflow.reasonContentPlaceholder')"
          maxlength="200"
          show-word-limit
          style="flex: 1"
          @keyup.enter="addReason"
        />
        <el-button type="primary" :loading="reasonSaving" @click="addReason">
          {{ t('workflow.addReason') }}
        </el-button>
      </div>
      <el-table :data="rejectReasons" border size="small" :empty-text="t('workflow.delegationEmpty')">
        <el-table-column :label="t('workflow.reasonContent')" min-width="200">
          <template #default="{ row }">
            <el-input
              v-if="editingReasonId === (row as WorkflowRejectReason).id"
              v-model="editingContent"
              size="small"
              @keyup.enter="saveReason(row as WorkflowRejectReason)"
            />
            <span v-else>{{ (row as WorkflowRejectReason).content }}</span>
          </template>
        </el-table-column>
        <el-table-column :label="t('common.status')" width="90" align="center">
          <template #default="{ row }">
            <el-switch v-model="row.enabled" :active-value="1" :inactive-value="0" @change="toggleReason(row as WorkflowRejectReason)" />
          </template>
        </el-table-column>
        <el-table-column :label="t('common.actions')" width="150" align="center">
          <template #default="{ row }">
            <el-button
              v-if="editingReasonId === (row as WorkflowRejectReason).id"
              type="primary"
              link
              size="small"
              @click="saveReason(row as WorkflowRejectReason)"
            >
              {{ t('common.save') }}
            </el-button>
            <el-button v-else type="primary" link size="small" @click="startEditReason(row as WorkflowRejectReason)">
              {{ t('common.edit') }}
            </el-button>
            <el-button type="danger" link size="small" @click="removeReason(row as WorkflowRejectReason)">
              {{ t('workflow.deleteReason') }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Check, Close, Search, Download, Switch, EditPen } from '@element-plus/icons-vue'
import ProTable from '@/components/ProTable/index.vue'
import { workflowApi, type ApprovalTask, type WorkflowInstance, type Workflow, type WorkflowRejectReason } from '@/api/workflow'
import { userApi } from '@/api'
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

interface DelegationItem {
  id: number
  fromUserId: number
  toUserId: number
  toUserName: string
  startAt: string
  endAt: string | null
  remark: string | null
  status: number
}

const activeTab = ref<'pending' | 'done'>('pending')
const tasks = ref<ApprovalTask[]>([])
const loading = ref(false)
const pendingCount = ref(0)
const pagination = reactive({ pageNum: 1, pageSize: 10, total: 0 })

// 筛选条件
const filterKeyword = ref('')
const filterWorkflowId = ref<number | ''>('')
const filterTimeRange = ref<'all' | 'today' | 'week' | 'overdue'>('all')
const workflowOptions = ref<Workflow[]>([])
const userOptions = ref<{ id: number; nickname?: string; username: string }[]>([])

const detailVisible = ref(false)
const detailLoading = ref(false)
const detailData = ref<InstanceDetail | null>(null)
const currentTask = ref<ApprovalTask | null>(null)
const approveAction = ref<'approved' | 'rejected'>('approved')
const approveComment = ref('')
const submitting = ref(false)
const selectedIds = ref<number[]>([])
const batchLoading = ref(false)
const exportLoading = ref(false)

const proTableRef = ref<InstanceType<typeof ProTable> | null>(null)

// 快速驳回（常用理由，来自数据库；接口不可用时回退内置常量）
const FALLBACK_REASONS = computed(() => [
  t('workflow.rejectReason1'),
  t('workflow.rejectReason2'),
  t('workflow.rejectReason3'),
  t('workflow.rejectReason4'),
  t('workflow.rejectReason5'),
])
const rejectReasons = ref<WorkflowRejectReason[]>([])
const reasonOptions = computed<string[]>(() => {
  const enabled = rejectReasons.value.filter((r) => r.enabled === 1).map((r) => r.content)
  return enabled.length ? enabled : FALLBACK_REASONS.value
})

async function loadRejectReasons() {
  try {
    const res = await workflowApi.listRejectReasons()
    rejectReasons.value = res.data || []
  } catch {
    rejectReasons.value = []
  }
}

const rejectDialogVisible = ref(false)
const rejectTarget = ref<ApprovalTask | null>(null)
const rejectForm = reactive({ reason: '' })

// 委托审批
const delegationVisible = ref(false)
const delegationList = ref<DelegationItem[]>([])
const delegationForm = reactive({ toUserId: null as number | null, startAt: '', endAt: '', remark: '' })

const columns = computed(() => [
  { prop: 'id', label: t('common.id'), width: 70 },
  { prop: 'title', label: t('workflow.approvalTitle'), minWidth: 180 },
  { prop: 'workflowName', label: t('workflow.title'), width: 140 },
  { prop: 'status', label: t('common.status'), width: 100 },
  { prop: 'starter', label: t('workflow.startedBy'), width: 110 },
  { prop: 'approverName', label: t('workflow.approverName'), width: 100 },
  { prop: 'comment', label: t('workflow.comment'), minWidth: 150, showOverflowTooltip: true },
  { prop: 'assignedAt', label: t('workflow.assignedAt'), width: 170 },
  { prop: 'actions', label: t('common.actions'), width: 160, fixed: 'right' },
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

function buildParams(): Record<string, unknown> {
  const status = activeTab.value === 'pending' ? 'pending' : 'approved,rejected'
  const params: Record<string, unknown> = { status, page: pagination.pageNum, pageSize: pagination.pageSize }
  if (filterKeyword.value) params.keyword = filterKeyword.value
  if (filterWorkflowId.value) params.workflowId = filterWorkflowId.value
  if (filterTimeRange.value !== 'all') params.timeRange = filterTimeRange.value
  return params
}

function onQuery(params: { pagination?: { pageNum: number; pageSize: number } }) {
  if (params.pagination) Object.assign(pagination, params.pagination)
  fetchTasks()
}

async function fetchTasks() {
  loading.value = true
  try {
    const res = await workflowApi.getApprovalTasks(buildParams())
    tasks.value = res.data?.rows || []
    pagination.total = res.data?.total || 0
    if (activeTab.value === 'pending') pendingCount.value = pagination.total
  } finally {
    loading.value = false
  }
}

function applyFilters() {
  pagination.pageNum = 1
  fetchTasks()
}

function resetFilters() {
  filterKeyword.value = ''
  filterWorkflowId.value = ''
  filterTimeRange.value = 'all'
  applyFilters()
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

/** 行内快速通过（无需进入详情） */
async function handleQuickApprove(row: ApprovalTask) {
  try {
    await workflowApi.approveTask(row.id, 'approved')
    ElMessage.success(t('workflow.approvedMsg'))
    fetchTasks()
  } catch {
    ElMessage.error(t('workflow.operationFailed'))
  }
}

/** 打开快速驳回对话框（带预设理由） */
function openRejectDialog(row: ApprovalTask) {
  rejectTarget.value = row
  rejectForm.reason = ''
  rejectDialogVisible.value = true
}

async function submitReject() {
  if (!rejectTarget.value) return
  if (!rejectForm.reason.trim()) {
    ElMessage.warning(t('workflow.rejectReasonRequired'))
    return
  }
  submitting.value = true
  try {
    await workflowApi.approveTask(rejectTarget.value.id, 'rejected', rejectForm.reason)
    ElMessage.success(t('workflow.rejectedMsg'))
    rejectDialogVisible.value = false
    fetchTasks()
  } catch {
    ElMessage.error(t('workflow.operationFailed'))
  } finally {
    submitting.value = false
  }
}

/** 导出当前筛选条件下的审批记录为 CSV */
async function handleExport() {
  exportLoading.value = true
  try {
    const res = await workflowApi.exportMyTasks(buildParams())
    const blob = res.data as Blob
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `approval-tasks-${Date.now()}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.URL.revokeObjectURL(url)
  } catch {
    ElMessage.error(t('workflow.operationFailed'))
  } finally {
    exportLoading.value = false
  }
}

function handleSelectionChange(selection: ApprovalTask[]): void {
  selectedIds.value = selection.map((task) => task.id)
}

async function handleBatch(action: 'approved' | 'rejected'): Promise<void> {
  if (!selectedIds.value.length) return
  let reason: string | undefined
  if (action === 'rejected') {
    try {
      const { value } = await ElMessageBox.prompt(t('workflow.rejectReasonRequired'), t('workflow.batchRejectConfirm', { count: selectedIds.value.length }), {
        confirmButtonText: t('common.confirm'),
        cancelButtonText: t('common.cancel'),
        type: 'warning',
        inputType: 'textarea',
      })
      reason = value?.trim() || undefined
      if (!reason) {
        ElMessage.warning(t('workflow.rejectReasonRequired'))
        return
      }
    } catch {
      return
    }
  } else {
    const count = selectedIds.value.length
    try {
      await ElMessageBox.confirm(t('workflow.batchApproveConfirm', { count }), t('common.tip'), {
        confirmButtonText: t('common.confirm'),
        cancelButtonText: t('common.cancel'),
        type: 'warning',
      })
    } catch {
      return
    }
  }

  batchLoading.value = true
  let success = 0
  for (const id of selectedIds.value) {
    try {
      await workflowApi.approveTask(id, action, reason)
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

// ==================== 委托审批 ====================
function isDelegationActive(row: DelegationItem): boolean {
  if (row.status !== 1) return false
  if (row.endAt && new Date(row.endAt).getTime() <= Date.now()) return false
  return true
}

async function openDelegation() {
  delegationVisible.value = true
  await loadDelegations()
}

async function loadDelegations() {
  try {
    const res = await workflowApi.listDelegations()
    delegationList.value = (res.data as DelegationItem[]) || []
  } catch {
    delegationList.value = []
  }
}

async function submitDelegation() {
  if (!delegationForm.toUserId) {
    ElMessage.warning(t('workflow.delegationTo'))
    return
  }
  submitting.value = true
  try {
    await workflowApi.setDelegation({
      toUserId: delegationForm.toUserId,
      startAt: delegationForm.startAt || undefined,
      endAt: delegationForm.endAt || undefined,
      remark: delegationForm.remark || undefined,
    })
    ElMessage.success(t('common.success'))
    delegationForm.toUserId = null
    delegationForm.startAt = ''
    delegationForm.endAt = ''
    delegationForm.remark = ''
    await loadDelegations()
  } catch {
    ElMessage.error(t('workflow.operationFailed'))
  } finally {
    submitting.value = false
  }
}

async function cancelDelegation(id: number) {
  try {
    await workflowApi.cancelDelegation(id)
    ElMessage.success(t('common.success'))
    await loadDelegations()
  } catch {
    ElMessage.error(t('workflow.operationFailed'))
  }
}

// ==================== 常用驳回理由维护 ====================
const reasonManageVisible = ref(false)
const newReason = ref('')
const reasonSaving = ref(false)
const editingReasonId = ref<number | null>(null)
const editingContent = ref('')

async function addReason() {
  const content = newReason.value.trim()
  if (!content) return
  reasonSaving.value = true
  try {
    const res = await workflowApi.createRejectReason({ content })
    rejectReasons.value.push(res.data)
    newReason.value = ''
    ElMessage.success(t('common.success'))
  } catch {
    // 错误由请求拦截器统一提示
  } finally {
    reasonSaving.value = false
  }
}

function startEditReason(row: WorkflowRejectReason) {
  editingReasonId.value = row.id
  editingContent.value = row.content
}

async function saveReason(row: WorkflowRejectReason) {
  const content = editingContent.value.trim()
  if (!content) return
  try {
    await workflowApi.updateRejectReason(row.id, { content })
    row.content = content
    editingReasonId.value = null
    ElMessage.success(t('common.success'))
  } catch {
    // 错误由请求拦截器统一提示
  }
}

async function toggleReason(row: WorkflowRejectReason) {
  try {
    await workflowApi.updateRejectReason(row.id, { enabled: row.enabled })
  } catch {
    await loadRejectReasons()
  }
}

async function removeReason(row: WorkflowRejectReason) {
  try {
    await ElMessageBox.confirm(t('workflow.deleteReasonConfirm'), t('common.tip'), {
      confirmButtonText: t('common.confirm'),
      cancelButtonText: t('common.cancel'),
      type: 'warning',
    })
  } catch {
    return
  }
  try {
    await workflowApi.deleteRejectReason(row.id)
    rejectReasons.value = rejectReasons.value.filter((r) => r.id !== row.id)
    ElMessage.success(t('common.success'))
  } catch {
    // 错误由请求拦截器统一提示
  }
}

watch(activeTab, () => {
  pagination.pageNum = 1
  fetchTasks()
})

onMounted(async () => {
  // 加载筛选用的流程列表与用户列表
  workflowApi.list({ page: 1, pageSize: 200 }).then((r) => {
    workflowOptions.value = r.data?.rows || []
  })
  userApi.list({ page: 1, pageSize: 200 }).then((r) => {
    userOptions.value = r.data?.rows || []
  })
  // 常用驳回理由（供快速驳回预设 + 维护弹窗）
  loadRejectReasons()
  fetchTasks()
})
</script>

<style lang="scss" scoped>
.approval-tabs {
  margin-bottom: 16px;
  .tab-badge {
    margin-left: 6px;
    margin-top: -2px;
  }
}
.filter-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
  flex-wrap: wrap;
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
.reject-dialog {
  .reject-target {
    font-size: 13px;
    color: var(--el-text-color-secondary);
    margin-bottom: 12px;
  }
  .section-label {
    font-size: 13px;
    font-weight: 600;
    margin-bottom: 8px;
  }
  .preset-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    .preset-chip {
      cursor: pointer;
    }
  }
}
.delegation-tip {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin: 4px 0 12px;
}
</style>
