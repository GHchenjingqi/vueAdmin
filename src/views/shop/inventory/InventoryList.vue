<template>
  <div class="page-container">
    <ProTable
      :key="locale"
      :title="t('shop.inventory.title')"
      :columns="columns"
      :data="inventories"
      :loading="loading"
      :show-pagination="true"
      :pagination="pagination"
      :search-params="searchParams"
      :search-fields="searchFields"
      @query="onQuery"
    >
      <template #header-buttons>
        <el-button type="primary" :icon="Plus" @click="openAdjustDialog()">
          {{ t('shop.inventory.adjust') }}
        </el-button>
        <el-button :icon="Tickets" @click="openLogDialog()">
          {{ t('shop.inventory.log') }}
        </el-button>
      </template>

      <template #column-skuId="{ row }">
        <span class="sku-code">{{ skuCode(row.skuId) }}</span>
      </template>

      <template #column-warehouseId="{ row }">
        {{ warehouseName(row.warehouseId) }}
      </template>

      <template #column-available="{ row }">
        <span :class="['available-cell', row.available <= 0 ? 'is-danger' : '']">{{ row.available }}</span>
      </template>

      <template #column-actions="{ row }">
        <div class="table-actions">
          <el-button type="warning" link size="small" :icon="Edit" @click="openAdjustDialog(row)">
            {{ t('shop.inventory.adjust') }}
          </el-button>
        </div>
      </template>
    </ProTable>

    <!-- 库存调整 -->
    <el-dialog v-model="adjustVisible" :title="t('shop.inventory.adjustTitle')" width="480px" :close-on-click-modal="false" destroy-on-close>
      <el-form ref="adjustFormRef" :model="adjustForm" :rules="adjustRules" label-width="110px">
        <el-form-item :label="t('shop.inventory.skuId')" prop="skuId">
          <el-select
            v-model="adjustForm.skuId"
            :placeholder="t('shop.inventory.skuId')"
            filterable
            remote
            :remote-method="searchSku"
            :loading="skuLoading"
            style="width: 100%"
          >
            <el-option v-for="s in skuOptions" :key="s.id" :label="`${s.code} (#${s.id})`" :value="s.id" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('shop.inventory.warehouse')" prop="warehouseId">
          <el-select v-model="adjustForm.warehouseId" :placeholder="t('shop.inventory.warehouse')" style="width: 100%">
            <el-option v-for="w in warehouseOptions" :key="w.id" :label="w.name" :value="w.id" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('shop.inventory.delta')" prop="delta">
          <el-input-number v-model="adjustForm.delta" :step="1" style="width: 100%" />
          <div class="form-tip">{{ t('shop.inventory.deltaPlaceholder') }}</div>
        </el-form-item>
        <el-form-item :label="t('shop.inventory.reason')">
          <el-input v-model="adjustForm.reason" :placeholder="t('shop.inventory.reasonPlaceholder')" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="adjustVisible = false">
          {{ t('common.cancel') }}
        </el-button>
        <el-button type="primary" :loading="submitLoading" @click="handleAdjust">
          {{ t('common.confirm') }}
        </el-button>
      </template>
    </el-dialog>

    <!-- 库存流水 -->
    <el-dialog v-model="logVisible" :title="t('shop.inventory.logTitle')" width="720px" :close-on-click-modal="false" destroy-on-close>
      <el-table v-loading="logLoading" :data="logs" border stripe max-height="420">
        <el-table-column prop="id" :label="t('common.id')" width="70" />
        <el-table-column prop="skuId" :label="t('shop.inventory.skuId')" width="100" />
        <el-table-column prop="warehouseId" :label="t('shop.inventory.warehouse')" min-width="140">
          <template #default="{ row }">{{ warehouseName(row.warehouseId) }}</template>
        </el-table-column>
        <el-table-column prop="type" :label="t('shop.inventory.logType')" width="100">
          <template #default="{ row }">
            <el-tag size="small" :type="logTypeTag(row.type)" disable-transitions>{{ logTypeLabel(row.type) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="delta" :label="t('shop.inventory.delta')" width="100" />
        <el-table-column prop="reason" :label="t('shop.inventory.reason')" min-width="160" show-overflow-tooltip />
        <el-table-column prop="createdAt" :label="t('common.createdTime')" width="175" />
      </el-table>
      <template #footer>
        <el-button @click="logVisible = false">
          {{ t('common.close') }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ElMessage } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { Plus, Edit, Tickets } from '@element-plus/icons-vue'
import { inventoryApi, skuApi, warehouseApi, type Inventory, type InventoryLog, type WarehouseOption } from '@/api/shop'
import { getErrorMessage } from '@/utils/error'
import ProTable from '@/components/ProTable/index.vue'
import { useI18n } from '@/i18n'

const { t, locale } = useI18n()

const skuOptions = ref<{ id: number; code: string }[]>([])
const skuLoading = ref(false)
const warehouseOptions = ref<WarehouseOption[]>([])
/** SKU 编码缓存：列表里只展示 skuId，需要映射出可读编码 */
const skuCodeMap = ref<Record<number, string>>({})

const skuCode = (skuId: number): string => skuCodeMap.value[skuId] ?? `#${skuId}`

const warehouseName = (warehouseId: number): string => warehouseOptions.value.find((w) => w.id === warehouseId)?.name ?? String(warehouseId)

const logTypeLabel = (type: string): string => {
  const map: Record<string, string> = {
    in: t('shop.inventory.typeIn'),
    out: t('shop.inventory.typeOut'),
    lock: t('shop.inventory.typeLock'),
    unlock: t('shop.inventory.typeUnlock'),
  }
  return map[type] ?? type
}

const logTypeTag = (type: string): 'success' | 'danger' | 'warning' | 'info' => {
  const map: Record<string, 'success' | 'danger' | 'warning' | 'info'> = {
    in: 'success',
    out: 'danger',
    lock: 'warning',
    unlock: 'info',
  }
  return map[type] ?? 'info'
}

const columns = computed(() => [
  { prop: 'id', label: t('common.id'), width: 70 },
  { prop: 'skuId', label: t('shop.inventory.skuId'), minWidth: 160 },
  { prop: 'warehouseId', label: t('shop.inventory.warehouse'), minWidth: 140 },
  { prop: 'quantity', label: t('shop.inventory.quantity'), width: 100 },
  { prop: 'locked', label: t('shop.inventory.locked'), width: 100 },
  { prop: 'available', label: t('shop.inventory.available'), width: 100 },
  { prop: 'actions', label: t('common.operation'), width: 120, fixed: 'right' },
])

const inventories = ref<Inventory[]>([])
const loading = ref(false)
const pagination = reactive({ pageNum: 1, pageSize: 10, total: 0 })
const searchParams = reactive({ keyword: '' })
const searchFields = computed(() => [{ prop: 'keyword', label: t('common.keyword'), type: 'input', placeholder: t('shop.inventory.skuId') }])

const fetchList = async (): Promise<void> => {
  loading.value = true
  try {
    const res = await inventoryApi.list({
      page: pagination.pageNum,
      pageSize: pagination.pageSize,
      skuId: searchParams.keyword ? Number(searchParams.keyword) || undefined : undefined,
    })
    inventories.value = res.data.list
    pagination.total = res.data.total
  } catch (err: unknown) {
    ElMessage.error(t('shop.inventory.fetchFailed') + ': ' + getErrorMessage(err))
  } finally {
    loading.value = false
  }
}

const onQuery = ({ pagination: p, searchParams: s }: { pagination: Record<string, number>; searchParams?: Record<string, unknown> }): void => {
  Object.assign(pagination, p)
  if (s) Object.assign(searchParams, s)
  fetchList()
}

// ==================== SKU / 仓库选项 ====================
const searchSku = async (keyword: string): Promise<void> => {
  skuLoading.value = true
  try {
    const res = await skuApi.list({ keyword: keyword || undefined, pageSize: 50 })
    skuOptions.value = res.data.list.map((s) => ({ id: s.id, code: s.code }))
    res.data.list.forEach((s) => {
      skuCodeMap.value[s.id] = s.code
    })
  } catch {
    skuOptions.value = []
  } finally {
    skuLoading.value = false
  }
}

const loadWarehouseOptions = async (): Promise<void> => {
  try {
    const res = await warehouseApi.options()
    warehouseOptions.value = res.data
  } catch {
    warehouseOptions.value = []
  }
}

// ==================== 库存调整 ====================
const adjustVisible = ref(false)
const submitLoading = ref(false)
const adjustFormRef = ref<FormInstance | null>(null)

const adjustForm = reactive<{ skuId: number | undefined; warehouseId: number | undefined; delta: number; reason: string }>({
  skuId: undefined,
  warehouseId: undefined,
  delta: 1,
  reason: '',
})

const adjustRules = computed<FormRules>(() => ({
  skuId: [{ required: true, message: t('shop.inventory.skuId'), trigger: 'change' }],
  warehouseId: [{ required: true, message: t('shop.inventory.warehouse'), trigger: 'change' }],
  delta: [{ required: true, message: t('shop.inventory.deltaPlaceholder'), trigger: 'blur' }],
}))

const openAdjustDialog = (row?: Record<string, unknown>): void => {
  if (row) {
    adjustForm.skuId = row.skuId as number
    adjustForm.warehouseId = row.warehouseId as number
  } else {
    adjustForm.skuId = undefined
    adjustForm.warehouseId = undefined
  }
  adjustForm.delta = 1
  adjustForm.reason = ''
  adjustVisible.value = true
}

const handleAdjust = async (): Promise<void> => {
  const valid = await adjustFormRef.value?.validate().catch(() => false)
  if (!valid || adjustForm.skuId == null || adjustForm.warehouseId == null) return
  if (adjustForm.delta === 0) {
    ElMessage.warning(t('shop.inventory.deltaPlaceholder'))
    return
  }

  submitLoading.value = true
  try {
    await inventoryApi.adjust({
      skuId: adjustForm.skuId,
      warehouseId: adjustForm.warehouseId,
      delta: adjustForm.delta,
      reason: adjustForm.reason.trim() || undefined,
    })
    ElMessage.success(t('common.operationSuccess'))
    adjustVisible.value = false
    fetchList()
  } catch (err: unknown) {
    ElMessage.error(getErrorMessage(err))
  } finally {
    submitLoading.value = false
  }
}

// ==================== 库存流水 ====================
const logVisible = ref(false)
const logLoading = ref(false)
const logs = ref<InventoryLog[]>([])

const openLogDialog = async (): Promise<void> => {
  logVisible.value = true
  logLoading.value = true
  try {
    const res = await inventoryApi.logs({ pageSize: 50 })
    logs.value = res.data.list
  } catch (err: unknown) {
    ElMessage.error(getErrorMessage(err))
  } finally {
    logLoading.value = false
  }
}

onMounted(() => {
  searchSku('')
  loadWarehouseOptions()
  fetchList()
})
</script>

<style lang="scss" scoped>
.sku-code {
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-size: 13px;
}

.available-cell {
  font-weight: 600;

  &.is-danger {
    color: var(--el-color-danger);
  }
}

.form-tip {
  margin-top: 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
