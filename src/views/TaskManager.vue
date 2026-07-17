<template>
  <div class="page-container">
    <ProTable
      :title="t('task.title')"
      :columns="columns"
      :data="filteredTasks"
      :loading="loading"
      :search-fields="searchFields"
      :search-params="searchParams"
      :pagination="pagination"
      :show-index="false"
      :show-selection="false"
      :show-pagination="false"
      @query="onQuery"
    >
      <template #header-buttons>
        <el-button type="primary" :icon="Plus" @click="handleCreate">
          {{ t('task.addTask') }}
        </el-button>
      </template>

      <template #column-status="{ row }">
        <el-switch :model-value="row.status" :active-value="1" :inactive-value="0" @change="(val) => handleToggleStatus(row, val)" />
      </template>

      <template #column-isRunning="{ row }">
        <el-tag :type="row.isRunning ? 'success' : 'info'" size="small">
          {{ row.isRunning ? t('task.running') : t('task.stopped') }}
        </el-tag>
      </template>

      <template #column-lastRunAt="{ row }">
        {{ row.lastRunAt ? formatTime(row.lastRunAt) : '-' }}
      </template>

      <template #column-lastResult="{ row }">
        <el-tooltip :content="row.lastResult" placement="top" :disabled="!row.lastResult">
          <span class="result-text">{{ row.lastResult || '-' }}</span>
        </el-tooltip>
      </template>

      <template #column-actions="{ row }">
        <el-button type="primary" link size="small" @click="handleEdit(row)">
          {{ t('common.edit') }}
        </el-button>
        <el-button type="success" link size="small" @click="handleExecute(row)">
          {{ t('common.execute') }}
        </el-button>
        <el-button type="danger" link size="small" @click="handleDelete(row)">
          {{ t('common.delete') }}
        </el-button>
      </template>
    </ProTable>

    <el-dialog v-model="dialogVisible" :title="isEdit ? t('task.editTask') : t('task.addTask')" width="550px" destroy-on-close>
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-form-item :label="t('task.taskName')" prop="name">
          <el-input v-model="form.name" :placeholder="t('task.inputTaskName')" />
        </el-form-item>
        <el-form-item :label="t('task.cronExpression')" prop="cronExpression">
          <el-input v-model="form.cronExpression" :placeholder="t('task.inputCron')">
            <template #append>
              <el-tooltip placement="top">
                <template #content>
                  <div>{{ t('task.cronTip1') }}</div>
                  <div>{{ t('task.cronTip2') }}</div>
                  <div>{{ t('task.cronTip3') }}</div>
                </template>
                <el-icon><QuestionFilled /></el-icon>
              </el-tooltip>
            </template>
          </el-input>
        </el-form-item>
        <el-form-item :label="t('task.handler')" prop="handler">
          <el-select v-model="form.handler" :placeholder="t('task.selectHandler')" style="width: 100%">
            <el-option :label="t('task.cleanupLogs')" value="cleanupLogs" />
            <el-option :label="t('task.heartbeat')" value="heartbeat" />
            <el-option :label="t('task.cleanupOldFiles')" value="cleanupOldFiles" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('task.status')">
          <el-switch v-model="form.status" :active-value="1" :inactive-value="0" />
        </el-form-item>
        <el-form-item :label="t('task.description')">
          <el-input v-model="form.description" type="textarea" :rows="2" :placeholder="t('common.optional')" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">
          {{ t('common.cancel') }}
        </el-button>
        <el-button type="primary" :loading="submitting" @click="handleSubmit">
          {{ t('common.save') }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, QuestionFilled } from '@element-plus/icons-vue'
import ProTable from '@/components/ProTable/index.vue'
import { taskApi } from '@/api'
import { useI18n } from '@/i18n'

const { t } = useI18n()

const dialogVisible = ref(false)
const isEdit = ref(false)
const submitting = ref(false)
const formRef = ref<InstanceType<typeof import('element-plus').ElForm> | null>(null)
const editId = ref<number | null>(null)

interface TaskRecord {
  id: number
  name: string
  cronExpression: string
  handler?: string
  status: number
  isRunning?: boolean
  lastRunAt?: string
  lastResult?: string
  description?: string
  createdAt?: string
}

const allTasks = ref<TaskRecord[]>([])
const loading = ref(false)
const pagination = reactive({ pageNum: 1, pageSize: 10, total: 0 })

const searchFields = computed(() => [
  { prop: 'name', label: t('task.taskName'), type: 'input', placeholder: t('task.inputTaskName') },
  {
    prop: 'isRunning',
    label: t('task.runStatus'),
    type: 'select',
    placeholder: t('task.allStatus'),
    options: [
      { label: t('task.running'), value: 'running' },
      { label: t('task.stopped'), value: 'stopped' },
    ],
  },
  {
    prop: 'status',
    label: t('common.status'),
    type: 'select',
    placeholder: t('common.all'),
    options: [
      { label: t('common.enable'), value: '1' },
      { label: t('task.paused'), value: '0' },
    ],
  },
])

const searchParams = reactive({
  name: '',
  isRunning: '',
  status: '',
})

const filteredTasks = computed(() => {
  return allTasks.value.filter((task: TaskRecord) => {
    if (searchParams.name && !(task.name || '').toLowerCase().includes(searchParams.name.toLowerCase())) {
      return false
    }
    if (searchParams.isRunning === 'running' && !task.isRunning) return false
    if (searchParams.isRunning === 'stopped' && task.isRunning) return false
    if (searchParams.status !== '' && task.status !== Number(searchParams.status)) return false
    return true
  })
})

function onQuery(): void {
  // computed 会自动过滤，无需额外逻辑
}

const form = reactive({
  name: '',
  cronExpression: '',
  handler: 'cleanupLogs',
  status: 1,
  description: '',
})

const rules = {
  name: [{ required: true, message: t('task.inputTaskName'), trigger: 'blur' }],
  cronExpression: [{ required: true, message: t('task.inputCron'), trigger: 'blur' }],
  handler: [{ required: true, message: t('task.selectHandler'), trigger: 'change' }],
}

const columns = computed(() => [
  { prop: 'id', label: t('common.id'), width: 70 },
  { prop: 'name', label: t('task.taskName'), width: 140 },
  { prop: 'cronExpression', label: t('task.cronExpression'), width: 140 },
  { prop: 'handler', label: t('task.handler'), width: 120 },
  { prop: 'isRunning', label: t('task.runStatus'), width: 100 },
  { prop: 'status', label: t('common.enable'), width: 80 },
  { prop: 'lastRunAt', label: t('task.lastRun'), width: 170 },
  { prop: 'lastResult', label: t('task.lastResult'), minWidth: 180 },
  { prop: 'actions', label: t('common.operation'), width: 200, fixed: 'right' },
])

function formatTime(time: string | number | Date | undefined | null): string {
  if (!time) return ''
  return new Date(time).toLocaleString()
}

async function fetchTasks(): Promise<void> {
  loading.value = true
  try {
    const res = await taskApi.list()
    const rows = (res.data?.rows || []) as TaskRecord[]
    allTasks.value = rows
    pagination.total = res.data?.total || 0
  } catch {
    allTasks.value = []
  } finally {
    loading.value = false
  }
}

function resetForm(): void {
  form.name = ''
  form.cronExpression = ''
  form.handler = 'cleanupLogs'
  form.status = 1
  form.description = ''
  editId.value = null
}

function handleCreate(): void {
  isEdit.value = false
  resetForm()
  dialogVisible.value = true
}

function handleEdit(row: Record<string, unknown>): void {
  const task = row as unknown as TaskRecord
  if (!task || task.id == null) return
  isEdit.value = true
  editId.value = task.id
  form.name = task.name
  form.cronExpression = task.cronExpression || ''
  form.handler = task.handler || 'cleanupLogs'
  form.status = task.status
  form.description = task.description || ''
  dialogVisible.value = true
}

async function handleSubmit(): Promise<void> {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  submitting.value = true
  try {
    if (isEdit.value) {
      if (editId.value == null) throw new Error(t('task.invalidTaskId'))
      await taskApi.update(editId.value, form)
      ElMessage.success(t('common.updateSuccess'))
    } else {
      await taskApi.create(form)
      ElMessage.success(t('common.createSuccess'))
    }
    dialogVisible.value = false
    fetchTasks()
  } catch {
    ElMessage.error(t('task.operationFailed'))
  } finally {
    submitting.value = false
  }
}

async function handleExecute(row: Record<string, unknown>): Promise<void> {
  const task = row as unknown as TaskRecord
  if (!task || task.id == null) return
  try {
    await taskApi.execute(task.id)
    ElMessage.success(t('task.executeTriggered'))
    fetchTasks()
  } catch {
    ElMessage.error(t('task.executeFailed'))
  }
}

async function handleToggleStatus(row: Record<string, unknown>, val: number | string | boolean): Promise<void> {
  const task = row as unknown as TaskRecord
  if (!task || task.id == null) return
  try {
    await taskApi.update(task.id, { status: Number(val) })
    ElMessage.success(t('task.statusUpdated'))
  } catch {
    ElMessage.error(t('task.updateFailed'))
    fetchTasks()
  }
}

async function handleDelete(row: Record<string, unknown>): Promise<void> {
  const task = row as unknown as TaskRecord
  if (!task || task.id == null) return
  try {
    await ElMessageBox.confirm(`${t('task.deleteConfirm')}「${task.name}」？`, t('common.tip'), {
      type: 'warning',
      confirmButtonText: t('common.confirm'),
      cancelButtonText: t('common.cancel'),
    })
    await taskApi.delete(task.id)
    ElMessage.success(t('messages.deleteSuccess'))
    fetchTasks()
  } catch {
    // 用户取消删除任务
  }
}

onMounted(fetchTasks)
</script>

<style lang="scss" scoped>
.result-text {
  font-size: 12px;
  color: var(--text-primary);
}
</style>
