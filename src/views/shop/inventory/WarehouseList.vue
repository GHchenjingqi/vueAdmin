<template>
  <div class="page-container">
    <ProTable
      :key="locale"
      :title="t('shop.warehouse.title')"
      :columns="columns"
      :data="warehouses"
      :loading="loading"
      :show-pagination="true"
      :pagination="pagination"
      :search-params="searchParams"
      :search-fields="searchFields"
      @query="onQuery"
    >
      <template #header-buttons>
        <el-button type="primary" :icon="Plus" @click="openDialog()">
          {{ t('shop.warehouse.add') }}
        </el-button>
      </template>

      <template #column-type="{ row }">
        <el-tag size="small" disable-transitions>{{ warehouseTypeLabel(row.type) }}</el-tag>
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
      :title="isEdit ? t('shop.warehouse.edit') : t('shop.warehouse.add')"
      width="480px"
      :close-on-click-modal="false"
      destroy-on-close
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="110px">
        <el-form-item :label="t('shop.warehouse.name')" prop="name">
          <el-input v-model="form.name" maxlength="100" :placeholder="t('shop.warehouse.namePlaceholder')" />
        </el-form-item>
        <el-form-item :label="t('shop.warehouse.type')" prop="type">
          <el-select v-model="form.type" style="width: 100%">
            <el-option v-for="opt in warehouseTypeOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('shop.warehouse.country')" prop="country">
          <el-input v-model="form.country" maxlength="2" :placeholder="t('shop.warehouse.countryPlaceholder')" />
        </el-form-item>
        <el-form-item :label="t('shop.warehouse.address')">
          <el-input v-model="form.address" type="textarea" :rows="2" :placeholder="t('shop.warehouse.addressPlaceholder')" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">
          {{ t('common.cancel') }}
        </el-button>
        <el-button type="primary" :loading="submitLoading" @click="handleSubmit">
          {{ t('common.confirm') }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import type { FormInstance, FormRules } from 'element-plus'
import { Plus, Edit, Delete } from '@element-plus/icons-vue'
import { warehouseApi, type Warehouse, type WarehouseType } from '@/api/shop'
import { getErrorMessage } from '@/utils/error'
import ProTable from '@/components/ProTable/index.vue'
import { useI18n } from '@/i18n'

const { t, locale } = useI18n()

const warehouseTypeOptions = computed(() => [
  { value: 'bonded' as WarehouseType, label: t('shop.warehouse.typeBonded') },
  { value: 'overseas' as WarehouseType, label: t('shop.warehouse.typeOverseas') },
  { value: 'direct' as WarehouseType, label: t('shop.warehouse.typeDirect') },
])

const warehouseTypeLabel = (type: string): string => warehouseTypeOptions.value.find((o) => o.value === type)?.label ?? type

const columns = computed(() => [
  { prop: 'id', label: t('common.id'), width: 70 },
  { prop: 'name', label: t('shop.warehouse.name'), minWidth: 160 },
  { prop: 'type', label: t('shop.warehouse.colType'), width: 120 },
  { prop: 'country', label: t('shop.warehouse.country'), width: 100 },
  { prop: 'address', label: t('shop.warehouse.address'), minWidth: 200, showOverflowTooltip: true },
  { prop: 'createdAt', label: t('common.createdTime'), width: 175 },
  { prop: 'actions', label: t('common.operation'), width: 160, fixed: 'right' },
])

const warehouses = ref<Warehouse[]>([])
const loading = ref(false)
const pagination = reactive({ pageNum: 1, pageSize: 10, total: 0 })
const searchParams = reactive({ keyword: '' })
const searchFields = computed(() => [{ prop: 'keyword', label: t('common.keyword'), type: 'input', placeholder: t('shop.warehouse.searchPlaceholder') }])

const fetchList = async (): Promise<void> => {
  loading.value = true
  try {
    const res = await warehouseApi.list({
      page: pagination.pageNum,
      pageSize: pagination.pageSize,
    })
    warehouses.value = res.data.list
    pagination.total = res.data.total
  } catch (err: unknown) {
    ElMessage.error(t('shop.warehouse.fetchFailed') + ': ' + getErrorMessage(err))
  } finally {
    loading.value = false
  }
}

const onQuery = ({ pagination: p, searchParams: s }: { pagination: Record<string, number>; searchParams?: Record<string, unknown> }): void => {
  Object.assign(pagination, p)
  if (s) Object.assign(searchParams, s)
  fetchList()
}

// ==================== 弹窗 ====================
const dialogVisible = ref(false)
const isEdit = ref(false)
const submitLoading = ref(false)
const formRef = ref<FormInstance | null>(null)
const currentId = ref<number | null>(null)

const form = reactive<{ name: string; type: WarehouseType; country: string; address: string }>({
  name: '',
  type: 'bonded',
  country: 'CN',
  address: '',
})

const rules = computed<FormRules>(() => ({
  name: [{ required: true, message: t('shop.warehouse.namePlaceholder'), trigger: 'blur' }],
  type: [{ required: true, message: t('shop.warehouse.type'), trigger: 'change' }],
  country: [{ required: true, message: t('shop.warehouse.countryPlaceholder'), trigger: 'blur' }],
}))

const openDialog = (row?: Record<string, unknown>): void => {
  if (row) {
    isEdit.value = true
    currentId.value = row.id as number
    form.name = row.name as string
    form.type = (row.type as WarehouseType) || 'bonded'
    form.country = (row.country as string) || 'CN'
    form.address = (row.address as string) || ''
  } else {
    isEdit.value = false
    currentId.value = null
    form.name = ''
    form.type = 'bonded'
    form.country = 'CN'
    form.address = ''
  }
  dialogVisible.value = true
}

const handleSubmit = async (): Promise<void> => {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  submitLoading.value = true
  try {
    const payload = {
      name: form.name.trim(),
      type: form.type,
      country: form.country.trim().toUpperCase(),
      address: form.address.trim() || null,
    }
    if (isEdit.value && currentId.value != null) {
      await warehouseApi.update(currentId.value, payload)
      ElMessage.success(t('common.updateSuccess'))
    } else {
      await warehouseApi.create(payload)
      ElMessage.success(t('common.createSuccess'))
    }
    dialogVisible.value = false
    fetchList()
  } catch (err: unknown) {
    ElMessage.error(getErrorMessage(err))
  } finally {
    submitLoading.value = false
  }
}

const handleDelete = (row: Record<string, unknown>): void => {
  ElMessageBox.confirm(`${t('shop.warehouse.deleteConfirm')}「${row.name}」`, t('common.confirm'), {
    type: 'warning',
    confirmButtonText: t('common.delete'),
    cancelButtonText: t('common.cancel'),
  })
    .then(async () => {
      try {
        await warehouseApi.remove(row.id as number)
        ElMessage.success(t('messages.deleteSuccess'))
        fetchList()
      } catch (err: unknown) {
        ElMessage.error(getErrorMessage(err))
      }
    })
    .catch(() => {
      // 用户取消
    })
}

onMounted(fetchList)
</script>
