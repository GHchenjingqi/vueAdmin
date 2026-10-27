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

      <template #column-draftVersionId="{ row }">
        <span>{{ (row as Workflow).draftVersionId ? `V${(row as Workflow).draftVersionId}` : '-' }}</span>
      </template>
      <template #column-publishedVersionId="{ row }">
        <span>{{ (row as Workflow).publishedVersionId ? `V${(row as Workflow).publishedVersionId}` : '-' }}</span>
      </template>

      <template #column-actions="{ row }">
        <div class="table-actions">
          <el-button type="primary" link size="small" @click="handleDesign(row as Workflow)">
            {{ t('workflow.design') }}
          </el-button>
          <el-dropdown trigger="click" @command="(cmd) => handleActionCommand(cmd, row as Workflow)">
            <el-button type="primary" link size="small">
              {{ t('common.more') }}
              <el-icon class="el-icon--right">
                <ArrowDown />
              </el-icon>
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="publish" :disabled="!(row as Workflow).draftVersionId">
                  {{ (row as Workflow).publishedVersionId ? t('workflow.republish') : t('common.publish') }}
                </el-dropdown-item>
                <el-dropdown-item command="edit" :icon="Edit">
                  {{ t('common.edit') }}
                </el-dropdown-item>
                <el-dropdown-item command="delete" :icon="Delete" divided style="color: var(--el-color-danger)">
                  {{ t('common.delete') }}
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
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
import { Plus, Edit, Delete, ArrowDown } from '@element-plus/icons-vue'
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

const searchParams = reactive({ keyword: '', status: '' })

const searchFields = computed(() => [
  { prop: 'keyword', label: t('common.name'), type: 'input', placeholder: t('workflow.name') },
  {
    prop: 'status',
    label: t('common.status'),
    type: 'select',
    placeholder: t('common.all'),
    options: [
      { label: t('common.enable'), value: 1 },
      { label: t('common.disable'), value: 0 },
    ],
  },
])

const columns = computed(() => [
  { prop: 'name', label: t('workflow.name'), minWidth: 160 },
  { prop: 'description', label: t('common.description'), minWidth: 200, showOverflowTooltip: true },
  { prop: 'status', label: t('common.status'), width: 80 },
  { prop: 'draftVersionId', label: t('workflow.draftVersion'), width: 100 },
  { prop: 'publishedVersionId', label: t('workflow.publishedVersion'), width: 100 },
  { prop: 'createdAt', label: t('common.createdTime'), width: 170 },
  { prop: 'actions', label: t('common.actions'), width: 150, fixed: 'right' },
])

const form = reactive({ name: '', description: '' })
const rules = { name: [{ required: true, message: t('workflow.ruleNameRequired'), trigger: 'blur' }] }

function onQuery(params: { searchParams?: Record<string, unknown>; pagination?: { pageNum: number; pageSize: number } }) {
  if (params.searchParams) Object.assign(searchParams, params.searchParams)
  if (params.pagination) Object.assign(pagination, params.pagination)
  fetchWorkflows()
}

async function fetchWorkflows() {
  loading.value = true
  try {
    const res = await workflowApi.list({ ...searchParams, page: pagination.pageNum, pageSize: pagination.pageSize }, true)
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
      ElMessage.success(t('common.updateSuccess'))
      dialogVisible.value = false
      fetchWorkflows()
    } else {
      const res = await workflowApi.create(form)
      ElMessage.success(t('common.createSuccess'))
      dialogVisible.value = false
      const newId = (res.data as unknown as { id?: number } | undefined)?.id
      try {
        await ElMessageBox.confirm(t('workflow.goToDesignerTip'), t('workflow.design'), {
          confirmButtonText: t('workflow.design'),
          cancelButtonText: t('common.cancel'),
          type: 'success',
        })
        if (newId) router.push(`/workflows/${newId}/design`)
        else fetchWorkflows()
      } catch {
        fetchWorkflows()
      }
    }
  } catch {
    ElMessage.error(t('workflow.operationFailed'))
  } finally {
    submitting.value = false
  }
}

async function handleToggle(row: Workflow, val: number | string | boolean) {
  if (!row?.id) return
  // el-switch 在挂载时会触发一次 change（val 与当前状态一致），属于初始化噪音，直接忽略
  if (Number(val) === Number(row.status)) return
  const enable = Number(val) === 1
  try {
    const tipKey = enable ? 'workflow.confirmEnable' : 'workflow.confirmDisable'
    const extra = row.publishedVersionId ? `\n${t('workflow.hasPublishedWarn')}` : ''
    await ElMessageBox.confirm(t(tipKey, { name: row.name }) + extra, t('common.tip'), {
      confirmButtonText: t('common.confirm'),
      cancelButtonText: t('common.cancel'),
      type: 'warning',
    })
    await workflowApi.toggle(row.id, enable)
    ElMessage.success(enable ? t('workflow.enabledMsg') : t('workflow.disabledMsg'))
  } catch {
    fetchWorkflows()
  }
}

async function handlePublish(row: Workflow) {
  try {
    await workflowApi.publish(row.id)
    ElMessage.success(t('common.publish'))
    fetchWorkflows()
  } catch {
    ElMessage.error(t('workflow.publishFailedCheckDesign'))
  }
}

function handleActionCommand(cmd: string, row: Workflow) {
  if (cmd === 'publish') handlePublish(row)
  else if (cmd === 'edit') handleEdit(row)
  else if (cmd === 'delete') handleDelete(row)
}

function handleDesign(row: Workflow) {
  router.push(`/workflows/${row.id}/design`)
}

async function handleDelete(row: Workflow) {
  try {
    const extra = row.publishedVersionId ? `\n${t('workflow.hasPublishedWarn')}` : ''
    await ElMessageBox.confirm(t('workflow.confirmDelete', { name: row.name }) + extra, t('common.tip'), { type: 'warning' })
    await workflowApi.delete(row.id)
    ElMessage.success(t('workflow.deleteSuccess'))
    fetchWorkflows()
  } catch {
    // 用户取消删除
  }
}

onMounted(fetchWorkflows)
</script>

<style lang="scss" scoped>
.table-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}
</style>
