<template>
  <div class="page-container">
    <ProTable
      :key="locale"
      :title="t('shop.order.title')"
      :columns="columns"
      :data="orders"
      :loading="loading"
      :show-pagination="true"
      :pagination="pagination"
      :search-params="searchParams"
      :search-fields="searchFields"
      @query="onQuery"
    >
      <template #header-buttons>
        <!-- 批量发货（PLAN 4.1）：跨境日出百单时避免逐单复制运单号 -->
        <el-button type="primary" :icon="Van" @click="openBatchShip">
          {{ t('shop.order.batchShip') }}
        </el-button>
      </template>

      <template #column-status="{ row }">
        <el-tag :type="statusTag(row.status)" size="small" disable-transitions>{{ statusLabel(row.status) }}</el-tag>
      </template>

      <template #column-amount="{ row }">
        <span class="amount-cell">{{ row.currency }} {{ Number(row.amount).toFixed(2) }}</span>
      </template>

      <template #column-actions="{ row }">
        <div class="table-actions">
          <el-button type="info" link size="small" :icon="View" @click="openDetail(row)">
            {{ t('shop.order.detail') }}
          </el-button>
          <el-button v-if="row.status === 'created'" type="success" link size="small" @click="handlePay(row)">
            {{ t('shop.order.pay') }}
          </el-button>
          <el-button v-if="row.status === 'paid' || row.status === 'fulfilled'" type="warning" link size="small" @click="openShipDialog(row)">
            {{ t('shop.order.ship') }}
          </el-button>
          <el-button
            v-if="row.status !== 'shipped' && row.status !== 'done' && row.status !== 'cancelled'"
            type="danger"
            link
            size="small"
            @click="handleCancel(row)"
          >
            {{ t('shop.order.cancel') }}
          </el-button>
        </div>
      </template>
    </ProTable>

    <!-- 发货 -->
    <el-dialog v-model="shipVisible" :title="t('shop.order.shipTitle')" width="460px" :close-on-click-modal="false" destroy-on-close>
      <el-form ref="shipFormRef" :model="shipForm" label-width="100px">
        <el-form-item :label="t('shop.order.carrier')">
          <el-input v-model="shipForm.carrier" :placeholder="t('shop.order.carrierPlaceholder')" />
        </el-form-item>
        <el-form-item :label="t('shop.order.trackingNo')">
          <el-input v-model="shipForm.trackingNo" :placeholder="t('shop.order.trackingNoPlaceholder')" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="shipVisible = false">
          {{ t('common.cancel') }}
        </el-button>
        <el-button type="primary" :loading="submitLoading" @click="handleShip">
          {{ t('common.confirm') }}
        </el-button>
      </template>
    </el-dialog>

    <!-- 批量发货（PLAN 4.1）：按「订单号/ID + 运单号」逐行粘贴，逐单返回结果 -->
    <el-dialog v-model="batchShipVisible" :title="t('shop.order.batchShip')" width="720px" :close-on-click-modal="false" destroy-on-close>
      <el-form label-width="100px">
        <el-form-item :label="t('shop.order.carrier')">
          <el-input v-model="batchShipForm.defaultCarrier" :placeholder="t('shop.order.batchCarrierPlaceholder')" style="width: 220px" />
        </el-form-item>
        <el-form-item :label="t('shop.order.batchRows')">
          <el-input v-model="batchShipForm.rows" type="textarea" :rows="8" :placeholder="t('shop.order.batchRowsPlaceholder')" />
          <div class="form-tip">{{ t('shop.order.batchRowsTip') }}</div>
        </el-form-item>
      </el-form>

      <div v-if="batchResult" class="batch-result">
        <el-alert
          :type="batchResult.failed > 0 ? 'warning' : 'success'"
          :closable="false"
          :title="t('shop.order.batchSummary', { ok: String(batchResult.succeeded), fail: String(batchResult.failed) })"
        />
        <el-table :data="batchResult.rows" size="small" max-height="240" class="batch-table">
          <el-table-column prop="orderId" :label="t('shop.order.orderId')" width="100" />
          <el-table-column prop="trackingNo" :label="t('shop.order.trackingNo')" min-width="150" />
          <el-table-column :label="t('common.status')" width="200">
            <template #default="{ row }">
              <el-tag v-if="row.ok" type="success" size="small">{{ t('shop.order.batchOk') }}</el-tag>
              <el-tooltip v-else :content="row.error || ''" placement="top">
                <el-tag type="danger" size="small">{{ row.error }}</el-tag>
              </el-tooltip>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <template #footer>
        <el-button @click="batchShipVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="batchSubmitting" @click="handleBatchShip">
          {{ t('common.confirm') }}
        </el-button>
      </template>
    </el-dialog>

    <!-- 订单详情 -->
    <el-dialog v-model="detailVisible" :title="t('shop.order.detail')" width="720px" :close-on-click-modal="false" destroy-on-close>
      <el-descriptions v-if="currentOrder" :column="2" border>
        <el-descriptions-item :label="t('shop.order.orderNo')">{{ currentOrder.orderNo }}</el-descriptions-item>
        <el-descriptions-item :label="t('shop.order.status')">
          <el-tag :type="statusTag(currentOrder.status)" size="small" disable-transitions>{{ statusLabel(currentOrder.status) }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item :label="t('shop.order.channel')">{{ channelName(currentOrder.channelId) }}</el-descriptions-item>
        <el-descriptions-item :label="t('shop.order.shop')">{{ shopName(currentOrder.shopId) }}</el-descriptions-item>
        <el-descriptions-item :label="t('shop.order.buyer')">{{ buyerText(currentOrder.buyer) }}</el-descriptions-item>
        <el-descriptions-item :label="t('shop.order.amount')">{{ currentOrder.currency }} {{ Number(currentOrder.amount).toFixed(2) }}</el-descriptions-item>
      </el-descriptions>

      <div class="detail-section-title">{{ t('shop.order.items') }}</div>
      <el-table :data="detailItems" border stripe max-height="240">
        <el-table-column prop="skuId" :label="t('shop.inventory.skuId')" width="110" />
        <el-table-column prop="qty" :label="t('shop.order.itemQty')" width="90" />
        <el-table-column prop="price" :label="t('shop.order.itemPrice')" min-width="120">
          <template #default="{ row }">{{ Number(row.price).toFixed(2) }}</template>
        </el-table-column>
      </el-table>

      <div class="detail-section-title">{{ t('shop.order.shipments') }}</div>
      <el-table :data="detailShipments" border stripe max-height="200">
        <el-table-column prop="carrier" :label="t('shop.order.carrier')" min-width="120" />
        <el-table-column prop="trackingNo" :label="t('shop.order.trackingNo')" min-width="160" />
        <el-table-column prop="customsNo" :label="t('shop.order.customsNo')" min-width="160" />
        <el-table-column prop="status" :label="t('common.status')" width="100" />
      </el-table>
      <template #footer>
        <el-button @click="detailVisible = false">
          {{ t('common.close') }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { Van, View } from '@element-plus/icons-vue'
import {
  channelApi,
  orderApi,
  shopStoreApi,
  type ChannelOption,
  type Order,
  type OrderBuyer,
  type OrderDetail,
  type OrderItem,
  type OrderShipment,
  type OrderStatus,
  type ShopOption,
  type BatchShipResult,
} from '@/api/shop'
import { getErrorMessage } from '@/utils/error'
import ProTable from '@/components/ProTable/index.vue'
import { useI18n } from '@/i18n'

const { t, locale } = useI18n()

const channelOptions = ref<ChannelOption[]>([])
const shopOptions = ref<ShopOption[]>([])

const channelName = (channelId: number): string => channelOptions.value.find((c) => c.id === channelId)?.name ?? String(channelId)
const shopName = (shopId: number): string => shopOptions.value.find((s) => s.id === shopId)?.name ?? String(shopId)

const statusLabel = (status: string): string => {
  const map: Record<string, string> = {
    created: t('shop.order.statusCreated'),
    paid: t('shop.order.statusPaid'),
    fulfilled: t('shop.order.statusFulfilled'),
    shipped: t('shop.order.statusShipped'),
    done: t('shop.order.statusDone'),
    cancelled: t('shop.order.statusCancelled'),
  }
  return map[status] ?? status
}

const statusTag = (status: string): 'success' | 'warning' | 'info' | 'danger' | 'primary' => {
  const map: Record<string, 'success' | 'warning' | 'info' | 'danger' | 'primary'> = {
    created: 'warning',
    paid: 'primary',
    fulfilled: 'primary',
    shipped: 'success',
    done: 'success',
    cancelled: 'info',
  }
  return map[status] ?? 'info'
}

const buyerText = (buyer: OrderBuyer | null | undefined): string => {
  if (!buyer) return '-'
  return [buyer.name, buyer.country, buyer.email].filter(Boolean).join(' / ') || '-'
}

const columns = computed(() => [
  { prop: 'id', label: t('common.id'), width: 70 },
  { prop: 'orderNo', label: t('shop.order.orderNo'), minWidth: 180 },
  { prop: 'channelId', label: t('shop.order.channel'), minWidth: 130 },
  { prop: 'amount', label: t('shop.order.amount'), width: 140 },
  { prop: 'status', label: t('shop.order.status'), width: 110 },
  { prop: 'createdAt', label: t('common.createdTime'), width: 175 },
  { prop: 'actions', label: t('common.operation'), width: 260, fixed: 'right' },
])

const orders = ref<Order[]>([])
const loading = ref(false)
const pagination = reactive({ pageNum: 1, pageSize: 10, total: 0 })
const searchParams = reactive({ keyword: '', status: '' })
const searchFields = computed(() => [
  { prop: 'keyword', label: t('common.keyword'), type: 'input', placeholder: t('shop.order.searchPlaceholder') },
  {
    prop: 'status',
    label: t('shop.order.status'),
    type: 'select',
    placeholder: t('common.all'),
    options: [
      { label: t('shop.order.statusCreated'), value: 'created' },
      { label: t('shop.order.statusPaid'), value: 'paid' },
      { label: t('shop.order.statusFulfilled'), value: 'fulfilled' },
      { label: t('shop.order.statusShipped'), value: 'shipped' },
      { label: t('shop.order.statusDone'), value: 'done' },
      { label: t('shop.order.statusCancelled'), value: 'cancelled' },
    ],
  },
])

const fetchList = async (): Promise<void> => {
  loading.value = true
  try {
    const res = await orderApi.list({
      page: pagination.pageNum,
      pageSize: pagination.pageSize,
      status: (searchParams.status as OrderStatus) || undefined,
    })
    orders.value = res.data.list
    pagination.total = res.data.total
  } catch (err: unknown) {
    ElMessage.error(t('shop.order.fetchFailed') + ': ' + getErrorMessage(err))
  } finally {
    loading.value = false
  }
}

const onQuery = ({ pagination: p, searchParams: s }: { pagination: Record<string, number>; searchParams?: Record<string, unknown> }): void => {
  Object.assign(pagination, p)
  if (s) Object.assign(searchParams, s)
  fetchList()
}

const loadOptions = async (): Promise<void> => {
  try {
    const [chRes, shRes] = await Promise.all([channelApi.options(), shopStoreApi.options()])
    channelOptions.value = chRes.data
    shopOptions.value = shRes.data
  } catch {
    channelOptions.value = []
    shopOptions.value = []
  }
}

// ==================== 发货 ====================
const shipVisible = ref(false)
const submitLoading = ref(false)
const shipOrderId = ref<number | null>(null)
const shipForm = reactive({ carrier: '', trackingNo: '' })

const openShipDialog = (row: Record<string, unknown>): void => {
  shipOrderId.value = row.id as number
  shipForm.carrier = ''
  shipForm.trackingNo = ''
  shipVisible.value = true
}

const handleShip = async (): Promise<void> => {
  if (shipOrderId.value == null) return
  submitLoading.value = true
  try {
    await orderApi.ship(shipOrderId.value, {
      carrier: shipForm.carrier.trim() || undefined,
      trackingNo: shipForm.trackingNo.trim() || undefined,
    })
    ElMessage.success(t('common.operationSuccess'))
    shipVisible.value = false
    fetchList()
  } catch (err: unknown) {
    ElMessage.error(getErrorMessage(err))
  } finally {
    submitLoading.value = false
  }
}

// ==================== 批量发货（PLAN 4.1） ====================
const batchShipVisible = ref(false)
const batchSubmitting = ref(false)
const batchResult = ref<BatchShipResult | null>(null)
const batchShipForm = reactive({ defaultCarrier: '', rows: '' })

const openBatchShip = (): void => {
  batchShipForm.defaultCarrier = ''
  batchShipForm.rows = ''
  batchResult.value = null
  batchShipVisible.value = true
}

/**
 * 解析粘贴内容：每行「订单ID 运单号」（逗号/空格/制表符分隔均可）。
 * 只接受数字订单 id：后台列表展示的是 id，用 orderNo 需要额外查库，批量场景不值得。
 */
function parseBatchRows(text: string): { items: { orderId: number; trackingNo?: string }[]; invalid: string[] } {
  const items: { orderId: number; trackingNo?: string }[] = []
  const invalid: string[] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    const parts = line.split(/[\s,;\t]+/).filter(Boolean)
    const id = Number(parts[0])
    if (!Number.isInteger(id) || id <= 0) {
      invalid.push(line)
      continue
    }
    items.push({ orderId: id, trackingNo: parts[1] || undefined })
  }
  return { items, invalid }
}

const handleBatchShip = async (): Promise<void> => {
  const { items, invalid } = parseBatchRows(batchShipForm.rows)
  if (invalid.length > 0) {
    // 先拦住格式错误，避免把半批请求发出去后还要人工核对哪些进去了
    ElMessage.error(t('shop.order.batchInvalidRows', { rows: invalid.slice(0, 5).join(' / ') }))
    return
  }
  if (items.length === 0) {
    ElMessage.warning(t('shop.order.batchEmpty'))
    return
  }
  batchSubmitting.value = true
  try {
    const res = await orderApi.batchShip({
      items,
      defaultCarrier: batchShipForm.defaultCarrier.trim() || undefined,
    })
    batchResult.value = res.data
    // 有成功单就刷新列表；全失败则保持原样，避免无意义请求
    if (res.data.succeeded > 0) fetchList()
  } catch (err: unknown) {
    ElMessage.error(getErrorMessage(err))
  } finally {
    batchSubmitting.value = false
  }
}

// ==================== 付款 / 取消 ====================
const handlePay = async (row: Record<string, unknown>): Promise<void> => {
  try {
    await orderApi.markPaid(row.id as number)
    ElMessage.success(t('common.operationSuccess'))
    fetchList()
  } catch (err: unknown) {
    ElMessage.error(getErrorMessage(err))
  }
}

const handleCancel = (row: Record<string, unknown>): void => {
  ElMessageBox.confirm(t('shop.order.cancelTip'), t('shop.order.cancelTitle'), {
    type: 'warning',
    confirmButtonText: t('common.confirm'),
    cancelButtonText: t('common.cancel'),
  })
    .then(async () => {
      try {
        await orderApi.cancel(row.id as number)
        ElMessage.success(t('common.operationSuccess'))
        fetchList()
      } catch (err: unknown) {
        ElMessage.error(getErrorMessage(err))
      }
    })
    .catch(() => {
      // 用户取消
    })
}

// ==================== 详情 ====================
const detailVisible = ref(false)
const currentOrder = ref<Order | null>(null)
const detailItems = ref<OrderItem[]>([])
const detailShipments = ref<OrderShipment[]>([])

const openDetail = async (row: Record<string, unknown>): Promise<void> => {
  detailVisible.value = true
  try {
    const res = await orderApi.detail(row.id as number)
    const data = res.data as OrderDetail
    currentOrder.value = data.order
    detailItems.value = data.items
    detailShipments.value = data.shipments
  } catch (err: unknown) {
    ElMessage.error(getErrorMessage(err))
  }
}

onMounted(() => {
  loadOptions()
  fetchList()
})
</script>

<style lang="scss" scoped>
.amount-cell {
  font-weight: 600;
}

.form-tip {
  font-size: 12px;
  color: #909399;
  line-height: 1.5;
  margin-top: 4px;
}

.batch-result {
  margin-top: 12px;

  .batch-table {
    margin-top: 8px;
  }
}

.detail-section-title {
  margin: 16px 0 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}
</style>
