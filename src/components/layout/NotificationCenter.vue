<template>
  <div class="notification-center">
    <el-popover placement="bottom" :width="380" trigger="click" :visible="noticePopoverVisible" popper-class="notice-popover" @show="fetchNoticeList">
      <template #reference>
        <el-badge :value="unreadCount" :hidden="unreadCount === 0" class="notice-badge">
          <el-icon :size="18" class="notice-icon" @click="noticePopoverVisible = !noticePopoverVisible">
            <Bell />
          </el-icon>
        </el-badge>
      </template>
      <div class="notice-header">
        <span class="notice-title">{{ t('notification.title') }}</span>
        <el-button v-if="unreadCount > 0" type="primary" link size="small" @click="handleMarkAllRead">
          {{ t('notification.readAll') }}
        </el-button>
      </div>
      <el-divider style="margin: 4px 0" />
      <div v-loading="noticeLoading" class="notice-list">
        <div v-if="noticeItems.length === 0" class="notice-empty">
          {{ t('notification.noNotices') }}
        </div>
        <div v-for="item in noticeItems" :key="item.id" class="notice-item" :class="{ unread: !item.read }" @click="handleNoticeClick(item)">
          <div class="notice-item-left">
            <el-tag :type="item.type === 'notice' ? 'primary' : 'warning'" size="small" class="notice-type-tag">
              {{ item.type === 'notice' ? t('notification.notice') : t('notification.announcement') }}
            </el-tag>
            <span class="notice-item-title">{{ item.title }}</span>
          </div>
          <div class="notice-item-right">
            <span v-if="!item.read" class="notice-dot" />
            <span class="notice-time">{{ formatTime(item.publishTime) }}</span>
          </div>
        </div>
      </div>
      <el-divider style="margin: 4px 0" />
      <div class="notice-footer">
        <el-button type="primary" link size="small" @click="goToNoticeManager">
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
      <div v-if="noticeDetail" class="notice-detail-meta">
        <el-tag :type="noticeDetail.type === 'notice' ? 'primary' : 'warning'" size="small">
          {{ noticeDetail.type === 'notice' ? t('notification.notice') : t('notification.announcement') }}
        </el-tag>
        <span class="notice-detail-info">{{ t('notification.publisherLabel') }}{{ noticeDetail.publisherName || '-' }}</span>
        <span class="notice-detail-info">{{ noticeDetail.publishTime ? new Date(noticeDetail.publishTime).toLocaleString() : '-' }}</span>
      </div>
      <el-divider v-if="noticeDetail" />
      <div v-loading="noticeDetailLoading" class="notice-detail-content">
        <MdPreview v-if="noticeDetail?.content" :model-value="noticeDetail.content" />
        <el-empty v-else-if="!noticeDetailLoading" :description="t('notification.noContent')" />
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { defineAsyncComponent } from 'vue'
import { Bell } from '@element-plus/icons-vue'
import { noticeApi } from '@/api'
import { performLogout } from '@/utils/request'
import { useSSE } from '@/composables/useSSE'
import { useNotificationStore } from '@/stores'
import { useI18n } from '@/i18n'
import type { Notice } from '@/types/api'

const router = useRouter()
const notificationStore = useNotificationStore()
const { t } = useI18n()
const emit = defineEmits<{ unreadChange: [count: number] }>()

// MdPreview 仅在打开通知详情对话框时渲染，懒加载避免把 md-editor chunk 拉入首屏
// setupMdEditor（含 highlight/katex/mermaid/echarts）同样动态导入，确保不进首屏静态图
const MdPreview = defineAsyncComponent(async () => {
  const { setupMdEditor } = await import('@/utils/mdEditorSetup')
  await import('md-editor-v3/lib/style.css')
  setupMdEditor()
  const mod = await import('md-editor-v3')
  return mod.MdPreview
})
const noticePopoverVisible = ref(false)
const unreadCount = ref(0)
const noticeItems = ref<Notice[]>([])
const noticeLoading = ref(false)
const noticeDetailVisible = ref(false)
const noticeDetail = ref<Notice | null>(null)
const noticeDetailLoading = ref(false)

// SSE 连接管理（委托给 useSSE composable，自动指数退避重连 + 心跳）
const sse = useSSE({
  url: '/api/v1/notices/sse',
  heartbeatInterval: 30_000,
  reconnect: { initialDelay: 3_000, maxDelay: 30_000, multiplier: 1.5 },
})

const fetchUnreadCount = async (): Promise<void> => {
  try {
    const res = await noticeApi.list({ page: 1, pageSize: 1 })
    unreadCount.value = res.data?.total || 0
    emit('unreadChange', unreadCount.value)
    // 同步到 notificationStore
    notificationStore.fetchNotices()
  } catch {
    // 忽略
  }
}

const fetchNoticeList = async (): Promise<void> => {
  noticeLoading.value = true
  try {
    const res = await noticeApi.list({ page: 1, pageSize: 10 })
    noticeItems.value = res.data?.rows || []
    // 从通知详情中提取未读数
    emit('unreadChange', unreadCount.value)
  } catch {
    // 忽略
  } finally {
    noticeLoading.value = false
  }
}

const handleNoticeClick = async (item: Notice): Promise<void> => {
  noticePopoverVisible.value = false
  noticeDetailLoading.value = true
  noticeDetailVisible.value = true
  try {
    const res = await noticeApi.getById(item.id)
    noticeDetail.value = res.data
    if (!item.read) {
      await noticeApi.markRead(item.id)
      item.read = true
      unreadCount.value = Math.max(0, unreadCount.value - 1)
      emit('unreadChange', unreadCount.value)
      notificationStore.markNoticeRead(item.id)
    }
  } catch {
    ElMessage.error(t('notification.fetchFailed'))
    noticeDetailVisible.value = false
  } finally {
    noticeDetailLoading.value = false
  }
}

const handleMarkAllRead = async (): Promise<void> => {
  try {
    // 使用批量标记接口
    const ids = noticeItems.value.filter((n) => !n.read).map((n) => n.id)
    if (ids.length === 0) {
      ElMessage.info(t('notification.noUnread'))
      return
    }
    await Promise.all(ids.map((id) => noticeApi.markRead(id)))
    noticeItems.value.forEach((i) => {
      i.read = true
    })
    unreadCount.value = 0
    emit('unreadChange', unreadCount.value)
    ElMessage.success(t('notification.markAllReadSuccess'))
  } catch (err: unknown) {
    const error = err as { message?: string }
    ElMessage.error(t('notification.operationFailed') + ': ' + (error.message || t('common.unknownError')))
  }
}

const goToNoticeManager = (): void => {
  noticePopoverVisible.value = false
  router.push('/notices')
}

const formatTime = (time?: string): string => {
  if (!time) return ''
  const d = new Date(time)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  if (diff < 60000) return t('notification.justNow')
  if (diff < 3600000) return `${Math.floor(diff / 60000)}${t('notification.minutesAgo')}`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}${t('notification.hoursAgo')}`
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// 注册 SSE 事件处理器
sse.on('connected', () => {
  fetchUnreadCount()
})

sse.on('notice-published', () => {
  fetchUnreadCount()
  if (noticePopoverVisible.value) {
    fetchNoticeList()
  }
})

sse.on('notice-removed', () => {
  fetchUnreadCount()
  if (noticePopoverVisible.value) {
    fetchNoticeList()
  }
})

// 被管理员强制下线
sse.on('kicked', (payload) => {
  let msg = t('notification.forceOfflineMessage')
  if (payload && typeof payload === 'object' && 'reason' in payload) {
    msg = String((payload as { reason?: string }).reason || msg)
  }
  sse.disconnect()
  performLogout(msg)
})

onMounted(() => {
  fetchUnreadCount()
  sse.connect()
})

onUnmounted(() => {
  sse.disconnect()
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

<!-- Popover 弹窗被 teleport 到 body，需要非 scoped 全局样式兼容深色模式 -->
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
