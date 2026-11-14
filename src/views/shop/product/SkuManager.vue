<template>
  <div class="sku-manager">
    <div class="sku-header">
      <span class="sku-title">{{ t('shop.sku.title') }}</span>
      <el-button type="primary" size="small" :icon="Plus" :disabled="!spuId" @click="openDialog()">
        {{ t('shop.sku.add') }}
      </el-button>
    </div>

    <el-table v-loading="loading" :data="skus" border stripe>
      <el-table-column prop="code" :label="t('shop.sku.code')" min-width="120" />
      <el-table-column :label="t('shop.sku.spec')" min-width="140">
        <template #default="{ row }">
          <span v-if="row.spec">
            {{
              Object.entries(row.spec)
                .map(([k, v]) => `${k}:${v}`)
                .join(' / ')
            }}
          </span>
          <span v-else>-</span>
        </template>
      </el-table-column>
      <el-table-column prop="originCountry" :label="t('shop.sku.originCountry')" width="90" align="center" />
      <el-table-column prop="hsCode" :label="t('shop.sku.hsCode')" width="110" align="center" />
      <el-table-column prop="declaredValue" :label="t('shop.sku.declaredValue')" width="110" align="center" />
      <el-table-column :label="t('shop.price.title')" width="150">
        <template #default="{ row }">
          <div class="price-cell">
            <span v-for="p in pricesBySku[row.id] || []" :key="p.currency" class="price-item">{{ p.currency }} {{ p.amount }}</span>
            <span v-if="!(pricesBySku[row.id] || []).length">-</span>
          </div>
        </template>
      </el-table-column>
      <el-table-column prop="status" :label="t('shop.product.status')" width="90" align="center">
        <template #default="{ row }">
          <el-tag :type="statusTagType(row.status)" size="small">
            {{ t(`shop.status.${row.status}`) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column :label="t('common.operation')" width="200" fixed="right">
        <template #default="{ row }">
          <div class="table-actions">
            <el-button type="primary" link size="small" @click="openPriceDialog(row)">
              {{ t('shop.price.title') }}
            </el-button>
            <el-button type="warning" link size="small" :icon="Edit" @click="openDialog(row)">
              {{ t('common.edit') }}
            </el-button>
            <el-button type="danger" link size="small" :icon="Delete" @click="handleDelete(row)">
              {{ t('common.delete') }}
            </el-button>
          </div>
        </template>
      </el-table-column>
    </el-table>

    <!-- SKU 编辑弹窗 -->
    <el-dialog v-model="dialogVisible" :title="isEdit ? t('shop.sku.edit') : t('shop.sku.add')" width="560px" :close-on-click-modal="false" destroy-on-close>
      <el-form ref="formRef" :model="form" :rules="rules" label-width="130px">
        <el-form-item :label="t('shop.sku.code')" prop="code">
          <el-input v-model="form.code" maxlength="64" :placeholder="t('shop.sku.codePlaceholder')" />
        </el-form-item>
        <el-form-item :label="t('shop.sku.barcode')">
          <el-input v-model="form.barcode" maxlength="64" />
        </el-form-item>
        <el-form-item :label="t('shop.sku.originCountry')" prop="originCountry">
          <el-input v-model="form.originCountry" maxlength="2" :placeholder="t('shop.sku.originCountryPlaceholder')" style="width: 120px" />
        </el-form-item>
        <el-form-item :label="t('shop.sku.hsCode')" prop="hsCode">
          <el-input v-model="form.hsCode" maxlength="20" :placeholder="t('shop.sku.hsCodePlaceholder')" style="width: 200px" />
        </el-form-item>
        <el-form-item :label="t('shop.sku.declaredValue')">
          <el-input-number v-model="form.declaredValue" :min="0" :precision="2" :controls="false" style="width: 160px" />
          <div class="form-tip">{{ t('shop.sku.declaredValueTip') }}</div>
        </el-form-item>
        <!-- 采购成本：利润报表用；与报关申报价值分离，避免用报关价冒充成本 -->
        <el-form-item :label="t('shop.sku.costAmount')">
          <el-input-number v-model="form.costAmount" :min="0" :precision="2" :controls="false" style="width: 160px" />
          <div class="form-tip">{{ t('shop.sku.costAmountTip') }}</div>
        </el-form-item>
        <!-- 物流属性：运费按重/体积重计费与货代对账的前提 -->
        <el-form-item :label="t('shop.sku.weightGram')">
          <el-input-number v-model="form.weightGram" :min="0" :precision="0" :controls="false" style="width: 160px" />
          <span class="unit">g</span>
        </el-form-item>
        <el-form-item :label="t('shop.sku.dimensions')">
          <div class="dimension-row">
            <el-input-number v-model="form.lengthMm" :min="0" :precision="0" :controls="false" :placeholder="t('shop.sku.length')" style="width: 110px" />
            <span class="unit">×</span>
            <el-input-number v-model="form.widthMm" :min="0" :precision="0" :controls="false" :placeholder="t('shop.sku.width')" style="width: 110px" />
            <span class="unit">×</span>
            <el-input-number v-model="form.heightMm" :min="0" :precision="0" :controls="false" :placeholder="t('shop.sku.height')" style="width: 110px" />
            <span class="unit">mm</span>
          </div>
        </el-form-item>
        <el-form-item :label="t('shop.sku.compliance')">
          <div class="compliance-list">
            <div v-for="(item, idx) in complianceItems" :key="idx" class="compliance-item">
              <el-input v-model="item.key" :placeholder="t('shop.sku.complianceKey')" style="width: 140px" />
              <el-input v-model="item.value" :placeholder="t('shop.sku.complianceValue')" style="flex: 1" />
              <el-button type="danger" link :icon="Delete" @click="complianceItems.splice(idx, 1)" />
            </div>
            <el-button size="small" :icon="Plus" @click="complianceItems.push({ key: '', value: '' })">
              {{ t('shop.sku.addCompliance') }}
            </el-button>
          </div>
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

    <!-- 价格弹窗 -->
    <el-dialog
      v-model="priceDialogVisible"
      :title="`${t('shop.price.title')} - ${currentSku?.code || ''}`"
      width="520px"
      :close-on-click-modal="false"
      destroy-on-close
    >
      <el-table :data="prices" border size="small">
        <el-table-column prop="currency" :label="t('shop.price.currency')" width="90" align="center" />
        <el-table-column prop="amount" :label="t('shop.price.amount')" align="center" />
        <el-table-column :label="t('common.operation')" width="80" align="center">
          <template #default="{ row }">
            <el-button type="danger" link size="small" @click="handleDeletePrice(row)">
              {{ t('common.delete') }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-form inline class="price-add-form" @submit.prevent>
        <el-form-item :label="t('shop.price.currency')">
          <el-select v-model="priceForm.currency" style="width: 100px">
            <el-option v-for="c in currencies" :key="c" :label="c" :value="c" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('shop.price.amount')">
          <el-input-number v-model="priceForm.amount" :min="0" :precision="2" :controls="false" style="width: 130px" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="priceSubmitLoading" @click="handleSavePrice">
            {{ t('shop.price.save') }}
          </el-button>
        </el-form-item>
      </el-form>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import type { FormInstance, FormRules } from 'element-plus'
import { Plus, Edit, Delete } from '@element-plus/icons-vue'
import { skuApi, priceApi, type Sku, type ShopStatus, type ProductPrice } from '@/api/shop'
import { getErrorMessage } from '@/utils/error'
import { useI18n } from '@/i18n'

const props = defineProps<{
  spuId: number | null
}>()

const { t } = useI18n()

const skus = ref<Sku[]>([])
const loading = ref(false)
const pricesBySku = ref<Record<number, ProductPrice[]>>({})

const currencies = ['USD', 'CNY', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD']

type TagType = 'primary' | 'success' | 'warning' | 'info' | 'danger'

function statusTagType(status: ShopStatus): TagType {
  const map: Record<ShopStatus, TagType> = {
    draft: 'info',
    review: 'warning',
    rejected: 'danger',
    listed: 'primary',
    published: 'success',
    unlisted: 'warning',
    archived: 'info',
  }
  return map[status]
}

const fetchSkus = async (): Promise<void> => {
  if (!props.spuId) return
  loading.value = true
  try {
    const res = await skuApi.listBySpu(props.spuId)
    skus.value = res.data
    // 拉取每个 SKU 的价格
    pricesBySku.value = {}
    await Promise.all(
      skus.value.map(async (s) => {
        try {
          const pres = await priceApi.listBySku(s.id)
          pricesBySku.value[s.id] = pres.data
        } catch {
          pricesBySku.value[s.id] = []
        }
      }),
    )
  } catch (err: unknown) {
    ElMessage.error(t('shop.sku.fetchFailed') + ': ' + getErrorMessage(err))
  } finally {
    loading.value = false
  }
}

defineExpose({ fetchSkus })

// ==================== SKU 编辑弹窗 ====================
const dialogVisible = ref(false)
const isEdit = ref(false)
const submitLoading = ref(false)
const formRef = ref<FormInstance | null>(null)
const currentId = ref<number | null>(null)

const form = reactive({
  code: '',
  barcode: '',
  originCountry: '',
  hsCode: '',
  declaredValue: null as number | null,
  costAmount: null as number | null,
  weightGram: null as number | null,
  lengthMm: null as number | null,
  widthMm: null as number | null,
  heightMm: null as number | null,
})

const complianceItems = ref<Array<{ key: string; value: string }>>([])

const rules = computed<FormRules>(() => ({
  code: [{ required: true, message: t('shop.sku.codePlaceholder'), trigger: 'blur' }],
}))

const openDialog = (row?: Record<string, unknown>): void => {
  if (row) {
    isEdit.value = true
    currentId.value = row.id as number
    form.code = row.code as string
    form.barcode = (row.barcode as string) || ''
    form.originCountry = (row.originCountry as string) || ''
    form.hsCode = (row.hsCode as string) || ''
    form.declaredValue = (row.declaredValue as number) ?? null
    form.costAmount = (row.costAmount as number) ?? null
    form.weightGram = (row.weightGram as number) ?? null
    form.lengthMm = (row.lengthMm as number) ?? null
    form.widthMm = (row.widthMm as number) ?? null
    form.heightMm = (row.heightMm as number) ?? null
    const compliance = (row.compliance as Record<string, string>) || {}
    complianceItems.value = Object.entries(compliance).map(([key, value]) => ({ key, value }))
  } else {
    isEdit.value = false
    currentId.value = null
    form.code = ''
    form.barcode = ''
    form.originCountry = ''
    form.hsCode = ''
    form.declaredValue = null
    form.costAmount = null
    form.weightGram = null
    form.lengthMm = null
    form.widthMm = null
    form.heightMm = null
    complianceItems.value = []
  }
  dialogVisible.value = true
}

const handleSubmit = async (): Promise<void> => {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  const compliance: Record<string, string> = {}
  for (const item of complianceItems.value) {
    if (item.key.trim()) compliance[item.key.trim()] = item.value
  }

  submitLoading.value = true
  try {
    if (isEdit.value && currentId.value != null) {
      await skuApi.update(currentId.value, {
        code: form.code.trim(),
        barcode: form.barcode || null,
        originCountry: form.originCountry || null,
        hsCode: form.hsCode || null,
        declaredValue: form.declaredValue,
        costAmount: form.costAmount,
        weightGram: form.weightGram,
        lengthMm: form.lengthMm,
        widthMm: form.widthMm,
        heightMm: form.heightMm,
        compliance,
      })
      ElMessage.success(t('common.updateSuccess'))
    } else {
      await skuApi.create({
        spuId: props.spuId as number,
        code: form.code.trim(),
        barcode: form.barcode || null,
        originCountry: form.originCountry || null,
        hsCode: form.hsCode || null,
        declaredValue: form.declaredValue,
        costAmount: form.costAmount,
        weightGram: form.weightGram,
        lengthMm: form.lengthMm,
        widthMm: form.widthMm,
        heightMm: form.heightMm,
        compliance,
      })
      ElMessage.success(t('common.createSuccess'))
    }
    dialogVisible.value = false
    fetchSkus()
  } catch (err: unknown) {
    ElMessage.error(getErrorMessage(err))
  } finally {
    submitLoading.value = false
  }
}

const handleDelete = (row: Record<string, unknown>): void => {
  ElMessageBox.confirm(`${t('shop.sku.deleteConfirm')}「${row.code}」`, t('common.confirm'), {
    type: 'warning',
    confirmButtonText: t('common.delete'),
    cancelButtonText: t('common.cancel'),
  })
    .then(async () => {
      try {
        await skuApi.remove(row.id as number)
        ElMessage.success(t('messages.deleteSuccess'))
        fetchSkus()
      } catch (err: unknown) {
        ElMessage.error(getErrorMessage(err))
      }
    })
    .catch(() => {
      // 用户取消
    })
}

// ==================== 价格弹窗 ====================
const priceDialogVisible = ref(false)
const priceSubmitLoading = ref(false)
const currentSku = ref<Sku | null>(null)
const prices = ref<ProductPrice[]>([])
const priceForm = reactive({ currency: 'USD', amount: null as number | null })

const openPriceDialog = async (row: Record<string, unknown>): Promise<void> => {
  currentSku.value = row as unknown as Sku
  priceForm.currency = 'USD'
  priceForm.amount = null
  priceDialogVisible.value = true
  await fetchPrices()
}

const fetchPrices = async (): Promise<void> => {
  if (!currentSku.value) return
  try {
    const res = await priceApi.listBySku(currentSku.value.id)
    prices.value = res.data
  } catch {
    prices.value = []
  }
}

const handleSavePrice = async (): Promise<void> => {
  if (!currentSku.value || priceForm.amount == null) {
    ElMessage.warning(t('shop.price.amountRequired'))
    return
  }
  priceSubmitLoading.value = true
  try {
    await priceApi.upsert(currentSku.value.id, { currency: priceForm.currency, amount: priceForm.amount })
    ElMessage.success(t('common.operationSuccess'))
    await fetchPrices()
    await fetchSkus()
  } catch (err: unknown) {
    ElMessage.error(getErrorMessage(err))
  } finally {
    priceSubmitLoading.value = false
  }
}

const handleDeletePrice = async (target: Record<string, unknown>): Promise<void> => {
  const row = target as unknown as ProductPrice
  try {
    await priceApi.remove(row.skuId, row.currency)
    ElMessage.success(t('messages.deleteSuccess'))
    await fetchPrices()
    await fetchSkus()
  } catch (err: unknown) {
    ElMessage.error(getErrorMessage(err))
  }
}

onMounted(fetchSkus)
</script>

<style lang="scss" scoped>
.sku-manager {
  .sku-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;

    .sku-title {
      font-size: 14px;
      font-weight: 600;
      color: var(--el-text-color-primary);
    }
  }

  .price-cell {
    display: flex;
    flex-direction: column;

    .price-item {
      font-size: 12px;
      line-height: 1.6;
    }
  }

  .compliance-list {
    width: 100%;

    .compliance-item {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 6px;
    }
  }

  .form-tip {
    font-size: 12px;
    color: #909399;
    line-height: 1.5;
    margin-top: 2px;
  }

  .dimension-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .unit {
    font-size: 12px;
    color: #909399;
  }

  .price-add-form {
    margin-top: 16px;
  }
}
</style>
