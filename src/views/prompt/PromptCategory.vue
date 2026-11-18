<template>
  <div class="page-container">
    <ProTable
      :key="locale"
      :title="t('prompt.categoryTitle')"
      :columns="columns"
      :data="rows"
      :loading="loading"
      :show-pagination="true"
      :pagination="pagination"
      :search-params="searchParams"
      :search-fields="searchFields"
      column-settings-key="prompt_category_list"
      @query="onQuery"
    >
      <template #header-buttons>
        <el-button type="primary" :icon="Plus" @click="openDialog()">
          {{ t('prompt.addCategory') }}
        </el-button>
      </template>

      <template #column-status="{ row }">
        <el-tag :type="row.status === 1 ? 'success' : 'info'" size="small">
          {{ row.status === 1 ? t('common.enable') : t('common.disable') }}
        </el-tag>
      </template>

      <template #column-createdAt="{ row }">
        {{ formatDate(row.createdAt) }}
      </template>

      <template #column-actions="{ row }">
        <div class="table-actions">
          <el-button type="warning" link size="small" :icon="Edit" @click="openDialog(row)">
            {{ t('common.edit') }}
          </el-button>
          <el-button type="danger" link size="small" :icon="Delete" @click="handleDelete(row)">
            {{ t('common.delete') }}
          </el-button>
        </div>
      </template>
    </ProTable>

    <el-dialog
      v-model="dialogVisible"
      :title="isEdit ? t('prompt.editCategory') : t('prompt.addCategory')"
      width="480px"
      :close-on-click-modal="false"
      destroy-on-close
    >
      <ProForm ref="formRef" v-model="form" :schema="formSchema" :columns="1" :show-actions="false" label-width="90px" />
      <template #footer>
        <el-button @click="dialogVisible = false">
          {{ t('common.cancel') }}
        </el-button>
        <el-button type="primary" :loading="submitting" @click="handleSubmit">
          {{ t('common.confirm') }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Edit, Delete } from '@element-plus/icons-vue'
import { promptApi, type PromptCategory } from '@/api/prompt'
import { getErrorMessage } from '@/utils/error'
import ProTable from '@/components/ProTable/index.vue'
import ProForm from '@/components/ProForm/index.vue'
import { useI18n } from '@/i18n'

const { t, locale } = useI18n()

const columns = computed(() => [
  { prop: 'id', label: 'ID', width: 70 },
  { prop: 'name', label: t('prompt.categoryName'), minWidth: 140 },
  { prop: 'description', label: t('prompt.description'), minWidth: 160, showOverflowTooltip: true },
  { prop: 'sort', label: t('prompt.sort'), width: 90, align: 'center' },
  { prop: 'status', label: t('common.status'), width: 90, align: 'center' },
  { prop: 'promptCount', label: t('prompt.promptCount'), width: 100, align: 'center' },
  { prop: 'createdAt', label: t('common.createdTime'), width: 175 },
  { prop: 'actions', label: t('common.operation'), width: 180, fixed: 'right' },
])

const searchFields = computed(() => [
  { prop: 'keyword', label: t('common.keyword'), type: 'input', placeholder: t('prompt.keywordPlaceholder') },
  {
    prop: 'status',
    label: t('common.status'),
    type: 'select',
    placeholder: t('common.all'),
    options: () => [
      { label: t('common.enable'), value: '1' },
      { label: t('common.disable'), value: '0' },
    ],
  },
])

interface CategoryForm {
  name: string
  description: string
  sort: number
  status: number
}

const rows = ref<PromptCategory[]>([])
const loading = ref(false)
const pagination = reactive({ pageNum: 1, pageSize: 10, total: 0 })
const searchParams = reactive<Record<string, unknown>>({ keyword: '', status: '' })
const dialogVisible = ref(false)
const isEdit = ref(false)
const submitting = ref(false)
const currentId = ref<number | null>(null)
const formRef = ref<InstanceType<typeof ProForm> | null>(null)
const form = reactive<CategoryForm>({ name: '', description: '', sort: 0, status: 1 })

const formSchema = computed(() => [
  { prop: 'name', label: t('prompt.categoryName'), type: 'input', required: true },
  { prop: 'description', label: t('prompt.description'), type: 'textarea', props: { rows: 2 } },
  { prop: 'sort', label: t('prompt.sort'), type: 'number' },
  {
    prop: 'status',
    label: t('common.status'),
    type: 'switch',
    props: { activeText: t('common.enable'), inactiveText: t('common.disable') },
    activeValue: 1,
    inactiveValue: 0,
  },
])

const formatDate = (value: unknown): string => (value ? new Date(String(value)).toLocaleString() : '-')

const fetchRows = async (): Promise<void> => {
  loading.value = true
  try {
    const res = await promptApi.getCategories({
      page: pagination.pageNum,
      pageSize: pagination.pageSize,
      keyword: String(searchParams.keyword || '') || undefined,
      status: String(searchParams.status || '') || undefined,
    })
    rows.value = res.data.rows
    pagination.total = res.data.total
  } catch (err: unknown) {
    ElMessage.error(getErrorMessage(err))
  } finally {
    loading.value = false
  }
}

const onQuery = ({ pagination: next, searchParams: nextSearch }: { pagination: Record<string, number>; searchParams?: Record<string, unknown> }): void => {
  Object.assign(pagination, next)
  if (nextSearch) Object.assign(searchParams, nextSearch)
  fetchRows()
}

const openDialog = (row?: Record<string, unknown>): void => {
  if (row) {
    const item = row as unknown as PromptCategory
    isEdit.value = true
    currentId.value = item.id
    form.name = item.name
    form.description = item.description ?? ''
    form.sort = item.sort
    form.status = item.status
  } else {
    isEdit.value = false
    currentId.value = null
    form.name = ''
    form.description = ''
    form.sort = 0
    form.status = 1
  }
  dialogVisible.value = true
}

const handleSubmit = async (): Promise<void> => {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  submitting.value = true
  try {
    const payload = { name: form.name, description: form.description, sort: form.sort, status: form.status }
    if (isEdit.value && currentId.value !== null) {
      await promptApi.updateCategory(currentId.value, payload)
      ElMessage.success(t('common.success'))
    } else {
      await promptApi.createCategory(payload)
      ElMessage.success(t('common.success'))
    }
    dialogVisible.value = false
    fetchRows()
  } catch (err: unknown) {
    const axiosErr = err as { response?: { data?: { message?: string } } }
    ElMessage.error(axiosErr.response?.data?.message || getErrorMessage(err))
  } finally {
    submitting.value = false
  }
}

const handleDelete = (row: Record<string, unknown>): void => {
  const item = row as unknown as PromptCategory
  ElMessageBox.confirm(`${t('prompt.categoryDeleteConfirm')}「${item.name}」`, t('common.confirm'), {
    type: 'warning',
    confirmButtonText: t('common.delete'),
    cancelButtonText: t('common.cancel'),
  })
    .then(async () => {
      try {
        await promptApi.deleteCategory(item.id)
        ElMessage.success(t('common.success'))
        fetchRows()
      } catch (err: unknown) {
        const axiosErr = err as { response?: { data?: { message?: string } } }
        ElMessage.error(axiosErr.response?.data?.message || getErrorMessage(err))
      }
    })
    .catch(() => undefined)
}

onMounted(fetchRows)
</script>
