<template>
  <div class="page-container">
    <el-card shadow="never" class="filter-card">
      <el-form :inline="true">
        <el-form-item :label="t('shop.bundles.active')">
          <el-select v-model="query.active" clearable style="width: 130px" :placeholder="t('common.all')">
            <el-option :label="t('common.yes')" value="true" />
            <el-option :label="t('common.no')" value="false" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="loading" @click="handleSearch">{{ t('common.search') }}</el-button>
          <el-button type="success" @click="openCreate">{{ t('shop.bundles.create') }}</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never">
      <el-table v-loading="loading" :data="rows" border stripe>
        <el-table-column prop="id" :label="t('common.id')" width="80" />
        <el-table-column :label="t('shop.bundles.name')" min-width="180">
          <template #default="{ row }">{{ (row as BundleItem).name?.['en-US'] || Object.values((row as BundleItem).name ?? {})[0] || '-' }}</template>
        </el-table-column>
        <el-table-column prop="currency" :label="t('shop.bundles.currency')" width="90" />
        <el-table-column :label="t('shop.bundles.discount')" min-width="150">
          <template #default="{ row }">
            {{ (row as BundleItem).discountType === 'percent' ? `${(row as BundleItem).discountValue}%` : (row as BundleItem).discountValue }}
          </template>
        </el-table-column>
        <el-table-column :label="t('shop.bundles.components')" min-width="180">
          <template #default="{ row }">{{ formatComponents((row as BundleItem).components) }}</template>
        </el-table-column>
        <el-table-column :label="t('shop.bundles.active')" width="100">
          <template #default="{ row }">
            <el-tag :type="(row as BundleItem).active ? 'success' : 'info'" size="small" disable-transitions>
              {{ (row as BundleItem).active ? t('common.yes') : t('common.no') }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('shop.bundles.period')" min-width="190">
          <template #default="{ row }">{{ (row as BundleItem).startAt }} ~ {{ (row as BundleItem).endAt }}</template>
        </el-table-column>
        <el-table-column :label="t('common.operation')" width="140" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link @click="openEdit(row as BundleItem)">{{ t('common.edit') }}</el-button>
            <el-button type="danger" link @click="handleDelete(row as BundleItem)">{{ t('common.delete') }}</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-pagination
        v-model:current-page="pagination.page"
        v-model:page-size="pagination.pageSize"
        class="pager"
        layout="total, prev, pager, next"
        :total="pagination.total"
        @current-change="load"
      />
    </el-card>

    <el-dialog v-model="dialogVisible" :title="editingId ? t('shop.bundles.edit') : t('shop.bundles.create')" width="640px" destroy-on-close>
      <el-form :model="form" label-width="150px">
        <el-form-item :label="t('shop.bundles.name')" required>
          <el-input v-model="form.name" :placeholder="t('shop.bundles.namePlaceholder')" />
        </el-form-item>
        <el-form-item :label="t('shop.bundles.currency')">
          <el-input v-model="form.currency" maxlength="3" style="width: 120px" />
        </el-form-item>
        <el-form-item :label="t('shop.bundles.components')" required>
          <el-input v-model="form.components" :placeholder="t('shop.bundles.componentsPlaceholder')" />
        </el-form-item>
        <el-form-item :label="t('shop.bundles.discountType')">
          <el-select v-model="form.discountType" style="width: 160px">
            <el-option :label="t('shop.bundles.discountFixed')" value="fixed" />
            <el-option :label="t('shop.bundles.discountPercent')" value="percent" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('shop.bundles.discountValue')">
          <el-input-number v-model="form.discountValue" :min="0" :precision="2" />
        </el-form-item>
        <el-form-item :label="t('shop.bundles.startAt')">
          <el-date-picker v-model="form.startAt" type="date" value-format="YYYY-MM-DD" style="width: 180px" />
        </el-form-item>
        <el-form-item :label="t('shop.bundles.endAt')">
          <el-date-picker v-model="form.endAt" type="date" value-format="YYYY-MM-DD" style="width: 180px" />
        </el-form-item>
        <el-form-item :label="t('shop.bundles.placement')">
          <el-input v-model="form.placement" maxlength="50" />
        </el-form-item>
        <el-form-item :label="t('shop.bundles.active')">
          <el-switch v-model="form.active" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="submitting" @click="handleSave">{{ t('common.confirm') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { shopBundleApi, type BundleItem, type BundleComponent, type BundlePayload } from '@/api/shopBundle'
import { getErrorMessage } from '@/utils/error'
import { useI18n } from '@/i18n'

const { t } = useI18n()

const rows = ref<BundleItem[]>([])
const loading = ref(false)
const submitting = ref(false)
const dialogVisible = ref(false)
const editingId = ref<number | null>(null)
const query = reactive<{ active: '' | 'true' | 'false' }>({ active: '' })
const pagination = reactive({ page: 1, pageSize: 20, total: 0 })
const form = reactive({
  name: '',
  currency: 'USD',
  components: '',
  discountType: 'fixed' as 'fixed' | 'percent',
  discountValue: 0,
  startAt: '',
  endAt: '',
  placement: '',
  active: true,
})

const formatComponents = (components: BundleComponent[]): string => (components ?? []).map((c) => `${c.skuId}×${c.qty}`).join(', ')

const parseComponents = (text: string): BundleComponent[] =>
  text
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [sku, qty] = part.split(/[×:x*]/)
      return { skuId: Number(sku), qty: Number(qty) }
    })
    .filter((c) => Number.isInteger(c.skuId) && c.skuId > 0 && Number.isInteger(c.qty) && c.qty > 0)

const load = async (): Promise<void> => {
  loading.value = true
  try {
    const res = await shopBundleApi.list({
      page: pagination.page,
      pageSize: pagination.pageSize,
      active: query.active === '' ? undefined : query.active === 'true',
    })
    rows.value = res.data.list
    pagination.total = res.data.total
  } catch (err: unknown) {
    ElMessage.error(t('shop.bundles.loadFailed') + ': ' + getErrorMessage(err))
  } finally {
    loading.value = false
  }
}

const handleSearch = (): void => {
  pagination.page = 1
  load()
}

const resetForm = (): void => {
  form.name = ''
  form.currency = 'USD'
  form.components = ''
  form.discountType = 'fixed'
  form.discountValue = 0
  form.startAt = ''
  form.endAt = ''
  form.placement = ''
  form.active = true
}

const openCreate = (): void => {
  editingId.value = null
  resetForm()
  dialogVisible.value = true
}

const openEdit = (row: BundleItem): void => {
  editingId.value = row.id
  form.name = row.name?.['en-US'] || Object.values(row.name ?? {})[0] || ''
  form.currency = row.currency
  form.components = (row.components ?? []).map((c) => `${c.skuId}:${c.qty}`).join(',')
  form.discountType = row.discountType
  form.discountValue = Number(row.discountValue)
  form.startAt = row.startAt?.slice(0, 10) ?? ''
  form.endAt = row.endAt?.slice(0, 10) ?? ''
  form.placement = row.placement ?? ''
  form.active = row.active
  dialogVisible.value = true
}

const buildPayload = (): BundlePayload => ({
  name: { 'en-US': form.name.trim() },
  currency: form.currency.trim().toUpperCase(),
  components: parseComponents(form.components),
  discountType: form.discountType,
  discountValue: form.discountValue,
  active: form.active,
  startAt: form.startAt,
  endAt: form.endAt,
  placement: form.placement.trim() || null,
})

const handleSave = async (): Promise<void> => {
  const payload = buildPayload()
  if (!form.name.trim() || !payload.components.length || !payload.startAt || !payload.endAt) {
    ElMessage.warning(t('shop.bundles.required'))
    return
  }
  submitting.value = true
  try {
    if (editingId.value) await shopBundleApi.update(editingId.value, payload)
    else await shopBundleApi.create(payload)
    ElMessage.success(t('shop.bundles.saveSuccess'))
    dialogVisible.value = false
    await load()
  } catch (err: unknown) {
    ElMessage.error(t('shop.bundles.loadFailed') + ': ' + getErrorMessage(err))
  } finally {
    submitting.value = false
  }
}

const handleDelete = async (row: BundleItem): Promise<void> => {
  try {
    await ElMessageBox.confirm(t('shop.bundles.deleteConfirm'), t('common.tip'), { type: 'warning' })
  } catch {
    return
  }
  try {
    await shopBundleApi.remove(row.id)
    ElMessage.success(t('common.operationSuccess'))
    await load()
  } catch (err: unknown) {
    ElMessage.error(t('shop.bundles.loadFailed') + ': ' + getErrorMessage(err))
  }
}

onMounted(load)
</script>

<style scoped lang="scss">
.filter-card {
  margin-bottom: 16px;
}

.pager {
  margin-top: 16px;
  justify-content: flex-end;
}
</style>
