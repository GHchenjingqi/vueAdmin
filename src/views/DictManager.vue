<template>
  <div class="page-container">
    <ProTable
      :key="locale"
      :title="t('dict.title')"
      :columns="typeColumns"
      :data="types"
      :loading="typeLoading"
      :show-pagination="true"
      :pagination="typePagination"
      :search-params="typeSearchParams"
      :search-fields="typeSearchFields"
      column-settings-key="dict_type_list"
      @query="onTypeQuery"
    >
      <template #header-buttons>
        <el-button type="primary" :icon="Plus" @click="openTypeDialog()">
          {{ t('dict.addDict') }}
        </el-button>
        <el-button :icon="Refresh" :loading="refreshCacheLoading" @click="handleRefreshCache">
          {{ t('dict.refreshCache') }}
        </el-button>
      </template>

      <template #column-status="{ row }">
        <el-tag :type="row.status === 1 ? 'success' : 'info'" size="small">
          {{ row.status === 1 ? t('dict.enabled') : t('dict.disabled') }}
        </el-tag>
      </template>

      <template #column-createdAt="{ row }">
        {{ row.createdAt ? new Date(row.createdAt).toLocaleString() : '-' }}
      </template>

      <template #column-actions="{ row }">
        <div class="table-actions">
          <el-button type="primary" link size="small" :icon="DataAnalysis" @click="openDataDialog(row)">
            {{ t('dict.dictData') }}
          </el-button>
          <el-button type="warning" link size="small" :icon="Edit" @click="openTypeDialog(row)">
            {{ t('common.edit') }}
          </el-button>
          <el-button type="danger" link size="small" :icon="Delete" @click="handleDeleteType(row)">
            {{ t('common.delete') }}
          </el-button>
        </div>
      </template>
    </ProTable>

    <!-- 字典类型弹窗 -->
    <el-dialog
      v-model="typeDialogVisible"
      :title="isEditType ? t('dict.editDictType') : t('dict.addDictType')"
      width="480px"
      :close-on-click-modal="false"
      destroy-on-close
    >
      <ProForm ref="typeFormRef" v-model="typeForm" :schema="typeFormSchema" :columns="1" :show-actions="false" label-width="90px" />
      <template #footer>
        <el-button @click="typeDialogVisible = false">
          {{ t('common.cancel') }}
        </el-button>
        <el-button type="primary" :loading="typeSubmitLoading" @click="handleSubmitType">
          {{ t('common.confirm') }}
        </el-button>
      </template>
    </el-dialog>

    <!-- 字典数据弹窗 -->
    <el-dialog
      v-model="dataDialogVisible"
      :title="`${t('dict.dictData')} - ${currentTypeName} (${currentDictType})`"
      width="860px"
      :close-on-click-modal="false"
      top="5vh"
      destroy-on-close
    >
      <div class="dict-data-dialog">
        <div class="dict-data-toolbar" style="margin-bottom: 16px">
          <el-input
            v-model="dataSearchParams.keyword"
            :placeholder="t('dict.searchPlaceholder')"
            :prefix-icon="Search"
            clearable
            class="dict-data-search"
            style="width: 240px"
            @change="onDataSearch"
            @keyup.enter="onDataSearch"
          />
          <el-button type="primary" :icon="Plus" @click="openDataItemDialog()">
            {{ t('dict.addData') }}
          </el-button>
        </div>

        <el-table :key="locale" v-loading="dataLoading" :data="dataItems" border stripe class="dict-data-table">
          <el-table-column prop="id" :label="t('common.id')" width="60" />
          <el-table-column prop="label" :label="t('dict.dictLabel')" width="140" />
          <el-table-column prop="value" :label="t('dict.dictValue')" width="140" />
          <el-table-column prop="sort" :label="t('dict.sort')" width="70" align="center" />
          <el-table-column prop="status" :label="t('dict.status')" width="80" align="center">
            <template #default="{ row }">
              <el-tag :type="row.status === 1 ? 'success' : 'info'" size="small">
                {{ row.status === 1 ? t('dict.enabled') : t('dict.disabled') }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="remark" :label="t('dict.remark')" min-width="140" show-overflow-tooltip />
          <el-table-column :label="t('common.operation')" width="180" fixed="right">
            <template #default="{ row }">
              <div class="table-actions">
                <el-button type="warning" link size="small" :icon="Edit" @click="openDataItemDialog(row)">
                  {{ t('common.edit') }}
                </el-button>
                <el-button type="danger" link size="small" :icon="Delete" @click="handleDeleteData(row)">
                  {{ t('common.delete') }}
                </el-button>
              </div>
            </template>
          </el-table-column>
        </el-table>

        <el-pagination
          v-model:current-page="dataPagination.pageNum"
          v-model:page-size="dataPagination.pageSize"
          :total="dataPagination.total"
          :page-sizes="[10, 20, 50]"
          layout="total, sizes, prev, pager, next"
          class="dict-data-pagination"
          @current-change="fetchDataItems"
          @size-change="fetchDataItems"
        />
      </div>
    </el-dialog>

    <!-- 字典数据项弹窗 -->
    <el-dialog
      v-model="dataItemDialogVisible"
      :title="isEditData ? t('dict.editData') : t('dict.addDictData')"
      width="480px"
      :close-on-click-modal="false"
      destroy-on-close
    >
      <ProForm ref="dataFormRef" v-model="dataForm" :schema="dataFormSchema" :columns="1" :show-actions="false" label-width="90px" />
      <template #footer>
        <el-button @click="dataItemDialogVisible = false">
          {{ t('common.cancel') }}
        </el-button>
        <el-button type="primary" :loading="dataSubmitLoading" @click="handleSubmitData">
          {{ t('common.confirm') }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Edit, Delete, DataAnalysis, Search, Refresh } from '@element-plus/icons-vue'
import { dictApi } from '@/api'
import type { DictType, DictData } from '@/types/api'
import { getErrorMessage } from '@/utils/error'
import ProTable from '@/components/ProTable/index.vue'
import ProForm from '@/components/ProForm/index.vue'
import { useI18n } from '@/i18n'

const { t, locale } = useI18n()

// ==================== 字典类型 ====================
const typeColumns = computed(() => [
  { prop: 'index', label: t('common.index'), width: 60 },
  { prop: 'id', label: t('common.id'), width: 70 },
  { prop: 'name', label: t('dict.dictName'), minWidth: 140 },
  { prop: 'type', label: t('dict.dictType'), width: 160 },
  { prop: 'status', label: t('dict.status'), width: 80, align: 'center' },
  { prop: 'remark', label: t('dict.remark'), minWidth: 160, showOverflowTooltip: true },
  { prop: 'createdAt', label: t('common.createdTime'), width: 175 },
  { prop: 'actions', label: t('common.operation'), width: 280, fixed: 'right' },
])

const types = ref<DictType[]>([])
const typeLoading = ref(false)
const typePagination = reactive({ pageNum: 1, pageSize: 10, total: 0 })
const typeSearchParams = reactive({ keyword: '' })
const typeSearchFields = computed(() => [{ prop: 'keyword', label: t('common.keyword'), type: 'input', placeholder: t('dict.searchPlaceholder') }])

const typeDialogVisible = ref(false)
const isEditType = ref(false)
const typeSubmitLoading = ref(false)
const typeFormRef = ref<InstanceType<typeof ProForm> | null>(null)
const currentTypeId = ref<number | null>(null)

interface TypeForm {
  name: string
  type: string
  status: number
  remark: string
}

const typeForm = reactive<TypeForm>({
  name: '',
  type: '',
  status: 1,
  remark: '',
})

const typeFormSchema = computed(() => [
  { prop: 'name', label: t('dict.dictName'), type: 'input', placeholder: t('dict.inputDictName'), required: true },
  { prop: 'type', label: t('dict.dictType'), type: 'input', placeholder: t('dict.inputDictType'), required: true },
  {
    prop: 'status',
    label: t('common.status'),
    type: 'switch',
    props: { activeText: t('dict.enabled'), inactiveText: t('dict.disabled') },
    activeValue: 1,
    inactiveValue: 0,
  },
  { prop: 'remark', label: t('dict.remark'), type: 'textarea', placeholder: t('dict.inputRemark'), props: { rows: 2 } },
])

const fetchTypes = async (): Promise<void> => {
  typeLoading.value = true
  try {
    const res = await dictApi.getTypes({
      page: typePagination.pageNum,
      pageSize: typePagination.pageSize,
      keyword: typeSearchParams.keyword || undefined,
    })
    types.value = res.data.rows
    typePagination.total = res.data.total
  } catch (err: unknown) {
    ElMessage.error(t('dict.fetchTypesFailed') + ': ' + getErrorMessage(err))
  } finally {
    typeLoading.value = false
  }
}

const onTypeQuery = ({ pagination }: { pagination: Record<string, number> }): void => {
  Object.assign(typePagination, pagination)
  fetchTypes()
}

const openTypeDialog = (row?: Record<string, unknown>): void => {
  if (row) {
    isEditType.value = true
    const dictRow = row as Record<string, unknown>
    currentTypeId.value = dictRow.id as number
    typeForm.name = dictRow.name as string
    typeForm.type = dictRow.type as string
    typeForm.status = dictRow.status as number
    typeForm.remark = (dictRow.remark as string) || ''
  } else {
    isEditType.value = false
    currentTypeId.value = null
    typeForm.name = ''
    typeForm.type = ''
    typeForm.status = 1
    typeForm.remark = ''
  }
  typeDialogVisible.value = true
}

const handleSubmitType = async (): Promise<void> => {
  const valid = await typeFormRef.value?.validate().catch(() => false)
  if (!valid) return

  typeSubmitLoading.value = true
  try {
    if (isEditType.value) {
      if (currentTypeId.value == null) throw new Error('Invalid ID')
      await dictApi.updateType(currentTypeId.value, { ...typeForm })
      ElMessage.success(t('common.updateSuccess'))
    } else {
      await dictApi.createType({ ...typeForm })
      ElMessage.success(t('common.createSuccess'))
    }
    typeDialogVisible.value = false
    fetchTypes()
  } catch (err: unknown) {
    const axiosErr = err as { response?: { data?: { message?: string } } }
    ElMessage.error(axiosErr.response?.data?.message || getErrorMessage(err))
  } finally {
    typeSubmitLoading.value = false
  }
}

const handleDeleteType = (row: Record<string, unknown>): void => {
  const typeRow = row as DictType
  ElMessageBox.confirm(`${t('dict.deleteConfirm')}「${typeRow.name}」${t('dict.deleteDataWarning')}`, t('common.confirm'), {
    type: 'warning',
    confirmButtonText: t('common.delete'),
    cancelButtonText: t('common.cancel'),
  })
    .then(async () => {
      try {
        await dictApi.deleteType(typeRow.id)
        ElMessage.success(t('messages.deleteSuccess'))
        fetchTypes()
      } catch (err: unknown) {
        ElMessage.error(t('messages.deleteFailed') + ': ' + (getErrorMessage(err) || t('common.unknownError')))
      }
    })
    .catch(() => {
      // 用户取消删除
    })
}

// ==================== 字典数据 ====================
const dataDialogVisible = ref(false)
const currentTypeName = ref('')
const currentDictType = ref('')

const dataItems = ref<DictData[]>([])
const dataLoading = ref(false)
const dataPagination = reactive({ pageNum: 1, pageSize: 10, total: 0 })
const dataSearchParams = reactive({ keyword: '' })

const openDataDialog = (row: Record<string, unknown>): void => {
  const dictRow = row as Record<string, unknown>
  currentTypeName.value = dictRow.name as string
  currentDictType.value = dictRow.type as string
  dataPagination.pageNum = 1
  dataSearchParams.keyword = ''
  dataDialogVisible.value = true
  fetchDataItems()
}

const onDataSearch = (): void => {
  dataPagination.pageNum = 1
  fetchDataItems()
}

const fetchDataItems = async (): Promise<void> => {
  dataLoading.value = true
  try {
    const res = await dictApi.getDataList({
      page: dataPagination.pageNum,
      pageSize: dataPagination.pageSize,
      dictType: currentDictType.value,
      keyword: dataSearchParams.keyword || undefined,
    })
    dataItems.value = res.data.rows
    dataPagination.total = res.data.total
  } catch (err: unknown) {
    ElMessage.error(t('dict.fetchDataFailed') + ': ' + getErrorMessage(err))
  } finally {
    dataLoading.value = false
  }
}

// 数据项编辑
const dataItemDialogVisible = ref(false)
const isEditData = ref(false)
const dataSubmitLoading = ref(false)
const dataFormRef = ref<InstanceType<typeof ProForm> | null>(null)
const currentDataId = ref<number | null>(null)

interface DataForm {
  type: string
  label: string
  value: string
  sort: number
  status: number
  remark: string
}

const dataForm = reactive<DataForm>({
  type: '',
  label: '',
  value: '',
  sort: 0,
  status: 1,
  remark: '',
})

const dataFormSchema = computed(() => [
  { prop: 'label', label: t('dict.dictLabel'), type: 'input', placeholder: t('dict.inputDictName'), required: true },
  { prop: 'value', label: t('dict.dictValue'), type: 'input', placeholder: t('dict.inputDictType'), required: true },
  { prop: 'sort', label: t('dict.sort'), type: 'number', props: { min: 0, max: 999 } },
  {
    prop: 'status',
    label: t('common.status'),
    type: 'switch',
    props: { activeText: t('dict.enabled'), inactiveText: t('dict.disabled') },
    activeValue: 1,
    inactiveValue: 0,
  },
  { prop: 'remark', label: t('dict.remark'), type: 'textarea', placeholder: t('dict.inputRemark'), props: { rows: 2 } },
])

const openDataItemDialog = (row?: Record<string, unknown>): void => {
  if (row) {
    const itemRow = row as Record<string, unknown>
    isEditData.value = true
    currentDataId.value = itemRow.id as number
    dataForm.label = itemRow.label as string
    dataForm.value = itemRow.value as string
    dataForm.sort = itemRow.sort as number
    dataForm.status = itemRow.status as number
    dataForm.remark = (itemRow.remark as string) || ''
  } else {
    isEditData.value = false
    currentDataId.value = null
    dataForm.label = ''
    dataForm.value = ''
    dataForm.sort = 0
    dataForm.status = 1
    dataForm.remark = ''
  }
  dataItemDialogVisible.value = true
}

const handleSubmitData = async (): Promise<void> => {
  const valid = await dataFormRef.value?.validate().catch(() => false)
  if (!valid) return

  dataSubmitLoading.value = true
  try {
    const payload = {
      dictType: currentDictType.value,
      label: dataForm.label,
      value: dataForm.value,
      sort: dataForm.sort,
      status: dataForm.status,
      remark: dataForm.remark,
    }
    if (isEditData.value) {
      if (currentDataId.value == null) throw new Error('Invalid ID')
      await dictApi.updateData(currentDataId.value, payload)
      ElMessage.success(t('common.updateSuccess'))
    } else {
      await dictApi.createData(payload)
      ElMessage.success(t('common.createSuccess'))
    }
    dataItemDialogVisible.value = false
    fetchDataItems()
  } catch (err: unknown) {
    const axiosErr = err as { response?: { data?: { message?: string } } }
    ElMessage.error(axiosErr.response?.data?.message || getErrorMessage(err))
  } finally {
    dataSubmitLoading.value = false
  }
}

const handleDeleteData = (row: Record<string, unknown>): void => {
  const dataRow = row as DictData
  ElMessageBox.confirm(`${t('common.confirmDelete')}「${dataRow.label}」？`, t('common.confirm'), {
    type: 'warning',
    confirmButtonText: t('common.delete'),
    cancelButtonText: t('common.cancel'),
  })
    .then(async () => {
      try {
        await dictApi.deleteData(dataRow.id)
        ElMessage.success(t('messages.deleteSuccess'))
        fetchDataItems()
      } catch (err: unknown) {
        ElMessage.error(t('messages.deleteFailed') + ': ' + (getErrorMessage(err) || t('common.unknownError')))
      }
    })
    .catch(() => {
      // 用户取消删除
    })
}

const refreshCacheLoading = ref(false)

const handleRefreshCache = async (): Promise<void> => {
  refreshCacheLoading.value = true
  try {
    await dictApi.refreshCache()
    ElMessage.success(t('common.updateSuccess'))
    fetchTypes()
  } catch (err: unknown) {
    const axiosErr = err as { response?: { data?: { message?: string } } }
    ElMessage.error(axiosErr.response?.data?.message || getErrorMessage(err))
  } finally {
    refreshCacheLoading.value = false
  }
}

onMounted(() => {
  fetchTypes()
})
</script>
<style scoped>
.dict-data-toolbar {
  display: flex;
  justify-content: space-between;
}
.dict-data-pagination {
  margin-top: 1rem;
}
</style>
