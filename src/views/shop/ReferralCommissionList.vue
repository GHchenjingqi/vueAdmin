<template>
  <div class="page-container">
    <ProTable
      :key="locale"
      :title="t('shop.referralCommission.title')"
      :columns="columns"
      :data="list"
      :loading="loading"
      :show-pagination="true"
      :pagination="pagination"
      :search-params="searchParams"
      :search-fields="searchFields"
      @query="onQuery"
    >
      <template #column-commissionCents="{ row }">
        {{ formatCents(row.commissionCents, row.orderCurrency) }}
      </template>
      <template #column-orderNetAmountCents="{ row }">
        {{ formatCents(row.orderNetAmountCents, row.orderCurrency) }}
      </template>
      <template #column-status="{ row }">
        <el-tag :type="statusType(row.status)" size="small" disable-transitions>
          {{ statusLabel(row.status) }}
        </el-tag>
      </template>
      <template #column-actions="{ row }">
        <div class="table-actions">
          <template v-if="row.status === 'pending'">
            <el-button type="success" link size="small" :icon="Check" @click="handleSettle(row as ReferralCommission)">
              {{ t('shop.referralCommission.settle') }}
            </el-button>
            <el-button type="info" link size="small" :icon="Close" @click="handleVoid(row as ReferralCommission)">
              {{ t('shop.referralCommission.void') }}
            </el-button>
          </template>
          <span v-else class="done-text">{{ t('shop.referralCommission.done') }}</span>
        </div>
      </template>
    </ProTable>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import { Check, Close } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { referralCommissionApi, type ReferralCommission, type ReferralCommissionStatus } from '@/api/referralCommission'
import { getErrorMessage } from '@/utils/error'
import ProTable from '@/components/ProTable/index.vue'
import { useI18n } from '@/i18n'

const { t, locale } = useI18n()

const list = ref<ReferralCommission[]>([])
const loading = ref(false)
const pagination = reactive({ pageNum: 1, pageSize: 10, total: 0 })
const searchParams = reactive<{ status?: ReferralCommissionStatus }>({})
const searchFields = computed(() => [
  {
    prop: 'status',
    label: t('shop.referralCommission.status'),
    type: 'select',
    options: [
      { label: t('shop.referralCommission.statusPending'), value: 'pending' },
      { label: t('shop.referralCommission.statusSettled'), value: 'settled' },
      { label: t('shop.referralCommission.statusVoid'), value: 'void' },
    ],
  },
])

const columns = computed(() => [
  { prop: 'id', label: t('common.id'), width: 70 },
  { prop: 'code', label: t('shop.referralCommission.code'), minWidth: 140 },
  { prop: 'referrerCustomerId', label: t('shop.referralCommission.referrer'), width: 140 },
  { prop: 'orderId', label: t('shop.referralCommission.orderId'), width: 110 },
  { prop: 'orderNetAmountCents', label: t('shop.referralCommission.baseAmount'), width: 150 },
  { prop: 'commissionRatePercent', label: t('shop.referralCommission.rate'), width: 100 },
  { prop: 'commissionCents', label: t('shop.referralCommission.commission'), width: 150 },
  { prop: 'status', label: t('common.status'), width: 110 },
  { prop: 'createdAt', label: t('common.createdTime'), width: 175 },
  { prop: 'actions', label: t('common.operation'), width: 160, fixed: 'right' },
])

const formatCents = (cents: number, currency: string): string => `${currency} ${(Number(cents) / 100).toFixed(2)}`

const statusType = (s: ReferralCommissionStatus): 'warning' | 'success' | 'info' => (s === 'pending' ? 'warning' : s === 'settled' ? 'success' : 'info')

const statusLabel = (s: ReferralCommissionStatus): string =>
  s === 'pending'
    ? t('shop.referralCommission.statusPending')
    : s === 'settled'
      ? t('shop.referralCommission.statusSettled')
      : t('shop.referralCommission.statusVoid')

const fetchList = async (): Promise<void> => {
  loading.value = true
  try {
    const res = await referralCommissionApi.list({
      page: pagination.pageNum,
      pageSize: pagination.pageSize,
      status: searchParams.status,
    })
    list.value = res.data.list
    pagination.total = res.data.total
  } catch (err: unknown) {
    ElMessage.error(t('shop.referralCommission.fetchFailed') + ': ' + getErrorMessage(err))
  } finally {
    loading.value = false
  }
}

const onQuery = ({ pagination: p, searchParams: s }: { pagination: Record<string, number>; searchParams?: Record<string, unknown> }): void => {
  Object.assign(pagination, p)
  if (s) Object.assign(searchParams, s)
  fetchList()
}

const handleSettle = (row: ReferralCommission): void => changeStatus(row, 'settled')
const handleVoid = (row: ReferralCommission): void => changeStatus(row, 'void')

const changeStatus = (row: ReferralCommission, status: ReferralCommissionStatus): void => {
  const label = status === 'settled' ? t('shop.referralCommission.settle') : t('shop.referralCommission.void')
  ElMessageBox.confirm(`${label} #${row.id} (${row.code})`, t('common.confirm'), {
    type: 'warning',
    confirmButtonText: label,
    cancelButtonText: t('common.cancel'),
  })
    .then(async () => {
      try {
        await referralCommissionApi.settle(row.id, status)
        ElMessage.success(t('common.success'))
        fetchList()
      } catch (err: unknown) {
        ElMessage.error(getErrorMessage(err))
      }
    })
    .catch(() => {
      // 取消
    })
}

onMounted(fetchList)
</script>

<style lang="scss" scoped>
.page-container {
  padding: 16px;
}
.table-actions {
  display: flex;
  gap: 4px;
  align-items: center;
}
.done-text {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
