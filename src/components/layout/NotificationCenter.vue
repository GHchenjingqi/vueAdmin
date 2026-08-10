<template>
  <div class="notification-center">
    <el-popover
      placement="bottom"
      :width="420"
      trigger="click"
      :visible="popoverVisible"
      popper-class="notice-popover"
      @show="handlePopoverShow"
    >
      <template #reference>
        <el-badge
          :value="totalUnread"
          :hidden="totalUnread === 0"
          class="notice-badge"
        >
          <el-icon
            :size="18"
            class="notice-icon"
            @click="popoverVisible = !popoverVisible"
          >
            <Bell />
          </el-icon>
        </el-badge>
      </template>

      <div class="notice-header">
        <span class="notice-title">{{ t('notification.title') }}</span>
        <el-button
          v-if="totalUnread > 0"
          type="primary"
          link
          size="small"
          @click="handleMarkAllRead"
        >
          {{ t('notification.readAll') }}
        </el-button>
      </div>

      <el-tabs
        v-model="activeTab"
        class="notice-tabs"
      >
        <el-tab-pane
          :label="noticeTabLabel"
          name="notice"
        >
          <div
            v-loading="notificationStore.loading"
            class="notice-list"
          >
            <div
              v-if="noticeItems.length === 0"
              class="notice-empty"
            >
              {{ t('notification.noNotices') }}
            </div>
            <div
              v-for="item in noticeItems"
              :key="`notice-${item.id}`"
              class="notice-item"
              :class="{ unread: !item.read }"
              @click="handleNoticeClick(item)"
            >
              <div class="notice-item-left">
                <el-tag
                  :type="item.type === 'notice' ? 'primary' : 'warning'"
                  size="small"
                  class="notice-type-tag"
                >
                  {{ item.type === 'notice' ? t('notification.notice') : t('notification.announcement') }}
                </el-tag>
                <span class="notice-item-title">{{ item.title }}</span>
              </div>
              <div class="notice-item-right">
                <span
                  v-if="!item.read"
                  class="notice-dot"
                />
                <span class="notice-time">{{ formatTime(item.publishTime) }}</span>
              </div>
            </div>
          </div>
        </el-tab-pane>

        <el-tab-pane
          :label="messageTabLabel"
          name="message"
        >
          <div class="notice-list">
            <div
              v-if="messageItems.length === 0"
              class="notice-empty"
            >
              {{ t('notification.noMessages') }}
            </div>
            <div
              v-for="item in messageItems"
              :key="`message-${item.id}`"
              class="notice-item"
              :class="{ unread: !isMessageRead(item) }"
              @click="handleMessageClick(item)"
            >
              <div class="notice-item-left">
                <el-tag
                  :type="messageTypeTag(item.type)"
                  size="small"
                  class="notice-type-tag"
                >
                  {{ messageTypeLabel(item.type) }}
                </el-tag>
                <span class="notice-item-title">{{ item.title }}</span>
              </div>
              <div class="notice-item-right">
                <span
                  v-if="!isMessageRead(item)"
                  class="notice-dot"
                />
                <span class="notice-time">{{ formatTime(item.createdAt || item.sendTime) }}</span>
              </div>
            </div>
          </div>
        </el-tab-pane>
      </el-tabs>

      <el-divider style="margin: 4px 0" />
      <div class="notice-footer">
        <el-button
          type="primary"
          link
          size="small"
          @click="goToMore"
        >
          {{ t('notification.viewMore') }}
        </el-button>
      </div>
    </el-popover>

    <el-dialog
      v-model="noticeDetailVisible"
      :title="noticeDetail?.title || t('notification.noticeDetail')"
      width="750px"
      :close-on-click-modal="false"
      destroy-on-close
    >
      <div
        v-if="noticeDetail"
        class="notice-detail-meta"
      >
        <el-tag
          :type="noticeDetail.type === 'notice' ? 'primary' : 'warning'"
          size="small"
        >
          {{ noticeDetail.type === 'notice' ? t('notification.notice') : t('notification.announcement') }}
        </el-tag>
        <span class="notice-detail-info">{{ t('notification.publisherLabel') }}{{ noticeDetail.publisherName || '-' }}</span>
        <span class="notice-detail-info">{{ noticeDetail.publishTime ? new Date(noticeDetail.publishTime).toLocaleString() : '-' }}</span>
      </div>
      <el-divider v-if="noticeDetail" />
      <div
        v-loading="noticeDetailLoading"
        class="notice-detail-content"
      >
        <MdPreview
          v-if="noticeDetail?.content"
          :model-value="noticeDetail.content"
        />
        <el-empty
          v-else-if="!noticeDetailLoading"
          :description="t('notification.noContent')"
        />
      </div>
    </el-dialog>

    <el-dialog
      v-model="messageDetailVisible"
      :title="messageDetail?.title || t('message.messageDetail')"
      width="600px"
      :close-on-click-modal="false"
      destroy-on-close
    >
      <el-descriptions
        v-if="messageDetail"
        :column="1"
        border
      >
        <el-descriptions-item :label="t('common.type')">
          <el-tag
            :type="messageTypeTag(messageDetail.type)"
            size="small"
          >
            {{ messageTypeLabel(messageDetail.type) }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item :label="t('message.sender')">
          <span v-if="messageDetail.fromUser">{{ messageDetail.fromUser.nickname || messageDetail.fromUser.username }}</span>
          <el-tag
            v-else
            type="info"
            size="small"
          >
            {{ t('message.system') }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item :label="t('message.time')">
          {{ formatAbsoluteTime(messageDetail.createdAt || messageDetail.sendTime) }}
        </el-descriptions-item>
        <el-descriptions-item :label="t('message.content')">
          <div style="white-space: pre-wrap; line-height: 1.8">
            {{ messageDetail.content }}
          </div>
        </el-descriptions-item>
      </el-descriptions>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { defineAsyncComponent } from 'vue'
import { Bell } from '@element-plus/icons-vue'
import { noticeApi } from '@/api'
import { messageApi } from '@/api/message'
import { performLogout } from '@/utils/request'
import { useNotificationStore } from '@/stores'
import { useI18n } from '@/i18n'
import type { Message, Notice } from '@/types/api'

const router = useRouter()
const notificationStore = useNotificationStore()
const { t } = useI18n()
const emit = defineEmits<{ unreadChange: [count: number] }>()

const MdPreview = defineAsyncComponent(async () => {
  const { setupMdEditor } = await import('@/utils/mdEditorSetup')
  await import('md-editor-v3/lib/style.css')
  setupMdEditor()
  const mod = await import('md-editor-v3')
  return mod.MdPreview
})

const popoverVisible = ref(false)
const activeTab = ref<'notice' | 'message'>('notice')
const noticeDetailVisible = ref(false)
const noticeDetail = ref<Notice | null>(null)
const noticeDetailLoading = ref(false)
const messageDetailVisible = ref(false)
const messageDetail = ref<Message | null>(null)

const totalUnread = computed(() => notificationStore.totalUnread)
const noticeItems = computed(() => notificationStore.notices)
const messageItems = computed(() => notificationStore.messages)

const noticeTabLabel = computed(() => {
  const count = notificationStore.unreadNoticeCount
  return count > 0 ? `${t('notification.notice')} (${count})` : t('notification.notice')
})

const messageTabLabel = computed(() => {
  const count = notificationStore.unreadMessageCount
  return count > 0 ? `${t('notification.message')} (${count})` : t('notification.message')
})

watch(
  totalUnread,
  (count) => {
    emit('unreadChange', count)
  },
  { immediate: true },
)

function isMessageRead(message: Message): boolean {
  if (typeof message.isRead === 'boolean') return message.isRead
  if (typeof message.read === 'boolean') return message.read
  return false
}

function messageTypeTag(type?: string): 'success' | 'warning' | 'info' | 'primary' | 'danger' | undefined {
  const map: Record<string, 'success' | 'warning' | 'info' | 'primary' | 'danger'> = {
    system: 'info',
    notice: 'warning',
    private: 'success',
  }
  return type ? map[type] : undefined
}

function messageTypeLabel(type?: string): string {
  const map: Record<string, string> = {
    system: t('message.systemMessage'),
    notice: t('message.announcement'),
    private: t('message.privateMessage'),
  }
  return type ? map[type] || type : t('message.systemMessage')
}

async function handlePopoverShow(): Promise<void> {
  await Promise.all([notificationStore.fetchNotices(), notificationStore.fetchMessages()])
}

async function handleNoticeClick(item: Notice): Promise<void> {
  popoverVisible.value = false
  noticeDetailLoading.value = true
  noticeDetailVisible.value = true
  try {
    const res = await noticeApi.getById(item.id)
    noticeDetail.value = res.data
    if (!item.read) {
      await notificationStore.markNoticeRead(item.id)
    }
  } catch {
    ElMessage.error(t('notification.fetchFailed'))
    noticeDetailVisible.value = false
  } finally {
    noticeDetailLoading.value = false
  }
}

async function handleMessageClick(item: Message): Promise<void> {
  popoverVisible.value = false
  messageDetail.value = item
  messageDetailVisible.value = true
  if (!isMessageRead(item)) {
    try {
      await notificationStore.markMessageRead(item.id)
      item.isRead = true
      item.read = true
    } catch {
      // ignore
    }
  } else {
    try {
      const res = await messageApi.getById(item.id)
      messageDetail.value = res.data || item
    } catch {
      // keep list item content
    }
  }
}

async function handleMarkAllRead(): Promise<void> {
  try {
    if (activeTab.value === 'notice') {
      if (notificationStore.unreadNoticeCount === 0) {
        ElMessage.info(t('notification.noUnread'))
        return
      }
      await notificationStore.markAllNoticesRead()
    } else {
      if (notificationStore.unreadMessageCount === 0) {
        ElMessage.info(t('notification.noUnreadMessages'))
        return
      }
      await notificationStore.markAllMessagesRead()
    }
    ElMessage.success(t('notification.markAllReadSuccess'))
  } catch (err: unknown) {
    const error = err as { message?: string }
    ElMessage.error(t('notification.operationFailed') + ': ' + (error.message || t('common.unknownError')))
  }
}

function goToMore(): void {
  popoverVisible.value = false
  router.push(activeTab.value === 'notice' ? '/notices' : '/messages')
}

function formatTime(time?: string): string {
  if (!time) return ''
  const d = new Date(time)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  if (diff < 60000) return t('notification.justNow')
  if (diff < 3600000) return `${Math.floor(diff / 60000)}${t('notification.minutesAgo')}`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}${t('notification.hoursAgo')}`
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function formatAbsoluteTime(time?: string): string {
  if (!time) return '-'
  return new Date(time).toLocaleString()
}

let offKicked: (() => void) | undefined

onMounted(() => {
  notificationStore.connectSSE()
  notificationStore.refreshUnreadCounts()
  offKicked = notificationStore.onSSE('kicked', (payload) => {
    let msg = t('notification.forceOfflineMessage')
    if (payload && typeof payload === 'object' && 'reason' in payload) {
      msg = String((payload as { reason?: string }).reason || msg)
    }
    notificationStore.disconnectSSE()
    performLogout(msg)
  })
})

onUnmounted(() => {
  offKicked?.()
})
</script>

<style lang="scss" scoped>
.notice-badge {
  cursor: pointer;
  padding: 8px 10px;
  border-radius: 16px;
  transition: background-color 0.2s;
}

.notice-badge:hover {
  background-color: var(--hover-bg);
}

.notice-icon {
  color: var(--text-regular);
  transition: color 0.2s;
}

.notice-icon:hover {
  color: var(--mainColor);
}

.notice-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 4px;
}

.notice-title {
  font-weight: 500;
  font-size: 15px;
  color: var(--text-primary);
}

.notice-tabs {
  margin-top: 4px;
}

.notice-list {
  max-height: 360px;
  overflow-y: auto;
}

.notice-empty {
  text-align: center;
  color: var(--text-secondary);
  padding: 24px 0;
  font-size: 14px;
}

.notice-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 4px;
  cursor: pointer;
  transition: background-color 0.15s;
}

.notice-item:hover {
  background-color: var(--notice-hover-bg);
}

.notice-item.unread {
  background-color: var(--notice-unread-bg);
}

.notice-item.unread:hover {
  background-color: var(--mainColor-bg);
}

.notice-item-left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.notice-type-tag {
  flex-shrink: 0;
}

.notice-item-title {
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--text-regular);
}

.notice-item-right {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  margin-left: 8px;
}

.notice-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: #f56c6c;
}

.notice-time {
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
}

.notice-footer {
  text-align: center;
  padding: 2px 0;
}

.notice-detail-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 4px 0;
}

.notice-detail-info {
  font-size: 13px;
  color: var(--text-secondary);
}

.notice-detail-content {
  min-height: 200px;
  padding: 0 4px 16px;
  line-height: 1.8;
}

.notice-detail-content :deep(.md-editor-preview) {
  padding: 0;
}
</style>

<style lang="scss">
.notice-popover {
  background-color: var(--card-bg) !important;
  border: 1px solid var(--border-color) !important;

  .el-popover__title {
    color: var(--text-primary);
  }

  .el-divider {
    border-top-color: var(--border-light) !important;
  }
}
</style>
