<template>
  <div class="page-container">
    <ProTable
      :title="t('workflow.title')"
      :columns="columns"
      :data="workflows"
      :loading="loading"
      :search-fields="searchFields"
      :search-params="searchParams"
      :pagination="pagination"
      show-index
      @query="onQuery"
    >
      <template #header-buttons>
        <el-button type="primary" :icon="Plus" @click="handleCreate">
          {{ t('workflow.addWorkflow') }}
        </el-button>
      </template>

      <template #column-status="{ row }">
        <el-switch :model-value="(row as Workflow).status" :active-value="1" :inactive-value="0" @change="(val) => handleToggle(row as Workflow, val)" />
      </template>

      <template #column-actions="{ row }">
        <el-button type="primary" link size="small" @click="handleDesign(row as Workflow)">
          {{ t('workflow.designer') }}
        </el-button>
        <el-button type="success" link size="small" :disabled="!(row as Workflow).publishedVersionId" @click="handlePublish(row as Workflow)">
          {{ t('workflow.publish') }}
        </el-button>
        <el-button type="warning" link size="small" @click="handleEdit(row as Workflow)">
          {{ t('common.edit') }}
        </el-button>
        <el-button type="danger" link size="small" @click="handleDelete(row as Workflow)">
          {{ t('common.delete') }}
        </el-button>
      </template>
    </ProTable>

    <el-dialog v-model="dialogVisible" :title="isEdit ? t('common.edit') : t('workflow.addWorkflow')" width="500px" destroy-on-close>
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-form-item :label="t('workflow.name')" prop="name">
          <el-input v-model="form.name" />
        </el-form-item>
        <el-form-item :label="t('common.description')" prop="description">
          <el-input v-model="form.description" type="textarea" :rows="3" />
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
import { Plus } from '@element-plus/icons-vue'
import ProTable from '@/components/ProTable/index.vue'
import { workflowApi, type Workflow } from '@/api/workflow'
import { useI18n } from '@/i18n'

const { t } = useI18n()
const router = useRouter()

const workflows = ref<Workflow[]>([])
const loading = ref(false)
const dialogVisible = ref(false)
const isEdit = ref(false)
const submitting = ref(false)
const editId = ref<number | null>(null)
const formRef = ref<InstanceType<typeof import('element-plus').ElForm> | null>(null)
const pagination = reactive({ pageNum: 1, pageSize: 10, total: 0 })

const searchFields = [
  { prop: 'keyword', label: '名称', type: 'input', placeholder: '搜索流程名称' },
  {
    prop: 'status',
    label: '状态',
    type: 'select',
    placeholder: '全部',
    options: [
      { label: '启用', value: '1' },
      { label: '禁用', value: '0' },
    ],
  },
]

const searchParams = reactive({ keyword: '', status: '' })

const columns = [
  { prop: 'name', label: '流程名称', minWidth: 160 },
  { prop: 'description', label: '描述', minWidth: 200, showOverflowTooltip: true },
  { prop: 'status', label: '状态', width: 80 },
  { prop: 'draftVersionId', label: '草稿版本', width: 100 },
  { prop: 'publishedVersionId', label: '线上版本', width: 100 },
  { prop: 'createdAt', label: '创建时间', width: 170 },
  { prop: 'actions', label: '操作', width: 280, fixed: 'right' },
]

const form = reactive({ name: '', description: '' })
const rules = { name: [{ required: true, message: '请输入流程名称', trigger: 'blur' }] }

function onQuery(params: { searchParams?: Record<string, unknown>; pagination?: { pageNum: number; pageSize: number } }) {
  if (params.searchParams) Object.assign(searchParams, params.searchParams)
  if (params.pagination) Object.assign(pagination, params.pagination)
  fetchWorkflows()
}

async function fetchWorkflows() {
  loading.value = true
  try {
    const res = await workflowApi.list({ ...searchParams, page: pagination.pageNum, pageSize: pagination.pageSize })
    workflows.value = res.data?.rows || []
    pagination.total = res.data?.total || 0
  } catch {
    workflows.value = []
  } finally {
    loading.value = false
  }
}

function handleCreate() {
  isEdit.value = false
  form.name = ''
  form.description = ''
  editId.value = null
  dialogVisible.value = true
}

function handleEdit(row: Workflow) {
  isEdit.value = true
  editId.value = row.id
  form.name = row.name
  form.description = row.description || ''
  dialogVisible.value = true
}

async function handleSubmit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  submitting.value = true
  try {
    if (isEdit.value && editId.value) {
      await workflowApi.update(editId.value, form)
      ElMessage.success('更新成功')
    } else {
      await workflowApi.create(form)
      ElMessage.success('创建成功')
    }
    dialogVisible.value = false
    fetchWorkflows()
  } catch {
    ElMessage.error('操作失败')
  } finally {
    submitting.value = false
  }
}

async function handleToggle(row: Workflow, val: number | string | boolean) {
  try {
    await workflowApi.toggle(row.id, Number(val) === 1)
    ElMessage.success(Number(val) === 1 ? '已启用' : '已禁用')
  } catch {
    fetchWorkflows()
  }
}

async function handlePublish(row: Workflow) {
  try {
    await workflowApi.publish(row.id)
    ElMessage.success('发布成功')
    fetchWorkflows()
  } catch {
    ElMessage.error('发布失败，请检查流程设计完整性')
  }
}

function handleDesign(row: Workflow) {
  router.push(`/workflows/${row.id}/design`)
}

async function handleDelete(row: Workflow) {
  try {
    await ElMessageBox.confirm(`确认删除流程「${row.name}」？`, '提示', { type: 'warning' })
    await workflowApi.delete(row.id)
    ElMessage.success('删除成功')
    fetchWorkflows()
  } catch {
    // 用户取消删除
  }
}

onMounted(fetchWorkflows)
</script>
