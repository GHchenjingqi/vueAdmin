<template>
  <div class="page-container">
    <el-tabs v-model="activeTab" class="approval-tabs">
      <el-tab-pane :label="t('workflow.myPending')" name="pending" />
      <el-tab-pane :label="t('workflow.done')" name="done" />
    </el-tabs>

    <ProTable
      :title="t('workflow.approval')"
      :columns="columns"
      :data="tasks"
      :loading="loading"
      :pagination="pagination"
      :show-search="false"
      @query="onQuery"
    >
      <template #column-status="{ row }">
        <el-tag
          :type="(row as ApprovalTask).status === 'pending' ? 'warning' : (row as ApprovalTask).status === 'approved' ? 'success' : 'danger'"
          size="small"
        >
          {{
            (row as ApprovalTask).status === 'pending'
              ? t('workflow.pendingApproval')
              : (row as ApprovalTask).status === 'approved'
                ? t('workflow.approved')
                : t('workflow.rejected')
          }}
        </el-tag>
      </template>

      <template #column-actions="{ row }">
        <template v-if="(row as ApprovalTask).status === 'pending'">
          <el-button type="success" size="small" @click="handleApprove(row as ApprovalTask)">
            {{ t('workflow.approve') }}
          </el-button>
          <el-button type="danger" size="small" @click="handleReject(row as ApprovalTask)">
            {{ t('workflow.reject') }}
          </el-button>
        </template>
        <span v-else>-</span>
      </template>
    </ProTable>

    <el-dialog v-model="approveDialog" :title="approveAction === 'approved' ? t('workflow.approveDialogTitle') : t('workflow.rejectDialogTitle')" width="450px">
      <el-form>
        <el-form-item :label="t('workflow.comment')">
          <el-input
            v-model="approveComment"
            type="textarea"
            :rows="3"
            :placeholder="approveAction === 'approved' ? t('workflow.placeholderApprovalComment') : t('workflow.placeholderRejectReason')"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="approveDialog = false">
          {{ t('common.cancel') }}
        </el-button>
        <el-button :type="approveAction === 'approved' ? 'success' : 'danger'" :loading="submitting" @click="submitApprove">
          {{ approveAction === 'approved' ? t('workflow.confirmApprove') : t('workflow.confirmReject') }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ElMessage } from 'element-plus'
import ProTable from '@/components/ProTable/index.vue'
import { workflowApi, type ApprovalTask } from '@/api/workflow'
import { useI18n } from '@/i18n'

const { t } = useI18n()

const activeTab = ref('pending')
const tasks = ref<ApprovalTask[]>([])
const loading = ref(false)
const pagination = reactive({ pageNum: 1, pageSize: 10, total: 0 })
const approveDialog = ref(false)
const approveAction = ref<'approved' | 'rejected'>('approved')
const approveComment = ref('')
const approveTaskId = ref<number | null>(null)
const submitting = ref(false)

const columns = computed(() => [
  { prop: 'id', label: t('common.id'), width: 70 },
  { prop: 'title', label: t('workflow.approvalTitle'), minWidth: 180 },
  { prop: 'status', label: t('common.status'), width: 100 },
  { prop: 'approverName', label: t('workflow.approverName'), width: 100 },
  { prop: 'comment', label: t('workflow.comment'), minWidth: 150, showOverflowTooltip: true },
  { prop: 'assignedAt', label: t('workflow.assignedAt'), width: 170 },
  { prop: 'finishedAt', label: t('workflow.finishedAt'), width: 170 },
  { prop: 'actions', label: t('common.actions'), width: 160, fixed: 'right' },
])

function onQuery(params: { pagination?: { pageNum: number; pageSize: number } }) {
  if (params.pagination) Object.assign(pagination, params.pagination)
  fetchTasks()
}

async function fetchTasks() {
  loading.value = true
  try {
    const status = activeTab.value === 'pending' ? 'pending' : undefined
    const res = await workflowApi.getApprovalTasks({ status, page: pagination.pageNum, pageSize: pagination.pageSize })
    tasks.value = res.data?.rows || []
    pagination.total = res.data?.total || 0
  } catch {
    tasks.value = []
  } finally {
    loading.value = false
  }
}

function handleApprove(row: ApprovalTask) {
  approveAction.value = 'approved'
  approveComment.value = ''
  approveTaskId.value = row.id
  approveDialog.value = true
}

function handleReject(row: ApprovalTask) {
  approveAction.value = 'rejected'
  approveComment.value = ''
  approveTaskId.value = row.id
  approveDialog.value = true
}

async function submitApprove() {
  if (!approveTaskId.value) return
  submitting.value = true
  try {
    await workflowApi.approveTask(approveTaskId.value, approveAction.value, approveComment.value || undefined)
    ElMessage.success(approveAction.value === 'approved' ? t('workflow.approvedMsg') : t('workflow.rejectedMsg'))
    approveDialog.value = false
    fetchTasks()
  } catch {
    ElMessage.error(t('workflow.operationFailed'))
  } finally {
    submitting.value = false
  }
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
}
</style>
