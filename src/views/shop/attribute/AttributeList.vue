<template>
  <div class="page-container">
    <ProTable
      :key="locale"
      :title="t('shop.attribute.title')"
      :columns="columns"
      :data="attributes"
      :loading="loading"
      :show-pagination="true"
      :pagination="pagination"
      :search-params="searchParams"
      :search-fields="searchFields"
      @query="onQuery"
    >
      <template #header-buttons>
        <el-button type="primary" :icon="Plus" @click="openDialog()">
          {{ t('shop.attribute.add') }}
        </el-button>
      </template>

      <template #column-type="{ row }">
        <el-tag :type="row.type === 'select' ? 'warning' : 'info'" size="small">
          {{ row.type === 'select' ? t('shop.attribute.typeSelect') : t('shop.attribute.typeText') }}
        </el-tag>
      </template>

      <template #column-options="{ row }">
        <template v-if="row.options && row.options.length">
          <el-tag v-for="opt in row.options" :key="opt" size="small" class="option-tag">{{ opt }}</el-tag>
        </template>
        <span v-else>-</span>
      </template>

      <template #column-required="{ row }">
        <el-tag :type="row.required === 1 ? 'danger' : 'info'" size="small">
          {{ row.required === 1 ? t('common.yes') : t('common.no') }}
        </el-tag>
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
      :title="isEdit ? t('shop.attribute.edit') : t('shop.attribute.add')"
      width="520px"
      :close-on-click-modal="false"
      destroy-on-close
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="110px">
        <el-form-item :label="t('shop.attribute.name')" prop="name">
          <el-input v-model="form.name" maxlength="100" :placeholder="t('shop.attribute.namePlaceholder')" />
        </el-form-item>
        <el-form-item :label="t('shop.attribute.type')">
          <el-radio-group v-model="form.type">
            <el-radio value="text">{{ t('shop.attribute.typeText') }}</el-radio>
            <el-radio value="select">{{ t('shop.attribute.typeSelect') }}</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="form.type === 'select'" :label="t('shop.attribute.options')" prop="options">
          <el-select
            v-model="form.options"
            multiple
            filterable
            allow-create
            default-first-option
            :placeholder="t('shop.attribute.optionsPlaceholder')"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item :label="t('shop.attribute.category')">
          <el-select v-model="form.categoryId" clearable :placeholder="t('shop.attribute.categoryPlaceholder')" style="width: 100%">
            <el-option v-for="opt in categoryOptions" :key="opt.id" :label="opt.name" :value="opt.id" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('shop.attribute.required')">
          <el-switch v-model="form.required" :active-value="1" :inactive-value="0" />
        </el-form-item>
        <el-form-item :label="t('shop.attribute.sort')">
          <el-input-number v-model="form.sort" :min="0" />
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
import { attributeApi, categoryApi, type Attribute, type CategoryOption } from '@/api/shop'
import { getErrorMessage } from '@/utils/error'
import ProTable from '@/components/ProTable/index.vue'
import { useI18n } from '@/i18n'

const { t, locale } = useI18n()

const columns = computed(() => [
  { prop: 'id', label: t('common.id'), width: 70 },
  { prop: 'name', label: t('shop.attribute.name'), minWidth: 140 },
  { prop: 'type', label: t('shop.attribute.type'), width: 90, align: 'center' },
  { prop: 'options', label: t('shop.attribute.options'), minWidth: 200 },
  { prop: 'required', label: t('shop.attribute.required'), width: 80, align: 'center' },
  { prop: 'sort', label: t('shop.attribute.sort'), width: 70, align: 'center' },
  { prop: 'actions', label: t('common.operation'), width: 160, fixed: 'right' },
])

const attributes = ref<Attribute[]>([])
const loading = ref(false)
const pagination = reactive({ pageNum: 1, pageSize: 10, total: 0 })
const searchParams = reactive({ keyword: '' })
const searchFields = computed(() => [{ prop: 'keyword', label: t('common.keyword'), type: 'input', placeholder: t('shop.attribute.searchPlaceholder') }])

const categoryOptions = ref<CategoryOption[]>([])

const fetchList = async (): Promise<void> => {
  loading.value = true
  try {
    const res = await attributeApi.list({
      page: pagination.pageNum,
      pageSize: pagination.pageSize,
      keyword: searchParams.keyword || undefined,
    })
    attributes.value = res.data.list
    pagination.total = res.data.total
  } catch (err: unknown) {
    ElMessage.error(t('shop.attribute.fetchFailed') + ': ' + getErrorMessage(err))
  } finally {
    loading.value = false
  }
}

const fetchCategoryOptions = async (): Promise<void> => {
  try {
    const res = await categoryApi.options()
    categoryOptions.value = res.data
  } catch {
    // 选项加载失败不阻塞主列表
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

const form = reactive({
  name: '',
  type: 'text' as 'text' | 'select',
  options: [] as string[],
  categoryId: null as number | null,
  required: 0,
  sort: 0,
})

const rules = computed<FormRules>(() => ({
  name: [{ required: true, message: t('shop.attribute.namePlaceholder'), trigger: 'blur' }],
  options: [
    {
      validator: (_rule: unknown, value: string[], callback: (err?: Error) => void) => {
        if (form.type === 'select' && (!value || value.length === 0)) callback(new Error(t('shop.attribute.optionsRequired')))
        else callback()
      },
      trigger: 'change',
    },
  ],
}))

const openDialog = (row?: Record<string, unknown>): void => {
  if (row) {
    isEdit.value = true
    currentId.value = row.id as number
    form.name = row.name as string
    form.type = row.type as 'text' | 'select'
    form.options = (row.options as string[]) || []
    form.categoryId = (row.categoryId as number) || null
    form.required = row.required as number
    form.sort = row.sort as number
  } else {
    isEdit.value = false
    currentId.value = null
    form.name = ''
    form.type = 'text'
    form.options = []
    form.categoryId = null
    form.required = 0
    form.sort = 0
  }
  dialogVisible.value = true
}

const handleSubmit = async (): Promise<void> => {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  const payload = {
    name: form.name.trim(),
    type: form.type,
    options: form.type === 'select' ? form.options : null,
    categoryId: form.categoryId,
    required: form.required,
    sort: form.sort,
  }

  submitLoading.value = true
  try {
    if (isEdit.value && currentId.value != null) {
      await attributeApi.update(currentId.value, payload)
      ElMessage.success(t('common.updateSuccess'))
    } else {
      await attributeApi.create(payload)
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
  ElMessageBox.confirm(`${t('shop.attribute.deleteConfirm')}「${row.name}」`, t('common.confirm'), {
    type: 'warning',
    confirmButtonText: t('common.delete'),
    cancelButtonText: t('common.cancel'),
  })
    .then(async () => {
      try {
        await attributeApi.remove(row.id as number)
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

onMounted(() => {
  fetchList()
  fetchCategoryOptions()
})
</script>

<style lang="scss" scoped>
.option-tag {
  margin-right: 4px;
}
</style>
