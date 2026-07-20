<template>
  <div class="page-container">
    <ProTable
      :title="t('aiProvider.title')"
      :columns="columns"
      :data="providers"
      :loading="loading"
      :show-pagination="true"
      :pagination="pagination"
      :search-params="searchParams"
      :search-fields="searchFields"
      column-settings-key="ai_provider_list"
      @query="onQuery"
    >
      <template #header-buttons>
        <el-button type="primary" :icon="Plus" @click="openDialog()">
          {{ t('aiProvider.addProvider') }}
        </el-button>
      </template>

      <template #column-models="{ row }">
        <div class="model-tags">
          <el-tag v-for="m in row.models.split(',')" :key="m" size="small" effect="plain" class="model-tag">
            {{ m.trim() }}
          </el-tag>
        </div>
      </template>

      <template #column-enabled="{ row }">
        <el-switch v-model="row.enabled" :active-value="1" :inactive-value="0" :loading="switchingId === row.id" @change="handleToggle(row)" />
      </template>

      <template #column-actions="{ row }">
        <div class="table-actions">
          <el-button type="primary" link size="small" :icon="Edit" @click="openDialog(row)">
            {{ t('common.edit') }}
          </el-button>
          <el-popconfirm
            :title="t('aiProvider.deleteConfirm')"
            :confirm-button-text="t('aiProvider.delete')"
            :cancel-button-text="t('aiProvider.cancel')"
            @confirm="handleDelete(row)"
          >
            <template #reference>
              <el-button type="danger" link size="small" :icon="Delete">
                {{ t('common.delete') }}
              </el-button>
            </template>
          </el-popconfirm>
        </div>
      </template>
    </ProTable>

    <FormDialog
      ref="formDialogRef"
      v-model="dialogVisible"
      v-model:form="form"
      :title="isEdit ? t('aiProvider.editTitle') : t('aiProvider.addTitle')"
      :loading="submitLoading"
      :schema="formSchema"
      :labelWidth="95"
      destroy-on-close
      @confirm="handleSubmit"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Plus, Edit, Delete } from '@element-plus/icons-vue'
import { aiApi, type AiProvider } from '@/api/ai'
import { getErrorMessage } from '@/utils/error'
import ProTable from '@/components/ProTable/index.vue'
import FormDialog from '@/components/FormDialog.vue'
import { useI18n } from '@/i18n'

const { t } = useI18n()

const loading = ref(false)
const switchingId = ref<number | null>(null)
const providers = ref<AiProvider[]>([])
const dialogVisible = ref(false)
const isEdit = ref(false)
const submitLoading = ref(false)
const editingId = ref<number | null>(null)
const pagination = reactive({
  pageNum: 1,
  pageSize: 20,
  total: 0,
})

const searchParams = reactive({
  keyword: '',
})

const searchFields = computed(() => [{ prop: 'keyword', label: t('aiProvider.name'), type: 'input', placeholder: t('aiProvider.searchPlaceholder') }])

const columns = computed(() => [
  { prop: 'index', label: t('common.index'), width: 60 },
  { prop: 'name', label: t('aiProvider.name'), minWidth: 120 },
  { prop: 'apiBaseUrl', label: t('aiProvider.apiUrl'), minWidth: 260 },
  { prop: 'defaultModel', label: t('aiProvider.defaultModel'), width: 160 },
  { prop: 'models', label: t('aiProvider.availableModels'), minWidth: 200 },
  { prop: 'enabled', label: t('aiProvider.status'), width: 80, align: 'center' },
  { prop: 'remark', label: t('aiProvider.remark'), minWidth: 150, showOverflowTooltip: true },
  { prop: 'actions', label: t('common.actions'), width: 160, fixed: 'right' },
])

const defaultForm = {
  name: '',
  apiBaseUrl: '',
  apiKey: '',
  models: '',
  defaultModel: '',
  enabled: 1,
  sort: 0,
  description: '',
}

const form = reactive<Record<string, unknown>>({ ...defaultForm })

const formSchema = computed(() => [
  { prop: 'name', label: t('aiProvider.dialogName'), type: 'input', placeholder: t('aiProvider.namePlaceholder'), required: true, props: { maxlength: 100 } },
  {
    prop: 'apiBaseUrl',
    label: t('aiProvider.dialogApiUrl'),
    type: 'input',
    placeholder: t('aiProvider.apiUrlPlaceholder'),
    required: true,
    props: { maxlength: 255 },
  },
  {
    prop: 'defaultModel',
    label: t('aiProvider.dialogDefaultModel'),
    type: 'input',
    placeholder: t('aiProvider.modelPlaceholder'),
    required: true,
    props: { maxlength: 100 },
  },
  {
    prop: 'models',
    label: t('aiProvider.dialogModels'),
    type: 'input',
    placeholder: t('aiProvider.modelsPlaceholder'),
    required: true,
    props: { maxlength: 500 },
  },
  {
    prop: 'apiKey',
    label: t('aiProvider.dialogApiKey'),
    type: 'input',
    placeholder: isEdit.value ? t('aiProvider.apiKeyEditPlaceholder') : t('aiProvider.apiKeyPlaceholder'),
    props: { type: 'password', showPassword: true, maxlength: 500 },
  },
  {
    prop: 'description',
    label: t('aiProvider.dialogRemark'),
    type: 'textarea',
    placeholder: t('aiProvider.modelsTip'),
    props: { rows: 2, maxlength: 255, showWordLimit: true },
  },
])

async function fetchList() {
  loading.value = true
  try {
    const params: Record<string, string> = {}
    if (searchParams.keyword) {
      params.keyword = searchParams.keyword
    }
    const res = await aiApi.getProviders(params)
    providers.value = res.data || []
    pagination.total = providers.value.length
  } catch {
    ElMessage.error(t('aiProvider.fetchFailed'))
  } finally {
    loading.value = false
  }
}

function onQuery(params: { pagination?: { pageNum: number; pageSize: number }; searchParams?: Record<string, unknown> }) {
  if (params.pagination) {
    Object.assign(pagination, params.pagination)
  }
  if (params.searchParams) {
    Object.assign(searchParams, params.searchParams)
  }
  fetchList()
}

async function openDialog(row?: Record<string, unknown>) {
  if (row) {
    isEdit.value = true
    editingId.value = row.id as number
    Object.assign(form, {
      name: row.name,
      apiBaseUrl: row.apiBaseUrl,
      apiKey: '',
      models: row.models,
      defaultModel: row.defaultModel,
      enabled: row.enabled,
      sort: row.sort,
      description: row.description || '',
    })
    dialogVisible.value = true

    try {
      const res = await aiApi.getProvider(row.id as number, true)
      if (res.data?.apiKey) {
        form.apiKey = res.data.apiKey
      }
    } catch {
      // ignore
    }
  } else {
    isEdit.value = false
    editingId.value = null
    Object.assign(form, { ...defaultForm })
    dialogVisible.value = true
  }
}

interface ProFormInstance {
  formRef: { validate: () => Promise<boolean> }
  getFormData: () => Record<string, unknown>
}

async function handleSubmit(proForm: ProFormInstance | null) {
  if (!proForm) return
  const valid = await proForm.formRef.validate().catch(() => false)
  if (!valid) return

  const data = proForm.getFormData()
  if (!data.name || !data.apiBaseUrl || !data.models || !data.defaultModel) {
    ElMessage.warning(t('aiProvider.enterName'))
    return
  }

  if (!isEdit.value && !data.apiKey) {
    ElMessage.warning(t('aiProvider.enterApiKey'))
    return
  }

  submitLoading.value = true
  try {
    const apiKey = data.apiKey as string | undefined
    if (isEdit.value && !apiKey?.trim()) {
      delete data.apiKey
    }

    if (data.models && !isEdit.value) {
      const modelStr = data.models as string
      const modelList = modelStr
        .split(',')
        .map((m: string) => m.trim())
        .filter(Boolean)
      if (!data.defaultModel && modelList.length > 0) {
        data.defaultModel = modelList[0]
      }
    }

    if (isEdit.value && editingId.value) {
      await aiApi.updateProvider(editingId.value, data as Parameters<typeof aiApi.updateProvider>[1])
      ElMessage.success(t('aiProvider.updateSuccess'))
    } else {
      await aiApi.createProvider(data as Parameters<typeof aiApi.createProvider>[0])
      ElMessage.success(t('aiProvider.createSuccess'))
    }
    dialogVisible.value = false
    await fetchList()
  } catch (err: unknown) {
    ElMessage.error(getErrorMessage(err) || t('aiProvider.operationFailed'))
  } finally {
    submitLoading.value = false
  }
}

async function handleDelete(row: Record<string, unknown>) {
  try {
    const provider = row as unknown as AiProvider
    await aiApi.deleteProvider(provider.id)
    ElMessage.success(t('aiProvider.deleteSuccess'))
    await fetchList()
  } catch {
    ElMessage.error(t('aiProvider.deleteFailed'))
  }
}

async function handleToggle(row: Record<string, unknown>) {
  const provider = row as unknown as AiProvider
  if (!provider.id) return
  const targetVal = provider.enabled
  switchingId.value = provider.id
  try {
    await aiApi.updateProvider(provider.id, { enabled: targetVal })
    ElMessage.success(targetVal === 1 ? t('aiProvider.enabled') : t('aiProvider.disabled'))
  } catch {
    row.enabled = targetVal === 1 ? 0 : 1
    ElMessage.error(t('aiProvider.operationFailed'))
  } finally {
    switchingId.value = null
  }
}

onMounted(() => {
  fetchList()
})
</script>

<style scoped lang="scss">
.page-container {
  padding: 20px;
}

.provider-name-cell {
  display: flex;
  align-items: center;
  gap: 6px;

  .provider-icon {
    color: var(--el-color-primary);
  }
}

.model-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;

  .model-tag {
    font-family: monospace;
  }
}

.table-actions {
  display: flex;
  gap: 4px;
}
</style>
