<template>
  <div class="page-container">
    <el-card shadow="never">
      <template #header>
        <div class="card-header">
          <span>{{ t('notificationChannel.title') }}</span>
          <el-button type="primary" :icon="Plus" @click="openCreate">{{ t('notificationChannel.add') }}</el-button>
        </div>
      </template>

      <div class="toolbar">
        <el-input v-model="keyword" :placeholder="t('notificationChannel.keyword')" clearable style="width: 220px" @keyup.enter="fetchList" />
        <el-select v-model="typeFilter" :placeholder="t('notificationChannel.allTypes')" clearable style="width: 160px">
          <el-option label="Email" value="email" />
          <el-option :label="t('notificationChannel.typeSms')" value="sms" />
          <el-option label="Webhook" value="webhook" />
        </el-select>
        <el-button :icon="Refresh" @click="fetchList">{{ t('notificationChannel.refresh') }}</el-button>
        <el-button :icon="Bell" @click="openDeliveries">{{ t('notificationChannel.deliveries') }}</el-button>
      </div>

      <el-table v-loading="loading" :data="channels" border stripe>
        <el-table-column prop="name" :label="t('notificationChannel.name')" min-width="150" />
        <el-table-column :label="t('notificationChannel.type')" width="120">
          <template #default="{ row }">
            <el-tag :type="typeTag((row as NotificationChannel).type)" size="small" disable-transitions>
              {{ typeLabel((row as NotificationChannel).type) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('notificationChannel.enabled')" width="100">
          <template #default="{ row }">
            <el-switch
              :model-value="(row as NotificationChannel).enabled"
              :loading="togglingId === (row as NotificationChannel).id"
              @change="(v: unknown) => handleToggle(row as NotificationChannel, Boolean(v))"
            />
          </template>
        </el-table-column>
        <el-table-column :label="t('notificationChannel.lastTested')" min-width="220">
          <template #default="{ row }">
            <span v-if="(row as NotificationChannel).lastTestedAt" class="test-result">
              {{ formatDate((row as NotificationChannel).lastTestedAt) }}
              <el-tag :type="(row as NotificationChannel).lastTestResult?.startsWith('OK') ? 'success' : 'danger'" size="small">
                {{ (row as NotificationChannel).lastTestResult }}
              </el-tag>
            </span>
            <span v-else class="muted">—</span>
          </template>
        </el-table-column>
        <el-table-column prop="remark" :label="t('notificationChannel.remark')" min-width="160" show-overflow-tooltip />
        <el-table-column :label="t('notificationChannel.actions')" width="220" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="openEdit(row as NotificationChannel)">
              {{ t('notificationChannel.edit') }}
            </el-button>
            <el-button
              link
              type="warning"
              size="small"
              :loading="testingId === (row as NotificationChannel).id"
              @click="handleTest(row as NotificationChannel)"
            >
              {{ t('notificationChannel.test') }}
            </el-button>
            <el-button link type="danger" size="small" @click="handleDelete(row as NotificationChannel)">
              {{ t('notificationChannel.delete') }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="dialogVisible" :title="editingId ? t('notificationChannel.edit') : t('notificationChannel.add')" width="560px" destroy-on-close>
      <el-form :model="form" label-width="120px">
        <el-form-item :label="t('notificationChannel.name')" required>
          <el-input v-model="form.name" maxlength="100" />
        </el-form-item>
        <el-form-item :label="t('notificationChannel.type')">
          <el-select v-model="form.type" :disabled="!!editingId" style="width: 100%">
            <el-option label="Email" value="email" />
            <el-option :label="t('notificationChannel.typeSms')" value="sms" />
            <el-option label="Webhook" value="webhook" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('notificationChannel.enabled')">
          <el-switch v-model="form.enabled" />
        </el-form-item>

        <template v-if="form.type === 'webhook'">
          <el-form-item label="Webhook URL" required>
            <el-input v-model="form.config.url" placeholder="https://example.com/hooks/notify" />
          </el-form-item>
          <el-form-item :label="t('notificationChannel.secret')">
            <el-input v-model="form.config.secret" show-password />
          </el-form-item>
        </template>

        <template v-else-if="form.type === 'email'">
          <el-form-item label="SMTP Host"><el-input v-model="form.config.host" /></el-form-item>
          <el-form-item label="SMTP Port"><el-input-number v-model="form.config.port" :min="1" :max="65535" /></el-form-item>
          <el-form-item label="SSL"><el-switch v-model="form.config.secure" /></el-form-item>
          <el-form-item :label="t('notificationChannel.user')"><el-input v-model="form.config.user" /></el-form-item>
          <el-form-item :label="t('notificationChannel.pass')"><el-input v-model="form.config.pass" show-password /></el-form-item>
          <el-form-item :label="t('notificationChannel.from')"><el-input v-model="form.config.from" /></el-form-item>
        </template>

        <template v-else>
          <el-form-item :label="t('notificationChannel.provider')"><el-input v-model="form.config.provider" /></el-form-item>
          <el-form-item label="API Key"><el-input v-model="form.config.apiKey" show-password /></el-form-item>
          <el-form-item :label="t('notificationChannel.signName')"><el-input v-model="form.config.signName" /></el-form-item>
          <el-alert type="info" :closable="false" :title="t('notificationChannel.smsHint')" />
        </template>

        <el-form-item :label="t('notificationChannel.remark')">
          <el-input v-model="form.remark" maxlength="255" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">{{ t('notificationChannel.cancel') }}</el-button>
        <el-button type="primary" :loading="saving" @click="submit">{{ t('notificationChannel.save') }}</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="deliveriesVisible" :title="t('notificationChannel.deliveries')" width="900px">
      <el-table :data="deliveries" border stripe size="small" max-height="420" :empty-text="t('notificationChannel.deliveryEmpty')">
        <el-table-column prop="at" :label="t('notificationChannel.deliveryAt')" width="180" />
        <el-table-column prop="event" :label="t('notificationChannel.deliveryEvent')" width="200" show-overflow-tooltip />
        <el-table-column prop="channelName" :label="t('notificationChannel.deliveryChannel')" width="130" show-overflow-tooltip />
        <el-table-column :label="t('notificationChannel.deliveryResult')" width="90">
          <template #default="{ row }">
            <el-tag :type="(row as DeliveryRecord).ok ? 'success' : 'danger'" size="small" disable-transitions>
              {{ (row as DeliveryRecord).ok ? 'OK' : 'FAIL' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="message" :label="t('notificationChannel.deliveryMessage')" min-width="200" show-overflow-tooltip />
      </el-table>
      <template #footer>
        <el-button @click="deliveriesVisible = false">{{ t('notificationChannel.cancel') }}</el-button>
        <el-button :icon="Refresh" @click="fetchDeliveries">{{ t('notificationChannel.refresh') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Refresh, Bell } from '@element-plus/icons-vue'
import { notificationChannelApi, type NotificationChannel, type ChannelType, type ChannelConfig, type DeliveryRecord } from '@/api/notificationChannel'
import { getErrorMessage } from '@/utils/error'
import { useI18n } from '@/i18n'

const { t } = useI18n()

const channels = ref<NotificationChannel[]>([])
const loading = ref(false)
const keyword = ref('')
const typeFilter = ref<ChannelType | ''>('')
const togglingId = ref<number | null>(null)
const testingId = ref<number | null>(null)
const saving = ref(false)
const dialogVisible = ref(false)
const editingId = ref<number | null>(null)
const deliveriesVisible = ref(false)
const deliveries = ref<DeliveryRecord[]>([])

const form = reactive<{ name: string; type: ChannelType; enabled: boolean; remark: string; config: ChannelConfig }>({
  name: '',
  type: 'webhook',
  enabled: true,
  remark: '',
  config: {},
})

function defaultConfig(): ChannelConfig {
  return {}
}

function resetForm(): void {
  form.name = ''
  form.type = 'webhook'
  form.enabled = true
  form.remark = ''
  form.config = defaultConfig()
}

const fetchList = async (): Promise<void> => {
  loading.value = true
  try {
    const res = await notificationChannelApi.list({
      keyword: keyword.value || undefined,
      type: typeFilter.value || undefined,
    })
    channels.value = res.data
  } catch (err: unknown) {
    ElMessage.error(t('notificationChannel.fetchFailed') + ': ' + getErrorMessage(err))
  } finally {
    loading.value = false
  }
}

const fetchDeliveries = async (): Promise<void> => {
  try {
    const res = await notificationChannelApi.deliveries()
    deliveries.value = res.data
  } catch (err: unknown) {
    ElMessage.error(t('notificationChannel.fetchFailed') + ': ' + getErrorMessage(err))
  }
}

const openDeliveries = async (): Promise<void> => {
  deliveriesVisible.value = true
  await fetchDeliveries()
}

function typeTag(type: ChannelType): 'primary' | 'warning' | 'success' {
  return type === 'email' ? 'primary' : type === 'sms' ? 'warning' : 'success'
}

function typeLabel(type: ChannelType): string {
  return type === 'sms' ? t('notificationChannel.typeSms') : type.toUpperCase()
}

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleString() : ''
}

function openCreate(): void {
  editingId.value = null
  resetForm()
  dialogVisible.value = true
}

function openEdit(row: NotificationChannel): void {
  editingId.value = row.id
  form.name = row.name
  form.type = row.type
  form.enabled = row.enabled
  form.remark = row.remark ?? ''
  form.config = { ...row.config }
  dialogVisible.value = true
}

const submit = async (): Promise<void> => {
  if (!form.name.trim()) {
    ElMessage.warning(t('notificationChannel.nameRequired'))
    return
  }
  if (form.type === 'webhook' && !String(form.config.url ?? '').trim()) {
    ElMessage.warning(t('notificationChannel.urlRequired'))
    return
  }
  saving.value = true
  try {
    const payload = {
      name: form.name.trim(),
      type: form.type,
      enabled: form.enabled,
      remark: form.remark || null,
      config: { ...form.config },
    }
    if (editingId.value) await notificationChannelApi.update(editingId.value, payload)
    else await notificationChannelApi.create(payload)
    ElMessage.success(t('notificationChannel.saveSuccess'))
    dialogVisible.value = false
    await fetchList()
  } catch (err: unknown) {
    ElMessage.error(getErrorMessage(err))
  } finally {
    saving.value = false
  }
}

const handleToggle = async (row: NotificationChannel, enabled: boolean): Promise<void> => {
  togglingId.value = row.id
  try {
    await notificationChannelApi.toggle(row.id, enabled)
    row.enabled = enabled
  } catch (err: unknown) {
    ElMessage.error(getErrorMessage(err))
    await fetchList()
  } finally {
    togglingId.value = null
  }
}

const handleTest = async (row: NotificationChannel): Promise<void> => {
  testingId.value = row.id
  try {
    const res = await notificationChannelApi.test(row.id)
    const result = res.data
    if (result.ok) ElMessage.success(t('notificationChannel.testSuccess') + ': ' + result.message)
    else ElMessage.warning(t('notificationChannel.testFailed') + ': ' + result.message)
    await fetchList()
  } catch (err: unknown) {
    ElMessage.error(getErrorMessage(err))
  } finally {
    testingId.value = null
  }
}

const handleDelete = async (row: NotificationChannel): Promise<void> => {
  try {
    await ElMessageBox.confirm(t('notificationChannel.confirmDelete', { name: row.name }), t('notificationChannel.delete'), {
      type: 'warning',
    })
  } catch {
    return
  }
  try {
    await notificationChannelApi.remove(row.id)
    ElMessage.success(t('notificationChannel.deleteSuccess'))
    await fetchList()
  } catch (err: unknown) {
    ElMessage.error(getErrorMessage(err))
  }
}

onMounted(fetchList)
</script>

<style lang="scss" scoped>
.page-container {
  padding: 16px;
}
.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.toolbar {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}
.test-result {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}
.muted {
  color: var(--el-text-color-secondary);
}
</style>
