<template>
  <div class="page-container">
    <el-tabs v-model="activeTab" class="approval-tabs">
      <el-tab-pane label="我的待办" name="pending" />
      <el-tab-pane label="已处理" name="done" />
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
          {{ (row as ApprovalTask).status === 'pending' ? '待审批' : (row as ApprovalTask).status === 'approved' ? '已通过' : '已驳回' }}
        </el-tag>
      </template>

      <template #column-actions="{ row }">
        <template v-if="(row as ApprovalTask).status === 'pending'">
          <el-button type="success" size="small" @click="handleApprove(row as ApprovalTask)">通过</el-button>
          <el-button type="danger" size="small" @click="handleReject(row as ApprovalTask)">驳回</el-button>
        </template>
        <span v-else>-</span>
      </template>
    </ProTable>

    <el-dialog v-model="approveDialog" :title="approveAction === 'approved' ? '审批通过' : '驳回'" width="450px">
      <el-form>
        <el-form-item label="审批意见">
          <el-input v-model="approveComment" type="textarea" :rows="3" :placeholder="approveAction === 'approved' ? '可选：填写审批意见' : '请填写驳回原因'" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="approveDialog = false">取消</el-button>
        <el-button :type="approveAction === 'approved' ? 'success' : 'danger'" :loading="submitting" @click="submitApprove">
          {{ approveAction === 'approved' ? '确认通过' : '确认驳回' }}
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

const columns = [
  { prop: 'id', label: 'ID', width: 70 },
  { prop: 'title', label: '审批事项', minWidth: 180 },
  { prop: 'status', label: '状态', width: 100 },
  { prop: 'approverName', label: '审批人', width: 100 },
  { prop: 'comment', label: '意见', minWidth: 150, showOverflowTooltip: true },
  { prop: 'assignedAt', label: '分配时间', width: 170 },
  { prop: 'finishedAt', label: '完成时间', width: 170 },
  { prop: 'actions', label: '操作', width: 160, fixed: 'right' },
]

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
    ElMessage.success(approveAction.value === 'approved' ? '已通过' : '已驳回')
    approveDialog.value = false
    fetchTasks()
  } catch {
    ElMessage.error('操作失败')
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
