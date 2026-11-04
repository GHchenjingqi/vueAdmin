<template>
  <div class="page-container">
    <ProTable
      :key="locale"
      :title="t('shop.brand.title')"
      :columns="columns"
      :data="brands"
      :loading="loading"
      :show-pagination="true"
      :pagination="pagination"
      :search-params="searchParams"
      :search-fields="searchFields"
      @query="onQuery"
    >
      <template #header-buttons>
        <el-button type="primary" :icon="Plus" @click="openDialog()">
          {{ t('shop.brand.add') }}
        </el-button>
      </template>

      <template #column-logo="{ row }">
        <el-image v-if="row.logo" :src="row.logo" :preview-src-list="[row.logo]" fit="cover" preview-teleported class="brand-logo" />
        <span v-else>-</span>
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
      :title="isEdit ? t('shop.brand.edit') : t('shop.brand.add')"
      width="480px"
      :close-on-click-modal="false"
      destroy-on-close
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-form-item :label="t('shop.brand.name')" prop="name">
          <el-input v-model="form.name" maxlength="100" :placeholder="t('shop.brand.namePlaceholder')" />
        </el-form-item>
        <el-form-item :label="t('shop.brand.logo')">
          <el-input v-model="form.logo" :placeholder="t('shop.brand.logoPlaceholder')" />
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
import { ElMessage, ElMessageBox } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { Plus, Edit, Delete } from '@element-plus/icons-vue'
import { brandApi, type Brand } from '@/api/shop'
import { getErrorMessage } from '@/utils/error'
import ProTable from '@/components/ProTable/index.vue'
import { useI18n } from '@/i18n'

const { t, locale } = useI18n()

const columns = computed(() => [
  { prop: 'id', label: t('common.id'), width: 70 },
  { prop: 'logo', label: t('shop.brand.logo'), width: 90 },
  { prop: 'name', label: t('shop.brand.name'), minWidth: 160 },
  { prop: 'createdAt', label: t('common.createdTime'), width: 175 },
  { prop: 'actions', label: t('common.operation'), width: 160, fixed: 'right' },
])

const brands = ref<Brand[]>([])
const loading = ref(false)
const pagination = reactive({ pageNum: 1, pageSize: 10, total: 0 })
const searchParams = reactive({ keyword: '' })
const searchFields = computed(() => [{ prop: 'keyword', label: t('common.keyword'), type: 'input', placeholder: t('shop.brand.searchPlaceholder') }])

const fetchList = async (): Promise<void> => {
  loading.value = true
  try {
    const res = await brandApi.list({
      page: pagination.pageNum,
      pageSize: pagination.pageSize,
      keyword: searchParams.keyword || undefined,
    })
    brands.value = res.data.list
    pagination.total = res.data.total
  } catch (err: unknown) {
    ElMessage.error(t('shop.brand.fetchFailed') + ': ' + getErrorMessage(err))
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

const form = reactive({ name: '', logo: '' })

const rules = computed<FormRules>(() => ({
  name: [{ required: true, message: t('shop.brand.namePlaceholder'), trigger: 'blur' }],
}))

const openDialog = (row?: Record<string, unknown>): void => {
  if (row) {
    isEdit.value = true
    currentId.value = row.id as number
    form.name = row.name as string
    form.logo = (row.logo as string) || ''
  } else {
    isEdit.value = false
    currentId.value = null
    form.name = ''
    form.logo = ''
  }
  dialogVisible.value = true
}

const handleSubmit = async (): Promise<void> => {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  submitLoading.value = true
  try {
    if (isEdit.value && currentId.value != null) {
      await brandApi.update(currentId.value, { name: form.name.trim(), logo: form.logo.trim() || undefined })
      ElMessage.success(t('common.updateSuccess'))
    } else {
      await brandApi.create({ name: form.name.trim(), logo: form.logo.trim() || undefined })
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
  ElMessageBox.confirm(`${t('shop.brand.deleteConfirm')}「${row.name}」`, t('common.confirm'), {
    type: 'warning',
    confirmButtonText: t('common.delete'),
    cancelButtonText: t('common.cancel'),
  })
    .then(async () => {
      try {
        await brandApi.remove(row.id as number)
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

<style lang="scss" scoped>
.brand-logo {
  width: 36px;
  height: 36px;
  border-radius: 4px;
}
</style>
