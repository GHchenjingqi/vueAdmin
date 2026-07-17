<template>
  <div class="page-container">
    <div class="provider-header">
      <h3 class="provider-title">
        {{ t('aiProvider.title') }}
      </h3>
      <p class="provider-desc">
        {{ t('aiProvider.desc') }}
      </p>
    </div>

    <el-card shadow="never" class="provider-card">
      <div class="provider-toolbar">
        <el-button type="primary" :icon="Plus" @click="openDialog()">
          {{ t('aiProvider.addProvider') }}
        </el-button>
        <div class="provider-toolbar-right">
          <el-input
            v-model="searchKeyword"
            :placeholder="t('aiProvider.searchPlaceholder')"
            :prefix-icon="Search"
            clearable
            style="width: 240px"
            @input="handleSearch"
          />
          <el-button :icon="Refresh" @click="fetchList">
            {{ t('aiProvider.refresh') }}
          </el-button>
        </div>
      </div>

      <el-table v-loading="loading" :data="providers" border stripe style="width: 100%">
        <el-table-column prop="id" label="ID" width="60" align="center" />
        <el-table-column prop="name" :label="t('aiProvider.name')" min-width="120">
          <template #default="{ row }">
            <div class="provider-name-cell">
              <el-icon :size="18" class="provider-icon">
                <svg viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" fill="none" />
                  <path d="M12 6v12M6 12h12" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                </svg>
              </el-icon>
              <span>{{ row.name }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="apiBaseUrl" :label="t('aiProvider.apiUrl')" min-width="260">
          <template #default="{ row }">
            <el-tag effect="plain" type="info" style="font-family: monospace; font-size: 12px">
              {{ row.apiBaseUrl }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="defaultModel" :label="t('aiProvider.defaultModel')" width="160" />
        <el-table-column prop="models" :label="t('aiProvider.availableModels')" min-width="200">
          <template #default="{ row }">
            <div class="model-tags">
              <el-tag v-for="m in row.models.split(',')" :key="m" size="small" effect="plain" class="model-tag">
                {{ m.trim() }}
              </el-tag>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="enabled" :label="t('aiProvider.status')" width="80" align="center">
          <template #default="{ row }">
            <el-switch v-model="row.enabled" :active-value="1" :inactive-value="0" :loading="switchingId === row.id" size="small" @change="handleToggle(row)" />
          </template>
        </el-table-column>
        <el-table-column prop="description" :label="t('aiProvider.remark')" min-width="150" show-overflow-tooltip />
        <el-table-column :label="t('aiProvider.operation')" width="160" fixed="right">
          <template #default="{ row }">
            <div class="table-actions">
              <el-button type="primary" link size="small" :icon="Edit" @click="openDialog(row)">
                {{ t('aiProvider.edit') }}
              </el-button>
              <el-popconfirm
                :title="t('aiProvider.deleteConfirm')"
                :confirm-button-text="t('aiProvider.delete')"
                :cancel-button-text="t('aiProvider.cancel')"
                @confirm="handleDelete(row)"
              >
                <template #reference>
                  <el-button type="danger" link size="small" :icon="Delete">
                    {{ t('aiProvider.delete') }}
                  </el-button>
                </template>
              </el-popconfirm>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 新增/编辑弹窗 -->
    <el-dialog
      v-model="dialogVisible"
      :title="isEdit ? t('aiProvider.editTitle') : t('aiProvider.addTitle')"
      width="580px"
      :close-on-click-modal="false"
      destroy-on-close
      class="provider-dialog"
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="110px" label-position="top" class="provider-form">
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item :label="t('aiProvider.dialogName')" prop="name">
              <el-input v-model="form.name" :placeholder="t('aiProvider.namePlaceholder')" maxlength="100" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item :label="t('aiProvider.dialogDefaultModel')" prop="defaultModel">
              <el-input v-model="form.defaultModel" :placeholder="t('aiProvider.modelPlaceholder')" maxlength="100" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item :label="t('aiProvider.dialogApiUrl')" prop="apiBaseUrl">
          <el-input v-model="form.apiBaseUrl" :placeholder="t('aiProvider.apiUrlPlaceholder')" maxlength="255" />
        </el-form-item>
        <el-form-item :label="t('aiProvider.dialogApiKey')" prop="apiKey">
          <el-input
            v-model="form.apiKey"
            type="password"
            show-password
            :placeholder="isEdit ? t('aiProvider.apiKeyEditPlaceholder') : t('aiProvider.apiKeyPlaceholder')"
            maxlength="500"
          />
        </el-form-item>
        <el-form-item :label="t('aiProvider.dialogModels')" prop="models">
          <el-input v-model="form.models" :placeholder="t('aiProvider.modelsPlaceholder')" maxlength="500" />
          <div class="form-tip">
            {{ t('aiProvider.modelsTip') }}
          </div>
        </el-form-item>
        <el-form-item :label="t('aiProvider.dialogRemark')">
          <el-input v-model="form.description" type="textarea" :rows="2" :placeholder="t('aiProvider.remarkPlaceholder')" maxlength="255" show-word-limit />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">
          {{ t('aiProvider.cancel') }}
        </el-button>
        <el-button type="primary" :loading="submitLoading" @click="handleSubmit">
          {{ t('aiProvider.confirm') }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from '@/i18n'
import { ElMessage } from 'element-plus'
import type { FormInstance } from 'element-plus'
import { Plus, Edit, Delete, Search, Refresh } from '@element-plus/icons-vue'
import { aiApi, type AiProvider } from '@/api/ai'

const { t } = useI18n()

const loading = ref(false)
const switchingId = ref<number | null>(null)
const providers = ref<AiProvider[]>([])
const searchKeyword = ref('')
const dialogVisible = ref(false)
const isEdit = ref(false)
const submitLoading = ref(false)
const formRef = ref<FormInstance | null>(null)

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

const form = ref({ ...defaultForm })
const editingId = ref<number | null>(null)

const rules = {
  name: [{ required: true, message: t('aiProvider.enterName'), trigger: 'blur' }],
  apiBaseUrl: [
    { required: true, message: t('aiProvider.enterApiUrl'), trigger: 'blur' },
    { type: 'url' as const, message: t('aiProvider.enterValidUrl'), trigger: 'blur' },
  ],
  models: [{ required: true, message: t('aiProvider.enterModels'), trigger: 'blur' }],
  defaultModel: [{ required: true, message: t('aiProvider.enterDefaultModel'), trigger: 'blur' }],
}

async function fetchList() {
  loading.value = true
  try {
    const params: Record<string, string> = {}
    if (searchKeyword.value) {
      params.keyword = searchKeyword.value
    }
    const res = await aiApi.getProviders(params)
    providers.value = res.data || []
  } catch {
    ElMessage.error(t('aiProvider.fetchFailed'))
  } finally {
    loading.value = false
  }
}

function handleSearch() {
  fetchList()
}

async function openDialog(row?: Record<string, unknown>) {
  if (row) {
    isEdit.value = true
    editingId.value = row.id as number
    form.value = {
      name: row.name as string,
      apiBaseUrl: row.apiBaseUrl as string,
      apiKey: '',
      models: row.models as string,
      defaultModel: row.defaultModel as string,
      enabled: row.enabled as number,
      sort: row.sort as number,
      description: (row.description as string) || '',
    }
    dialogVisible.value = true

    // 异步拉取完整 key
    try {
      const res = await aiApi.getProvider(row.id as number, true)
      if (res.data?.apiKey) {
        form.value.apiKey = res.data.apiKey
      }
    } catch {
      // 忽略
    }
  } else {
    isEdit.value = false
    editingId.value = null
    form.value = { ...defaultForm }
    dialogVisible.value = true
  }
}

async function handleSubmit() {
  if (!formRef.value) return
  try {
    await formRef.value.validate()
  } catch {
    return
  }

  // 新增时 apiKey 必填，编辑时可选（留空则不修改）
  if (!isEdit.value && !form.value.apiKey?.trim()) {
    ElMessage.warning(t('aiProvider.enterApiKey'))
    return
  }

  submitLoading.value = true
  try {
    const data: Record<string, unknown> = { ...form.value }
    const apiKey = data.apiKey as string | undefined
    // 编辑时 apiKey 为空则删除该字段，后端会保留原值
    if (isEdit.value && !apiKey?.trim()) {
      delete data.apiKey
    }
    // 自动设置 models 中第一个为 defaultModel
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
    const axiosErr = err as { response?: { data?: { message?: string } } }
    ElMessage.error(axiosErr?.response?.data?.message || t('aiProvider.operationFailed'))
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
  const targetVal = provider.enabled
  switchingId.value = provider.id
  try {
    await aiApi.updateProvider(provider.id, { enabled: targetVal })
    ElMessage.success(targetVal === 1 ? t('aiProvider.enabled') : t('aiProvider.disabled'))
  } catch {
    // 失败时回滚本地状态
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

.provider-header {
  margin-bottom: 20px;

  .provider-title {
    margin: 0 0 6px;
    font-size: 18px;
    font-weight: 600;
    color: var(--el-text-color-primary);
  }

  .provider-desc {
    margin: 0;
    font-size: 13px;
    color: var(--el-text-color-secondary);
  }
}

.provider-card {
  border-radius: 8px;
}

.provider-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;

  .provider-toolbar-right {
    display: flex;
    align-items: center;
    gap: 8px;
  }
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

.provider-dialog {
  .provider-form {
    .form-tip {
      font-size: 12px;
      color: var(--el-text-color-placeholder);
      margin-top: 4px;
      line-height: 1.4;
    }
  }
}
</style>
