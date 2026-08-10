<template>
  <div class="page-container">
    <ProTable
      ref="proTableRef"
      :title="t('message.title')"
      :columns="columns"
      :data="messages"
      :loading="loading"
      :search-fields="searchFields"
      :search-params="searchParams"
      :pagination="pagination"
      :show-index="false"
      :show-selection="false"
      :show-pagination="true"
      @query="onQuery"
    >
      <template #header-buttons>
        <el-button
          :icon="Select"
          @click="handleReadAll"
        >
          {{ t('message.readAll') }}
        </el-button>
      </template>

      <template #column-type="{ row }">
        <el-tag
          :type="typeTag(row.type)"
          size="small"
        >
          {{ typeLabel(row.type) }}
        </el-tag>
      </template>

      <template #column-isRead="{ row }">
        <el-tag
          :type="isRead(row as Message) ? 'success' : 'warning'"
          size="small"
        >
          {{ isRead(row as Message) ? t('message.read') : t('message.unread') }}
        </el-tag>
      </template>

      <template #column-title="{ row }">
        <span :style="{ fontWeight: isRead(row as Message) ? 'normal' : 'bold' }">{{ (row as Message).title }}</span>
      </template>

      <template #column-fromUser="{ row }">
        <span v-if="row.fromUser">{{ row.fromUser.nickname || row.fromUser.username }}</span>
        <el-tag
          v-else
          type="info"
          size="small"
        >
          {{ t('message.system') }}
        </el-tag>
      </template>

      <template #column-createdAt="{ row }">
        {{ formatTime(row.createdAt || row.sendTime) }}
      </template>

      <template #column-actions="{ row }">
        <el-button
          type="primary"
          link
          size="small"
          @click="handleView(row as Message)"
        >
          {{ t('common.view') }}
        </el-button>
        <el-button
          type="danger"
          link
          size="small"
          @click="handleDelete(row as Message)"
        >
          {{ t('common.delete') }}
        </el-button>
      </template>
    </ProTable>

    <el-dialog
      v-model="dialogVisible"
      :title="t('message.messageDetail')"
      width="600px"
      destroy-on-close
    >
      <el-descriptions
        :column="1"
        border
      >
        <el-descriptions-item :label="t('notice.title')">
          {{ currentMessage.title }}
        </el-descriptions-item>
        <el-descriptions-item :label="t('common.type')">
          <el-tag
            :type="typeTag(currentMessage.type)"
            size="small"
          >
            {{ typeLabel(currentMessage.type) }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item :label="t('message.sender')">
          <span v-if="currentMessage.fromUser">{{ currentMessage.fromUser.nickname || currentMessage.fromUser.username }}</span>
          <el-tag
            v-else
            type="info"
            size="small"
          >
            {{ t('message.system') }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item :label="t('message.time')">
          {{ formatTime(currentMessage.createdAt || currentMessage.sendTime) }}
        </el-descriptions-item>
        <el-descriptions-item :label="t('message.content')">
          <div style="white-space: pre-wrap; line-height: 1.8">
            {{ currentMessage.content }}
          </div>
        </el-descriptions-item>
      </el-descriptions>
      <template #footer>
        <el-button @click="dialogVisible = false">
          {{ t('common.close') }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import { Select } from '@element-plus/icons-vue'
import ProTable from '@/components/ProTable/index.vue'
import { messageApi } from '@/api/message'
import { useNotificationStore } from '@/stores'
import { useI18n } from '@/i18n'
import type { Message } from '@/types/api'

const { t } = useI18n()
const notificationStore = useNotificationStore()

const dialogVisible = ref(false)
const currentMessage = ref<Message>({} as Message)
const messages = ref<Message[]>([])
const loading = ref(false)
const pagination = reactive({ pageNum: 1, pageSize: 10, total: 0 })

const searchFields = computed(() => [
  {
    prop: 'type',
    label: t('common.type'),
    type: 'select',
    placeholder: t('message.allTypes'),
    options: [
      { label: t('message.systemMessage'), value: 'system' },
      { label: t('message.announcement'), value: 'notice' },
      { label: t('message.privateMessage'), value: 'private' },
    ],
  },
  {
    prop: 'isRead',
    label: t('common.status'),
    type: 'select',
    placeholder: t('common.all'),
    options: [
      { label: t('message.read'), value: '1' },
      { label: t('message.unread'), value: '0' },
    ],
  },
])

const searchParams = reactive({
  type: '',
  isRead: '',
})

const columns = computed(() => [
  { prop: 'id', label: 'ID', width: 70 },
  { prop: 'type', label: t('common.type'), width: 100 },
  { prop: 'title', label: t('notice.title'), minWidth: 200 },
  { prop: 'fromUser', label: t('message.sender'), width: 120 },
  { prop: 'isRead', label: t('common.status'), width: 80 },
  { prop: 'createdAt', label: t('message.time'), width: 170 },
  { prop: 'actions', label: t('common.actions'), width: 150, fixed: 'right' },
])

const typeTagMap: Record<string, string> = { system: 'info', notice: 'warning', private: 'success' }

function typeTag(type?: string): 'success' | 'warning' | 'info' | 'primary' | 'danger' | undefined {
  if (!type) return undefined
  return (typeTagMap[type] as 'success' | 'warning' | 'info' | 'primary' | 'danger') || undefined
}

function typeLabel(type?: string): string {
  if (!type) return ''
  const map: Record<string, string> = {
    system: t('message.systemMessage'),
    notice: t('message.announcement'),
    private: t('message.privateMessage'),
  }
  return map[type] || type
}

function isRead(row: Message): boolean {
  if (typeof row.isRead === 'boolean') return row.isRead
  if (typeof row.read === 'boolean') return row.read
  return false
}

function formatTime(time?: string | number | Date): string {
  if (!time) return ''
  return new Date(time).toLocaleString()
}

function onQuery(params: { searchParams?: Record<string, unknown>; pagination?: Record<string, unknown> }): void {
  if (params.searchParams) Object.assign(searchParams, params.searchParams)
  if (params.pagination) Object.assign(pagination, params.pagination)
  fetchMessages()
}

async function fetchMessages(): Promise<void> {
  loading.value = true
  try {
    const params: Record<string, unknown> = { page: pagination.pageNum, pageSize: pagination.pageSize }
    if (searchParams.type) params.type = searchParams.type
    if (searchParams.isRead !== '') params.isRead = searchParams.isRead
    const res = await messageApi.list(params)
    messages.value = (res.data?.rows || []).map((item) => {
      const read = typeof item.isRead === 'boolean' ? item.isRead : !!item.read
      return { ...item, isRead: read, read }
    })
    pagination.total = res.data?.total || 0
    if (typeof res.data?.unreadCount === 'number') {
      notificationStore.unreadMessageCount = res.data.unreadCount
    } else {
      await notificationStore.refreshUnreadCounts()
    }
  } catch {
    messages.value = []
  } finally {
    loading.value = false
  }
}

async function handleView(row: Message): Promise<void> {
  currentMessage.value = row
  if (!isRead(row)) {
    try {
      await notificationStore.markMessageRead(row.id)
      row.isRead = true
      row.read = true
      fetchMessages()
    } catch {
      // 标记已读失败，不影响查看消息
    }
  }
  dialogVisible.value = true
}

async function handleReadAll(): Promise<void> {
  try {
    await ElMessageBox.confirm(t('message.readAllConfirm'), t('common.tip'))
    await notificationStore.markAllMessagesRead()
    ElMessage.success(t('message.readAllSuccess'))
    fetchMessages()
  } catch {
    // 用户取消全部已读
  }
}

async function handleDelete(row: Message): Promise<void> {
  try {
    await ElMessageBox.confirm(t('message.deleteConfirm'), t('common.tip'), { type: 'warning' })
    await messageApi.delete(row.id)
    ElMessage.success(t('message.deleteSuccess'))
    fetchMessages()
    await notificationStore.refreshUnreadCounts()
  } catch {
    // 用户取消删除
  }
}

onMounted(fetchMessages)
</script>
