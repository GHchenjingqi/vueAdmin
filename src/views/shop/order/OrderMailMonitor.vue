<template>
  <div class="page-container">
    <el-card shadow="never" class="filter-card">
      <el-form :inline="true">
        <el-form-item :label="t('shop.orderMails.orderId')">
          <el-input-number v-model="orderId" :min="1" :controls="false" :placeholder="t('shop.orderMails.orderIdPlaceholder')" style="width: 200px" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="loading" @click="load">{{ t('common.search') }}</el-button>
          <el-button type="warning" :loading="draining" @click="handleDrain">{{ t('shop.orderMails.drain') }}</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never">
      <template #header>
        <span class="card-title">{{ t('shop.orderMails.title') }}</span>
      </template>
      <el-alert v-if="!queried" :title="t('shop.orderMails.emptyHint')" type="info" :closable="false" show-icon />
      <el-table v-else v-loading="loading" :data="rows" border stripe>
        <el-table-column prop="id" :label="t('common.id')" width="90" />
        <el-table-column prop="orderNo" :label="t('shop.orderMails.orderNo')" min-width="170" />
        <el-table-column prop="type" :label="t('shop.orderMails.type')" width="110" />
        <el-table-column prop="toEmail" :label="t('shop.orderMails.toEmail')" min-width="180" />
        <el-table-column prop="subject" :label="t('shop.orderMails.subject')" min-width="220" show-overflow-tooltip />
        <el-table-column :label="t('common.status')" width="110">
          <template #default="{ row }">
            <el-tag :type="statusTag((row as OrderMailItem).status)" size="small" disable-transitions>{{ statusLabel((row as OrderMailItem).status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="attempts" :label="t('shop.orderMails.attempts')" width="90" />
        <el-table-column prop="lastError" :label="t('shop.orderMails.lastError')" min-width="180" show-overflow-tooltip />
        <el-table-column :label="t('common.operation')" width="110" fixed="right">
          <template #default="{ row }">
            <el-button
              v-if="(row as OrderMailItem).status === 'failed' || (row as OrderMailItem).status === 'dead'"
              type="primary"
              link
              :loading="submitting"
              @click="handleRetry(row as OrderMailItem)"
            >
              {{ t('shop.orderMails.retry') }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { shopOrderMailApi, type OrderMailItem, type OrderMailStatus } from '@/api/shopOrderMail'
import { getErrorMessage } from '@/utils/error'
import { useI18n } from '@/i18n'

const { t } = useI18n()

const orderId = ref<number | undefined>(undefined)
const rows = ref<OrderMailItem[]>([])
const loading = ref(false)
const draining = ref(false)
const submitting = ref(false)
const queried = ref(false)

const statusLabel = (status: OrderMailStatus): string => {
  const key = `shop.orderMails.status${status.charAt(0).toUpperCase()}${status.slice(1)}`
  return t(key)
}

const statusTag = (status: OrderMailStatus): 'success' | 'danger' | 'warning' | 'info' => {
  if (status === 'sent') return 'success'
  if (status === 'failed' || status === 'dead') return 'danger'
  if (status === 'pending') return 'warning'
  return 'info'
}

const load = async (): Promise<void> => {
  if (!orderId.value || orderId.value <= 0) {
    ElMessage.warning(t('shop.orderMails.orderIdPlaceholder'))
    return
  }
  loading.value = true
  queried.value = true
  try {
    const res = await shopOrderMailApi.list(orderId.value)
    rows.value = res.data
  } catch (err: unknown) {
    ElMessage.error(t('shop.orderMails.loadFailed') + ': ' + getErrorMessage(err))
  } finally {
    loading.value = false
  }
}

const handleDrain = async (): Promise<void> => {
  draining.value = true
  try {
    const res = await shopOrderMailApi.drain()
    const d = res.data
    ElMessage.success(`${t('shop.orderMails.drainSuccess')}: ${d.scanned} / ${d.sent} / ${d.failed} / ${d.dead}`)
    if (queried.value) await load()
  } catch (err: unknown) {
    ElMessage.error(t('shop.orderMails.loadFailed') + ': ' + getErrorMessage(err))
  } finally {
    draining.value = false
  }
}

const handleRetry = async (row: OrderMailItem): Promise<void> => {
  submitting.value = true
  try {
    await shopOrderMailApi.retry(row.id)
    ElMessage.success(t('shop.orderMails.retrySuccess'))
    await load()
  } catch (err: unknown) {
    ElMessage.error(t('shop.orderMails.loadFailed') + ': ' + getErrorMessage(err))
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped lang="scss">
.filter-card {
  margin-bottom: 16px;
}

.card-title {
  font-weight: 600;
}
</style>
