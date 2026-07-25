/**
 * Notification Store - 通知与消息状态管理
 *
 * 职责：
 * - 通知/消息未读数全局同步
 * - SSE 连接管理（委托给 useSSE composable）
 * - 铃铛预览列表缓存
 */
import { defineStore } from 'pinia'
import { ElNotification } from 'element-plus'
import { ref, computed } from 'vue'
import { noticeApi } from '@/api/notice'
import { messageApi } from '@/api/message'
import { useSSE } from '@/composables/useSSE'
import type { Notice, Message } from '@/types/api'

function isMessageRead(message: Message): boolean {
  if (typeof message.isRead === 'boolean') return message.isRead
  if (typeof message.read === 'boolean') return message.read
  return false
}

function normalizeMessage(message: Message): Message {
  const isRead = isMessageRead(message)
  return {
    ...message,
    isRead,
    read: isRead,
  }
}

function normalizeUnreadCount(data?: { count?: number; total?: number } | null): number {
  if (!data) return 0
  if (typeof data.count === 'number') return data.count
  if (typeof data.total === 'number') return data.total
  return 0
}

export const useNotificationStore = defineStore('notification', () => {
  // ==================== State ====================

  /** 通知列表（用户视角，含已读状态） */
  const notices = ref<Notice[]>([])

  /** 站内消息列表 */
  const messages = ref<Message[]>([])

  /** 未读通知数 */
  const unreadNoticeCount = ref(0)

  /** 未读消息数 */
  const unreadMessageCount = ref(0)

  /** 通知加载状态 */
  const loading = ref(false)

  // ==================== SSE 连接管理 ====================
  const sse = useSSE({
    url: '/api/v1/notices/sse',
    heartbeatInterval: 30_000,
    reconnect: { initialDelay: 3_000, maxDelay: 30_000, multiplier: 1.5 },
    maxRetries: -1,
  })

  /** SSE 连接状态（透传） */
  const sseConnected = computed(() => sse.connected.value)

  sse.on('notice-published', (payload) => {
    const source =
      payload && typeof payload === 'object' && 'notice' in payload && payload.notice
        ? (payload.notice as unknown as Partial<Notice> & { time?: string; type?: Notice['type']; title?: string; id?: number })
        : (payload as unknown as Partial<Notice> & { time?: string; type?: Notice['type']; title?: string; id?: number })

    const notice: Notice = {
      id: Number(source.id || 0),
      title: String(source.title || '新通知'),
      type: (source.type as Notice['type']) || 'notice',
      publishTime: String(source.publishTime || source.time || ''),
      content: typeof source.content === 'string' ? source.content : undefined,
      read: false,
    }

    if (notice.id) {
      notices.value = [notice, ...notices.value.filter((item) => item.id !== notice.id)]
    } else {
      notices.value.unshift(notice)
    }
    unreadNoticeCount.value++

    // SSE 推送后即时桌面提醒
    const typeLabel = notice.type === 'announcement' ? '公告' : '通知'
    const contentPreview =
      typeof notice.content === 'string' && notice.content.trim()
        ? notice.content
            .replace(/[#>*_`[\]()]/g, '')
            .replace(/\s+/g, ' ')
            .slice(0, 80)
        : ''
    ElNotification({
      title: `新${typeLabel}`,
      message: contentPreview ? `${notice.title}\n${contentPreview}` : notice.title,
      type: 'info',
      duration: 4500,
      position: 'top-right',
    })
  })

  sse.on('notice-removed', (payload) => {
    const id = payload && typeof payload === 'object' && 'id' in payload ? Number((payload as unknown as { id: number }).id) : null
    if (id == null) return
    const target = notices.value.find((n) => n.id === id)
    notices.value = notices.value.filter((n) => n.id !== id)
    if (target && !target.read && unreadNoticeCount.value > 0) {
      unreadNoticeCount.value--
    }
  })

  sse.on('connected', () => {
    fetchNotices()
    fetchMessages()
  })

  // ==================== Getters ====================

  /** 总未读数量 */
  const totalUnread = computed(() => unreadNoticeCount.value + unreadMessageCount.value)

  /** 是否有未读 */
  const hasUnread = computed(() => totalUnread.value > 0)

  // ==================== Actions ====================

  /**
   * 获取通知列表与未读数
   */
  async function fetchNotices(): Promise<void> {
    loading.value = true
    try {
      const [listRes, countRes] = await Promise.all([noticeApi.listUser(), noticeApi.getUnreadCount()])
      notices.value = listRes.data?.items || []
      unreadNoticeCount.value = normalizeUnreadCount(countRes.data) || listRes.data?.unread || 0
    } catch {
      // 通知列表获取失败，保持旧数据不变
    } finally {
      loading.value = false
    }
  }

  /**
   * 获取消息列表与未读数
   */
  async function fetchMessages(): Promise<void> {
    try {
      const [listRes, countRes] = await Promise.all([messageApi.list({ page: 1, pageSize: 10 }), messageApi.getUnreadCount()])
      const rows = (listRes.data?.rows || []).map(normalizeMessage)
      messages.value = rows
      const unreadFromList = typeof listRes.data?.unreadCount === 'number' ? listRes.data.unreadCount : undefined
      unreadMessageCount.value = normalizeUnreadCount(countRes.data) || unreadFromList || rows.filter((m) => !isMessageRead(m)).length
    } catch {
      // 消息列表获取失败，忽略
    }
  }

  /**
   * 刷新全部未读数
   */
  async function refreshUnreadCounts(): Promise<void> {
    try {
      const [noticeCountRes, messageCountRes] = await Promise.all([noticeApi.getUnreadCount(), messageApi.getUnreadCount()])
      unreadNoticeCount.value = normalizeUnreadCount(noticeCountRes.data)
      unreadMessageCount.value = normalizeUnreadCount(messageCountRes.data)
    } catch {
      // 未读数刷新失败，忽略
    }
  }

  /**
   * 标记通知为已读
   */
  async function markNoticeRead(noticeId: number): Promise<void> {
    const notice = notices.value.find((n) => n.id === noticeId)
    if (notice && !notice.read) {
      notice.read = true
      if (unreadNoticeCount.value > 0) {
        unreadNoticeCount.value--
      }
    }
    try {
      await noticeApi.markRead(noticeId)
    } catch {
      // 同步失败不影响本地体验
    }
  }

  /**
   * 全部标记通知为已读
   */
  async function markAllNoticesRead(): Promise<void> {
    notices.value.forEach((n) => {
      n.read = true
    })
    unreadNoticeCount.value = 0
    try {
      await noticeApi.markAllRead()
    } catch {
      // 同步失败不影响本地体验
    }
  }

  /**
   * 标记消息为已读
   */
  async function markMessageRead(messageId: number): Promise<void> {
    const msg = messages.value.find((m) => m.id === messageId)
    if (msg && !isMessageRead(msg)) {
      msg.isRead = true
      msg.read = true
      if (unreadMessageCount.value > 0) {
        unreadMessageCount.value--
      }
    }
    try {
      await messageApi.markRead(messageId)
    } catch {
      // 同步失败不影响本地体验
    }
  }

  /**
   * 全部标记消息为已读
   */
  async function markAllMessagesRead(): Promise<void> {
    messages.value.forEach((m) => {
      m.isRead = true
      m.read = true
    })
    unreadMessageCount.value = 0
    try {
      await messageApi.markAllRead()
    } catch {
      // 同步失败不影响本地体验
    }
  }

  /**
   * 建立 SSE 连接
   */
  function connectSSE(): void {
    sse.connect()
  }

  /**
   * 断开 SSE 连接
   */
  function disconnectSSE(): void {
    sse.disconnect()
  }

  /**
   * 重置所有状态
   */
  function reset(): void {
    disconnectSSE()
    notices.value = []
    messages.value = []
    unreadNoticeCount.value = 0
    unreadMessageCount.value = 0
    loading.value = false
  }

  return {
    // State
    notices,
    messages,
    unreadNoticeCount,
    unreadMessageCount,
    loading,
    sseConnected,
    // Getters
    totalUnread,
    hasUnread,
    // Actions
    fetchNotices,
    fetchMessages,
    refreshUnreadCounts,
    markNoticeRead,
    markAllNoticesRead,
    markMessageRead,
    markAllMessagesRead,
    connectSSE,
    disconnectSSE,
    onSSE: sse.on,
    reset,
  }
})
