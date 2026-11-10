<template>
  <div class="page-container">
    <ProTable
      :key="locale"
      :title="t('shop.marketing.couponTitle')"
      :columns="columns"
      :data="coupons"
      :loading="loading"
      :show-pagination="true"
      :pagination="pagination"
      :search-params="searchParams"
      :search-fields="searchFields"
      @query="onQuery"
    >
      <template #header-buttons>
        <el-button type="primary" :icon="Plus" @click="openDialog()">
          {{ t('shop.marketing.addCoupon') }}
        </el-button>
      </template>

      <template #column-code="{ row }">
        <el-tag size="small" disable-transitions>{{ row.code }}</el-tag>
      </template>

      <template #column-type="{ row }">{{ row.type === 'percent' ? '%' : row.currency }} {{ Number(row.value).toFixed(2) }}</template>

      <template #column-validPeriod="{ row }">{{ row.validFrom }} ~ {{ row.validTo }}</template>

      <template #column-usedCount="{ row }">{{ row.usedCount }} / {{ row.usageLimit || '∞' }}</template>

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
      :title="isEdit ? t('shop.marketing.editCoupon') : t('shop.marketing.addCoupon')"
      width="480px"
      :close-on-click-modal="false"
      destroy-on-close
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="110px">
        <el-form-item :label="t('shop.marketing.code')" prop="code">
          <el-input v-model="form.code" maxlength="50" :placeholder="t('shop.marketing.codePlaceholder')" />
        </el-form-item>
        <el-form-item :label="t('shop.marketing.type')" prop="type">
          <el-select v-model="form.type" style="width: 100%">
            <el-option :label="t('shop.marketing.value') + ' (fixed)'" value="fixed" />
            <el-option :label="t('shop.marketing.value') + ' (percent)'" value="percent" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('shop.marketing.value')" prop="value">
          <el-input-number v-model="form.value" :min="0" :precision="2" style="width: 100%" />
        </el-form-item>
        <el-form-item :label="t('shop.order.currency')" prop="currency">
          <el-input v-model="form.currency" maxlength="3" style="width: 120px" />
        </el-form-item>
        <el-form-item :label="t('shop.marketing.validFrom')" prop="validFrom">
          <el-date-picker v-model="form.validFrom" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
        <el-form-item :label="t('shop.marketing.validTo')" prop="validTo">
          <el-date-picker v-model="form.validTo" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
        <el-form-item :label="t('shop.marketing.totalCount')">
          <el-input-number v-model="form.usageLimit" :min="0" :precision="0" style="width: 100%" />
          <div class="form-tip">{{ t('shop.marketing.totalCountPlaceholder') }}</div>
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
// 既有文件依赖 Vue 自动导入，显式补全以通过 eslint / vue-tsc（提交钩子会全文件扫描）
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { Plus, Edit, Delete } from '@element-plus/icons-vue'
import { marketingApi, type Coupon } from '@/api/shop'
import { getErrorMessage } from '@/utils/error'
import ProTable from '@/components/ProTable/index.vue'
import { useI18n } from '@/i18n'

const { t, locale } = useI18n()

const columns = computed(() => [
  { prop: 'id', label: t('common.id'), width: 70 },
  { prop: 'code', label: t('shop.marketing.code'), minWidth: 150 },
  { prop: 'type', label: t('shop.marketing.value'), width: 140 },
  { prop: 'validPeriod', label: t('common.operation'), minWidth: 190 },
  { prop: 'usedCount', label: t('shop.marketing.usedCount'), width: 120 },
  { prop: 'usageLimit', label: t('shop.marketing.usageLimit'), width: 110 },
  { prop: 'createdAt', label: t('common.createdTime'), width: 175 },
  { prop: 'actions', label: t('common.operation'), width: 160, fixed: 'right' },
])

const coupons = ref<Coupon[]>([])
const loading = ref(false)
const pagination = reactive({ pageNum: 1, pageSize: 10, total: 0 })
const searchParams = reactive({ keyword: '' })
const searchFields = computed(() => [{ prop: 'keyword', label: t('common.keyword'), type: 'input', placeholder: t('shop.marketing.code') }])

const fetchList = async (): Promise<void> => {
  loading.value = true
  try {
    const res = await marketingApi.listCoupons({
      page: pagination.pageNum,
      pageSize: pagination.pageSize,
    })
    coupons.value = res.data.list
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

const form = reactive<{ code: string; type: 'fixed' | 'percent'; value: number; currency: string; validFrom: string; validTo: string; usageLimit: number }>({
  code: '',
  type: 'fixed',
  value: 5,
  currency: 'USD',
  validFrom: '',
  validTo: '',
  usageLimit: 0,
})

const rules = computed<FormRules>(() => ({
  code: [{ required: true, message: t('shop.marketing.codePlaceholder'), trigger: 'blur' }],
  type: [{ required: true, message: t('shop.marketing.type'), trigger: 'change' }],
  value: [{ required: true, message: t('shop.marketing.valuePlaceholder'), trigger: 'blur' }],
  currency: [{ required: true, message: t('shop.order.currency'), trigger: 'blur' }],
  validFrom: [{ required: true, message: t('shop.marketing.validFrom'), trigger: 'change' }],
  validTo: [{ required: true, message: t('shop.marketing.validTo'), trigger: 'change' }],
}))

const openDialog = (row?: Record<string, unknown>): void => {
  if (row) {
    isEdit.value = true
    currentId.value = row.id as number
    form.code = row.code as string
    form.type = (row.type as 'fixed' | 'percent') || 'fixed'
    form.value = Number(row.value ?? 0)
    form.currency = (row.currency as string) || 'USD'
    form.validFrom = String(row.validFrom ?? '').slice(0, 10)
    form.validTo = String(row.validTo ?? '').slice(0, 10)
    form.usageLimit = Number(row.usageLimit ?? 0)
  } else {
    isEdit.value = false
    currentId.value = null
    form.code = ''
    form.type = 'fixed'
    form.value = 5
    form.currency = 'USD'
    form.validFrom = ''
    form.validTo = ''
    form.usageLimit = 0
  }
  dialogVisible.value = true
}

const handleSubmit = async (): Promise<void> => {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  submitLoading.value = true
  try {
    const payload = {
      code: form.code.trim(),
      type: form.type,
      value: form.value,
      currency: form.currency.trim().toUpperCase(),
      validFrom: form.validFrom,
      validTo: form.validTo,
      usageLimit: form.usageLimit > 0 ? form.usageLimit : 0,
    }
    if (isEdit.value && currentId.value != null) {
      await marketingApi.updateCoupon(currentId.value, payload)
      ElMessage.success(t('common.updateSuccess'))
    } else {
      await marketingApi.createCoupon(payload)
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
  ElMessageBox.confirm(`${t('shop.marketing.deleteConfirm')}「${row.code}」`, t('common.confirm'), {
    type: 'warning',
    confirmButtonText: t('common.delete'),
    cancelButtonText: t('common.cancel'),
  })
    .then(async () => {
      try {
        await marketingApi.removeCoupon(row.id as number)
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
