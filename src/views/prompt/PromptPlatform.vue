<template>
  <div class="page-container">
    <ProTable
      :key="locale"
      :title="t('prompt.platformTitle')"
      :columns="columns"
      :data="rows"
      :loading="loading"
      :show-pagination="true"
      :pagination="pagination"
      :search-params="searchParams"
      :search-fields="searchFields"
      column-settings-key="prompt_platform_list"
      @query="onQuery"
    >
      <template #header-buttons>
        <el-button type="primary" :icon="Plus" @click="openDialog()">{{ t('prompt.addPlatform') }}</el-button>
      </template>

      <template #column-name="{ row }">
        <span>{{ row.name }}</span>
        <el-tag v-if="row.builtin" size="small" type="info" class="builtin-tag">{{ t('prompt.defaultPlatform') }}</el-tag>
      </template>

      <template #column-status="{ row }">
        <el-tag :type="row.status === 1 ? 'success' : 'info'" size="small">{{ row.status === 1 ? t('common.enable') : t('common.disable') }}</el-tag>
      </template>

      <template #column-createdAt="{ row }">
        {{ formatDate(row.createdAt) }}
      </template>

      <template #column-actions="{ row }">
        <div class="table-actions">
          <el-button type="warning" link size="small" :icon="Edit" @click="openDialog(row)">{{ t('common.edit') }}</el-button>
          <el-button v-if="!row.builtin" type="danger" link size="small" :icon="Delete" @click="handleDelete(row)">{{ t('common.delete') }}</el-button>
        </div>
      </template>
    </ProTable>

    <el-dialog
      v-model="dialogVisible"
      :title="isEdit ? t('prompt.editPlatform') : t('prompt.addPlatform')"
      width="460px"
      :close-on-click-modal="false"
      destroy-on-close
    >
      <p class="platform-tip">{{ t('prompt.platformTip') }}</p>
      <ProForm ref="formRef" v-model="form" :schema="formSchema" :columns="1" :show-actions="false" label-width="90px" />
      <template #footer>
        <el-button @click="dialogVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="submitting" @click="handleSubmit">{{ t('common.confirm') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Edit, Delete } from '@element-plus/icons-vue'
import { promptApi, type PromptPlatform } from '@/api/prompt'
import { getErrorMessage } from '@/utils/error'
import ProTable from '@/components/ProTable/index.vue'
import ProForm from '@/components/ProForm/index.vue'
import { useI18n } from '@/i18n'

const { t, locale } = useI18n()

const columns = computed(() => [
  { prop: 'id', label: 'ID', width: 70 },
  { prop: 'name', label: t('prompt.platformName'), minWidth: 160 },
  { prop: 'sort', label: t('prompt.sort'), width: 80, align: 'center' },
  { prop: 'status', label: t('common.status'), width: 90, align: 'center' },
  { prop: 'promptCount', label: t('prompt.promptCount'), width: 100, align: 'center' },
  { prop: 'imageCount', label: t('prompt.imageCount'), width: 100, align: 'center' },
  { prop: 'createdAt', label: t('common.createdTime'), width: 175 },
  { prop: 'actions', label: t('common.operation'), width: 150, fixed: 'right' },
])

const searchFields = computed(() => [
  { prop: 'keyword', label: t('common.keyword'), type: 'input', placeholder: t('prompt.platformName') },
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

interface PlatformForm {
  name: string
  sort: number
  status: number
}

const rows = ref<PromptPlatform[]>([])
const loading = ref(false)
const pagination = reactive({ pageNum: 1, pageSize: 10, total: 0 })
const searchParams = reactive<Record<string, unknown>>({ keyword: '', status: '' })
const dialogVisible = ref(false)
const isEdit = ref(false)
const isBuiltin = ref(false)
const submitting = ref(false)
const currentId = ref<number | null>(null)
const formRef = ref<InstanceType<typeof ProForm> | null>(null)
const form = reactive<PlatformForm>({ name: '', sort: 0, status: 1 })

const formSchema = computed(() => [
  { prop: 'name', label: t('prompt.platformName'), type: 'input', required: true },
  { prop: 'sort', label: t('prompt.sort'), type: 'number' },
  {
    prop: 'status',
    label: t('common.status'),
    type: 'switch',
    props: { disabled: isBuiltin.value, activeText: t('common.enable'), inactiveText: t('common.disable') },
    activeValue: 1,
    inactiveValue: 0,
  },
])

const formatDate = (value: unknown): string => (value ? new Date(String(value)).toLocaleString() : '-')

const fetchRows = async (): Promise<void> => {
  loading.value = true
  try {
    const res = await promptApi.getPlatforms({
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
    const item = row as unknown as PromptPlatform
    isEdit.value = true
    isBuiltin.value = Boolean(item.builtin)
    currentId.value = item.id
    form.name = item.name
    form.sort = item.sort
    form.status = item.status
  } else {
    isEdit.value = false
    isBuiltin.value = false
    currentId.value = null
    form.name = ''
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
    const payload = { name: form.name, sort: form.sort, status: isBuiltin.value ? 1 : form.status }
    if (isEdit.value && currentId.value !== null) await promptApi.updatePlatform(currentId.value, payload)
    else await promptApi.createPlatform(payload)
    ElMessage.success(t('common.success'))
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
  const item = row as unknown as PromptPlatform
  ElMessageBox.confirm(`${t('prompt.platformDeleteConfirm')}「${item.name}」`, t('common.confirm'), {
    type: 'warning',
    confirmButtonText: t('common.delete'),
    cancelButtonText: t('common.cancel'),
  })
    .then(async () => {
      try {
        await promptApi.deletePlatform(item.id)
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

<style scoped>
.builtin-tag {
  margin-left: 8px;
}

.platform-tip {
  margin: 0 0 14px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--el-text-color-secondary);
}
</style>
