<template>
  <div class="page-container">
    <ProTable
      ref="proTableRef"
      :title="t('{{moduleName}}.title')"
      :columns="columns"
      :search-fields="searchFields"
      :data="dataList"
      :loading="loading"
      :show-pagination="true"
      :pagination="pagination"
      :search-params="searchParams"
      column-settings-key="{{moduleName}}_list"
      :show-selection="true"
      @query="onQuery"
      @selection-change="handleSelectionChange"
    >
      <template #header-buttons>
        <el-button type="danger" :icon="Delete" :disabled="selectedIds.length === 0" @click="handleBatchDelete">
          {{ t('common.batchDelete') }}
          <template v-if="selectedIds.length">
            {{ ` (${selectedIds.length})` }}
          </template>
        </el-button>
        <el-button type="primary" :icon="Plus" @click="handleOpenCreate">
          {{ t('{{moduleName}}.add{{moduleNameCapital}}') }}
        </el-button>
      </template>

      <template #column-name="{ row }">
        <span style="font-weight: 500; color: var(--mainColor); cursor: pointer" @click="handleOpenEdit(row)">{{ row.name }}</span>
      </template>

      <template #column-status="{ row }">
        <el-tag :type="row.status === 1 ? 'success' : 'info'" size="small">
          {{ row.status === 1 ? t('{{moduleName}}.enabled') : t('{{moduleName}}.disabled') }}
        </el-tag>
      </template>

      <template #column-createdAt="{ row }">
        {{ row.createdAt ? new Date(row.createdAt).toLocaleString() : '-' }}
      </template>

      <template #column-actions="{ row }">
        <div class="table-actions" style="white-space: normal; display: flex; gap: 4px; flex-wrap: wrap; align-items: center">
          <el-button type="primary" link size="small" :icon="Edit" @click="handleOpenEdit(row)">
            {{ t('common.edit') }}
          </el-button>
          <el-button type="danger" link size="small" :icon="Delete" @click="handleDelete(row)">
            {{ t('common.delete') }}
          </el-button>
        </div>
      </template>
    </ProTable>

    <FormDialog
      v-model="dialogVisible"
      :title="isEdit ? t('{{moduleName}}.edit{{moduleNameCapital}}') : t('{{moduleName}}.add{{moduleNameCapital}}')"
      :loading="submitting"
      width="600px"
      @confirm="handleConfirm"
    >
      <ProForm
        ref="proFormRef"
        :columns="formColumns"
        :model="formData"
        :rules="rules"
        label-width="100px"
      />
    </FormDialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Edit, Delete } from '@element-plus/icons-vue'
import ProTable from '@/components/ProTable/index.vue'
import ProForm from '@/components/ProForm/index.vue'
import FormDialog from '@/components/FormDialog.vue'
import { {{moduleName}}Api, type {{moduleNameCapital}} } from '@/api/{{moduleName}}'

const { t } = useI18n()

const proTableRef = ref()
const proFormRef = ref()
const dataList = ref<{{moduleNameCapital}}[]>([])
const loading = ref(false)
const dialogVisible = ref(false)
const isEdit = ref(false)
const submitting = ref(false)
const selectedIds = ref<number[]>([])

const searchParams = reactive({
  keyword: '',
  status: undefined as number | undefined,
})

const pagination = reactive({
  page: 1,
  pageSize: 10,
  total: 0,
})

const formData = reactive({
  id: undefined as number | undefined,
  name: '',
  description: '',
  status: 1,
  sort: 0,
})

const rules = computed(() => ({
  name: [{ required: true, message: t('{{moduleName}}.nameRequired'), trigger: 'blur' }],
}))

const columns = computed(() => [
  { prop: 'id', label: 'ID', width: 80 },
  { prop: 'name', label: t('{{moduleName}}.name'), slot: 'column-name', minWidth: 150 },
  { prop: 'description', label: t('{{moduleName}}.description'), minWidth: 200 },
  { prop: 'status', label: t('{{moduleName}}.status'), slot: 'column-status', width: 100 },
  { prop: 'sort', label: t('{{moduleName}}.sort'), width: 80 },
  { prop: 'createdAt', label: t('{{moduleName}}.createdAt'), slot: 'column-createdAt', width: 180 },
  { prop: 'actions', label: t('common.actions'), slot: 'column-actions', width: 160, fixed: 'right' as const },
])

const searchFields = computed(() => [
  { prop: 'keyword', label: t('{{moduleName}}.keyword'), type: 'input', placeholder: t('{{moduleName}}.keywordPlaceholder') },
  { prop: 'status', label: t('{{moduleName}}.status'), type: 'select', options: [
    { label: t('{{moduleName}}.enabled'), value: 1 },
    { label: t('{{moduleName}}.disabled'), value: 0 },
  ]},
])

const formColumns = computed(() => [
  { prop: 'name', label: t('{{moduleName}}.name'), type: 'input', required: true },
  { prop: 'description', label: t('{{moduleName}}.description'), type: 'textarea', rows: 3 },
  { prop: 'status', label: t('{{moduleName}}.status'), type: 'switch', activeValue: 1, inactiveValue: 0 },
  { prop: 'sort', label: t('{{moduleName}}.sort'), type: 'number', min: 0 },
])

const onQuery = async (params: any) => {
  Object.assign(searchParams, params)
  pagination.page = 1
  await fetchData()
}

const fetchData = async () => {
  loading.value = true
  try {
    const res = await {{moduleName}}Api.list({
      ...searchParams,
      page: pagination.page,
      pageSize: pagination.pageSize,
    })
    dataList.value = res.data.list
    pagination.total = res.data.total
  } catch {
    // 错误已在全局处理
  } finally {
    loading.value = false
  }
}

const handleSelectionChange = (ids: number[]) => {
  selectedIds.value = ids
}

const resetForm = () => {
  Object.assign(formData, {
    id: undefined,
    name: '',
    description: '',
    status: 1,
    sort: 0,
  })
}

const handleOpenCreate = () => {
  isEdit.value = false
  resetForm()
  dialogVisible.value = true
}

const handleOpenEdit = (row: {{moduleNameCapital}}) => {
  isEdit.value = true
  Object.assign(formData, { ...row })
  dialogVisible.value = true
}

const handleConfirm = async () => {
  const valid = await proFormRef.value?.validate()
  if (!valid) return

  submitting.value = true
  try {
    if (isEdit.value && formData.id) {
      await {{moduleName}}Api.update(formData.id, formData)
      ElMessage.success(t('common.updateSuccess'))
    } else {
      await {{moduleName}}Api.create(formData)
      ElMessage.success(t('common.createSuccess'))
    }
    dialogVisible.value = false
    await fetchData()
  } catch {
    // 错误已在全局处理
  } finally {
    submitting.value = false
  }
}

const handleDelete = async (row: {{moduleNameCapital}}) => {
  try {
    await ElMessageBox.confirm(
      t('{{moduleName}}.deleteConfirm', { name: row.name }),
      t('common.confirm'),
      { type: 'warning' }
    )
    await {{moduleName}}Api.delete(row.id)
    ElMessage.success(t('common.deleteSuccess'))
    await fetchData()
  } catch {
    // 取消删除或错误
  }
}

const handleBatchDelete = async () => {
  if (selectedIds.value.length === 0) return
  try {
    await ElMessageBox.confirm(
      t('{{moduleName}}.batchDeleteConfirm', { count: selectedIds.value.length }),
      t('common.confirm'),
      { type: 'warning' }
    )
    for (const id of selectedIds.value) {
      await {{moduleName}}Api.delete(id)
    }
    ElMessage.success(t('common.deleteSuccess'))
    selectedIds.value = []
    await fetchData()
  } catch {
    // 取消删除或错误
  }
}

onMounted(() => {
  fetchData()
})
</script>