<template>
  <div class="page-container">
    <ProTable
      :key="locale"
      :title="t('shop.marketing.promotionTitle')"
      :columns="columns"
      :data="promotions"
      :loading="loading"
      :show-pagination="true"
      :pagination="pagination"
      :search-params="searchParams"
      :search-fields="searchFields"
      @query="onQuery"
    >
      <template #header-buttons>
        <el-button type="primary" :icon="Plus" @click="openDialog()">
          {{ t('shop.marketing.addPromotion') }}
        </el-button>
      </template>

      <template #column-name="{ row }">
        {{ localizedName(row.name) }}
      </template>

      <template #column-type="{ row }">
        <el-tag size="small" disable-transitions>{{ typeLabel(row.type) }}</el-tag>
      </template>

      <template #column-scope="{ row }">
        <el-tag size="small" type="info" disable-transitions>{{ scopeLabel(row.scope) }}</el-tag>
      </template>

      <template #column-period="{ row }">{{ row.startAt }} ~ {{ row.endAt }}</template>

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
      :title="isEdit ? t('shop.marketing.editPromotion') : t('shop.marketing.addPromotion')"
      width="520px"
      :close-on-click-modal="false"
      destroy-on-close
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="110px">
        <el-form-item :label="t('shop.marketing.nameZh')" prop="nameZh">
          <el-input v-model="form.nameZh" maxlength="100" :placeholder="t('shop.marketing.nameZhPlaceholder')" />
        </el-form-item>
        <el-form-item :label="t('shop.marketing.nameEn')">
          <el-input v-model="form.nameEn" maxlength="100" :placeholder="t('shop.marketing.nameEnPlaceholder')" />
        </el-form-item>
        <el-form-item :label="t('shop.marketing.type')" prop="type">
          <el-select v-model="form.type" style="width: 100%">
            <el-option :label="t('shop.marketing.typeDiscount')" value="discount" />
            <el-option :label="t('shop.marketing.typeFullReduce')" value="full_reduce" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('shop.marketing.scope')" prop="scope">
          <el-select v-model="form.scope" style="width: 100%">
            <el-option :label="t('shop.marketing.scopeAll')" value="all" />
            <el-option :label="t('shop.marketing.scopeSku')" value="sku" />
            <el-option :label="t('shop.marketing.scopeSpu')" value="spu" />
            <el-option :label="t('shop.marketing.scopeCategory')" value="category" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('shop.marketing.rule')" prop="rate">
          <el-input-number v-model="form.rate" :min="0" :max="1" :step="0.05" :precision="2" style="width: 100%" />
          <div class="form-tip">{{ t('shop.marketing.ratePlaceholder') }}</div>
        </el-form-item>
        <el-form-item :label="t('shop.marketing.startAt')" prop="startAt">
          <el-date-picker v-model="form.startAt" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
        <el-form-item :label="t('shop.marketing.endAt')" prop="endAt">
          <el-date-picker v-model="form.endAt" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
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
import { marketingApi, type I18nText, type Promotion, type PromotionScope, type PromotionType } from '@/api/shop'
import { getErrorMessage } from '@/utils/error'
import ProTable from '@/components/ProTable/index.vue'
import { useI18n } from '@/i18n'

const { t, locale } = useI18n()

const localizedName = (name: I18nText | null | undefined): string => {
  if (!name) return '-'
  return name[locale.value] || name['zh-CN'] || name['en-US'] || Object.values(name)[0] || '-'
}

const typeLabel = (type: string): string => (type === 'full_reduce' ? t('shop.marketing.typeFullReduce') : t('shop.marketing.typeDiscount'))

const scopeLabel = (scope: string): string => {
  const map: Record<string, string> = {
    sku: t('shop.marketing.scopeSku'),
    spu: t('shop.marketing.scopeSpu'),
    category: t('shop.marketing.scopeCategory'),
    all: t('shop.marketing.scopeAll'),
  }
  return map[scope] ?? scope
}

const columns = computed(() => [
  { prop: 'id', label: t('common.id'), width: 70 },
  { prop: 'name', label: t('shop.marketing.name'), minWidth: 180 },
  { prop: 'type', label: t('shop.marketing.type'), width: 110 },
  { prop: 'scope', label: t('shop.marketing.scope'), width: 120 },
  { prop: 'period', label: t('common.operation'), minWidth: 190 },
  { prop: 'actions', label: t('common.operation'), width: 160, fixed: 'right' },
])

const promotions = ref<Promotion[]>([])
const loading = ref(false)
const pagination = reactive({ pageNum: 1, pageSize: 10, total: 0 })
const searchParams = reactive({ keyword: '' })
const searchFields = computed(() => [{ prop: 'keyword', label: t('common.keyword'), type: 'input', placeholder: t('shop.marketing.name') }])

const fetchList = async (): Promise<void> => {
  loading.value = true
  try {
    const res = await marketingApi.listPromotions({
      page: pagination.pageNum,
      pageSize: pagination.pageSize,
    })
    promotions.value = res.data.list
    pagination.total = res.data.total
  } catch (err: unknown) {
    ElMessage.error(t('shop.marketing.fetchFailed') + ': ' + getErrorMessage(err))
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

const form = reactive<{ nameZh: string; nameEn: string; type: PromotionType; scope: PromotionScope; rate: number; startAt: string; endAt: string }>({
  nameZh: '',
  nameEn: '',
  type: 'discount',
  scope: 'all',
  rate: 0.8,
  startAt: '',
  endAt: '',
})

const rules = computed<FormRules>(() => ({
  nameZh: [{ required: true, message: t('shop.marketing.nameZhPlaceholder'), trigger: 'blur' }],
  type: [{ required: true, message: t('shop.marketing.type'), trigger: 'change' }],
  scope: [{ required: true, message: t('shop.marketing.scope'), trigger: 'change' }],
  rate: [{ required: true, message: t('shop.marketing.ratePlaceholder'), trigger: 'blur' }],
  startAt: [{ required: true, message: t('shop.marketing.startAt'), trigger: 'change' }],
  endAt: [{ required: true, message: t('shop.marketing.endAt'), trigger: 'change' }],
}))

const openDialog = (row?: Record<string, unknown>): void => {
  if (row) {
    isEdit.value = true
    currentId.value = row.id as number
    const name = (row.name as I18nText) ?? {}
    form.nameZh = name['zh-CN'] ?? ''
    form.nameEn = name['en-US'] ?? ''
    form.type = (row.type as PromotionType) || 'discount'
    form.scope = (row.scope as PromotionScope) || 'all'
    const rule = (row.rule as Record<string, unknown>) ?? {}
    form.rate = typeof rule.rate === 'number' ? rule.rate : 0.8
    form.startAt = String(row.startAt ?? '').slice(0, 10)
    form.endAt = String(row.endAt ?? '').slice(0, 10)
  } else {
    isEdit.value = false
    currentId.value = null
    form.nameZh = ''
    form.nameEn = ''
    form.type = 'discount'
    form.scope = 'all'
    form.rate = 0.8
    form.startAt = ''
    form.endAt = ''
  }
  dialogVisible.value = true
}

const handleSubmit = async (): Promise<void> => {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  submitLoading.value = true
  try {
    const payload = {
      name: { 'zh-CN': form.nameZh.trim(), 'en-US': form.nameEn.trim() || form.nameZh.trim() },
      type: form.type,
      scope: form.scope,
      rule: { rate: form.rate },
      startAt: form.startAt,
      endAt: form.endAt,
    }
    if (isEdit.value && currentId.value != null) {
      await marketingApi.updatePromotion(currentId.value, payload)
      ElMessage.success(t('common.updateSuccess'))
    } else {
      await marketingApi.createPromotion(payload)
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
  ElMessageBox.confirm(`${t('shop.marketing.deleteConfirm')}「${localizedName(row.name as I18nText)}」`, t('common.confirm'), {
    type: 'warning',
    confirmButtonText: t('common.delete'),
    cancelButtonText: t('common.cancel'),
  })
    .then(async () => {
      try {
        await marketingApi.removePromotion(row.id as number)
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
.form-tip {
  margin-top: 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
