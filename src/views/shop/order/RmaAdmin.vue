<template>
  <div class="page-container">
    <ProTable
      :key="locale"
      :title="t('shop.rma.title')"
      :columns="columns"
      :data="rows"
      :loading="loading"
      :show-pagination="true"
      :pagination="pagination"
      :search-params="searchParams"
      :search-fields="searchFields"
      @query="onQuery"
    >
      <template #column-status="{ row }">
        <el-tag :type="statusTag((row as RmaItem).status)" size="small" disable-transitions>{{ statusLabel((row as RmaItem).status) }}</el-tag>
      </template>

      <template #column-refund="{ row }">
        <span v-if="(row as RmaItem).refundAmountCents != null">
          {{ (row as RmaItem).refundCurrency }} {{ (Number((row as RmaItem).refundAmountCents) / 100).toFixed(2) }}
        </span>
        <span v-else>-</span>
      </template>

      <template #column-actions="{ row }">
        <div class="table-actions">
          <el-button type="info" link size="small" :icon="View" @click="openDetail(row as RmaItem)">
            {{ t('shop.rma.detail') }}
          </el-button>
          <el-button v-if="(row as RmaItem).status === 'pending'" type="success" link size="small" @click="handleApprove(row as RmaItem)">
            {{ t('shop.rma.approve') }}
          </el-button>
          <el-button v-if="(row as RmaItem).status === 'pending'" type="danger" link size="small" @click="openReject(row as RmaItem)">
            {{ t('shop.rma.reject') }}
          </el-button>
          <!-- PLAN 4.2：批准即退款（支持部分退）与转换货，避免客服在两个界面各操作一次 -->
          <el-button
            v-if="(row as RmaItem).status === 'pending' || (row as RmaItem).status === 'approved' || (row as RmaItem).status === 'returned'"
            type="primary"
            link
            size="small"
            @click="openRefund(row as RmaItem)"
          >
            {{ t('shop.rma.refundAction') }}
          </el-button>
          <el-button v-if="(row as RmaItem).status === 'pending'" type="warning" link size="small" @click="handleExchange(row as RmaItem)">
            {{ t('shop.rma.exchange') }}
          </el-button>
        </div>
      </template>
    </ProTable>

    <!-- 详情 -->
    <el-dialog v-model="detailVisible" :title="t('shop.rma.detail')" width="720px" :close-on-click-modal="false" destroy-on-close>
      <el-descriptions v-if="current" :column="2" border>
        <el-descriptions-item :label="t('shop.rma.id')">{{ current.id }}</el-descriptions-item>
        <el-descriptions-item :label="t('shop.rma.orderId')">{{ current.orderId }}</el-descriptions-item>
        <el-descriptions-item :label="t('shop.rma.email')">{{ current.email }}</el-descriptions-item>
        <el-descriptions-item :label="t('shop.rma.status')">
          <el-tag :type="statusTag(current.status)" size="small" disable-transitions>{{ statusLabel(current.status) }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item :label="t('shop.rma.refund')">
          <span v-if="current.refundAmountCents != null">{{ current.refundCurrency }} {{ (Number(current.refundAmountCents) / 100).toFixed(2) }}</span>
          <span v-else>-</span>
        </el-descriptions-item>
        <el-descriptions-item :label="t('shop.rma.trackingNo')">{{ current.trackingNo || '-' }}</el-descriptions-item>
        <el-descriptions-item :label="t('shop.rma.reason')" :span="2">{{ current.reason || '-' }}</el-descriptions-item>
        <el-descriptions-item :label="t('shop.rma.rejectReason')" :span="2">{{ current.rejectReason || '-' }}</el-descriptions-item>
      </el-descriptions>

      <div class="detail-section-title">{{ t('shop.rma.items') }}</div>
      <el-table :data="current?.items ?? []" border stripe max-height="240">
        <el-table-column prop="skuId" label="SKU ID" min-width="120" />
        <el-table-column prop="orderItemId" label="Order Item" min-width="120" />
        <el-table-column prop="qty" :label="t('shop.rma.itemQty')" width="90" />
      </el-table>

      <template #footer>
        <el-button @click="detailVisible = false">
          {{ t('common.close') }}
        </el-button>
        <el-button v-if="current?.status === 'pending'" type="success" :loading="submitLoading" @click="handleApprove(current!)">
          {{ t('shop.rma.approve') }}
        </el-button>
        <el-button v-if="current?.status === 'pending'" type="danger" :loading="submitLoading" @click="openReject(current!)">
          {{ t('shop.rma.reject') }}
        </el-button>
      </template>
    </el-dialog>

    <!-- 驳回 -->
    <el-dialog v-model="rejectVisible" :title="t('shop.rma.rejectTitle')" width="460px" :close-on-click-modal="false" destroy-on-close>
      <el-form ref="rejectFormRef" :model="rejectForm" label-width="90px">
        <el-form-item :label="t('shop.rma.rejectReason')" required>
          <el-input v-model="rejectForm.rejectReason" type="textarea" :rows="3" :placeholder="t('shop.rma.rejectReasonPlaceholder')" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="rejectVisible = false">
          {{ t('common.cancel') }}
        </el-button>
        <el-button type="danger" :loading="submitLoading" @click="handleReject">
          {{ t('common.confirm') }}
        </el-button>
      </template>
    </el-dialog>

    <!-- 批准并退款（PLAN 4.2）：金额默认取 RMA 审批额度，可改为部分退 -->
    <el-dialog v-model="refundVisible" :title="t('shop.rma.refundTitle')" width="460px" :close-on-click-modal="false" destroy-on-close>
      <el-form label-width="110px">
        <el-form-item :label="t('shop.rma.refundAmount')">
          <el-input-number v-model="refundForm.amount" :min="0" :precision="2" :controls="false" style="width: 180px" />
          <div class="form-tip">{{ t('shop.rma.refundAmountTip') }}</div>
        </el-form-item>
        <el-form-item :label="t('shop.rma.refundReason')">
          <el-input v-model="refundForm.reason" type="textarea" :rows="2" maxlength="200" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="refundVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="submitLoading" @click="handleRefund">{{ t('common.confirm') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { View } from '@element-plus/icons-vue'
import { shopRmaApi, type RmaItem, type RmaStatus } from '@/api/shopRma'
import { getErrorMessage } from '@/utils/error'
import ProTable from '@/components/ProTable/index.vue'
import { useI18n } from '@/i18n'

const { t, locale } = useI18n()

const statusLabel = (status: RmaStatus): string => {
  const map: Record<RmaStatus, string> = {
    pending: t('shop.rma.statusPending'),
    approved: t('shop.rma.statusApproved'),
    rejected: t('shop.rma.statusRejected'),
    returned: t('shop.rma.statusReturned'),
    refunded: t('shop.rma.statusRefunded'),
    exchange: t('shop.rma.statusExchange'),
    cancelled: t('shop.rma.statusCancelled'),
  }
  return map[status] ?? status
}

const statusTag = (status: RmaStatus): 'success' | 'warning' | 'info' | 'danger' | 'primary' => {
  const map: Record<RmaStatus, 'success' | 'warning' | 'info' | 'danger' | 'primary'> = {
    pending: 'warning',
    approved: 'primary',
    rejected: 'danger',
    returned: 'success',
    refunded: 'success',
    exchange: 'warning',
    cancelled: 'info',
  }
  return map[status] ?? 'info'
}

const columns = computed(() => [
  { prop: 'id', label: t('shop.rma.id'), width: 70 },
  { prop: 'orderId', label: t('shop.rma.orderId'), minWidth: 120 },
  { prop: 'email', label: t('shop.rma.email'), minWidth: 180 },
  { prop: 'status', label: t('shop.rma.status'), width: 110 },
  { prop: 'refund', label: t('shop.rma.refund'), width: 150 },
  { prop: 'createdAt', label: t('common.createdTime'), width: 175 },
  { prop: 'actions', label: t('common.operation'), width: 220, fixed: 'right' },
])

const rows = ref<RmaItem[]>([])
const loading = ref(false)
const pagination = reactive({ pageNum: 1, pageSize: 10, total: 0 })
const searchParams = reactive({ status: '' as RmaStatus | '', orderId: '' as string | number })

const rmaStatusOptions: RmaStatus[] = ['pending', 'approved', 'rejected', 'returned', 'refunded', 'cancelled']
const searchFields = computed(() => [
  {
    prop: 'status',
    label: t('shop.rma.status'),
    type: 'select',
    placeholder: t('common.all'),
    options: rmaStatusOptions.map((s) => ({ label: statusLabel(s), value: s })),
  },
  { prop: 'orderId', label: t('shop.rma.orderId'), type: 'input', placeholder: t('shop.rma.orderIdPlaceholder') },
])

const fetchList = async (): Promise<void> => {
  loading.value = true
  try {
    const res = await shopRmaApi.list({
      status: searchParams.status || undefined,
      orderId: searchParams.orderId ? Number(searchParams.orderId) : undefined,
      limit: pagination.pageSize,
      offset: (pagination.pageNum - 1) * pagination.pageSize,
    })
    rows.value = res.data.rows
    pagination.total = res.data.total
  } catch (err: unknown) {
    ElMessage.error(t('shop.rma.fetchFailed') + ': ' + getErrorMessage(err))
  } finally {
    loading.value = false
  }
}

const onQuery = ({ pagination: p, searchParams: s }: { pagination: Record<string, number>; searchParams?: Record<string, unknown> }): void => {
  Object.assign(pagination, p)
  if (s) Object.assign(searchParams, s)
  fetchList()
}

// ==================== 详情 ====================
const detailVisible = ref(false)
const current = ref<RmaItem | null>(null)

const openDetail = (row: RmaItem): void => {
  current.value = row
  detailVisible.value = true
}

// ==================== 审核通过 / 驳回 ====================
const submitLoading = ref(false)
const rejectVisible = ref(false)
const rejectForm = reactive({ rejectReason: '' })
const targetId = ref<number | null>(null)

const handleApprove = async (row: RmaItem): Promise<void> => {
  submitLoading.value = true
  try {
    await shopRmaApi.approve(row.id)
    ElMessage.success(t('common.operationSuccess'))
    detailVisible.value = false
    fetchList()
  } catch (err: unknown) {
    ElMessage.error(getErrorMessage(err))
  } finally {
    submitLoading.value = false
  }
}

const openReject = (row: RmaItem): void => {
  targetId.value = row.id
  rejectForm.rejectReason = ''
  rejectVisible.value = true
}

const handleReject = async (): Promise<void> => {
  if (targetId.value == null) return
  if (!rejectForm.rejectReason.trim()) {
    ElMessage.warning(t('shop.rma.rejectReasonRequired'))
    return
  }
  submitLoading.value = true
  try {
    await shopRmaApi.reject(targetId.value, rejectForm.rejectReason.trim())
    ElMessage.success(t('common.operationSuccess'))
    rejectVisible.value = false
    detailVisible.value = false
    fetchList()
  } catch (err: unknown) {
    ElMessage.error(getErrorMessage(err))
  } finally {
    submitLoading.value = false
  }
}

// ==================== 批准退款 / 换货（PLAN 4.2） ====================
const refundVisible = ref(false)
const refundForm = reactive({ amount: 0, reason: '' })

const openRefund = (row: RmaItem): void => {
  targetId.value = row.id
  // 默认带出 RMA 上的审批额度（分 → 元展示），客服可改成部分退
  refundForm.amount = row.refundAmountCents ? Number(row.refundAmountCents) / 100 : 0
  refundForm.reason = ''
  refundVisible.value = true
}

const handleRefund = async (): Promise<void> => {
  if (targetId.value == null) return
  // 前端只做"必须大于 0"的提示；上限与已退额度由后端 refundService 校验
  if (!(refundForm.amount > 0)) {
    ElMessage.warning(t('shop.rma.refundAmountRequired'))
    return
  }
  submitLoading.value = true
  try {
    await shopRmaApi.approveWithRefund(targetId.value, {
      amountCents: Math.round(refundForm.amount * 100),
      reason: refundForm.reason.trim() || undefined,
    })
    ElMessage.success(t('common.operationSuccess'))
    refundVisible.value = false
    detailVisible.value = false
    fetchList()
  } catch (err: unknown) {
    ElMessage.error(getErrorMessage(err))
  } finally {
    submitLoading.value = false
  }
}

const handleExchange = async (row: RmaItem): Promise<void> => {
  submitLoading.value = true
  try {
    await shopRmaApi.approveAsExchange(row.id)
    ElMessage.success(t('common.operationSuccess'))
    fetchList()
  } catch (err: unknown) {
    ElMessage.error(getErrorMessage(err))
  } finally {
    submitLoading.value = false
  }
}

onMounted(fetchList)
</script>
