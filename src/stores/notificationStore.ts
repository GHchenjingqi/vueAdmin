/**
 * Notification Store - 通知与消息状态管理
 *
 * 职责：
 * - 通知未读数全局同步
 * - SSE 连接管理（委托给 useSSE composable）
 * - 消息列表缓存
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { noticeApi } from '@/api/notice'
import { useSSE } from '@/composables/useSSE'
import type { Notice, Message } from '@/types/api'

export const useNotificationStore = defineStore('notification', () => {
  // ==================== State ====================

  /** 通知列表 */
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
  // 委托给 useSSE composable（指数退避重连 + 心跳）

  const sse = useSSE({
    url: '/api/v1/notices/sse',
    heartbeatInterval: 30_000,
    reconnect: { initialDelay: 3_000, maxDelay: 30_000, multiplier: 1.5 },
    maxRetries: -1,
  })

  /** SSE 连接状态（透传） */
  const sseConnected = computed(() => sse.connected.value)

  // 注册 SSE 事件处理器
  sse.on('notice-published', (payload) => {
    if (payload.notice) {
      notices.value.unshift(payload.notice as Notice)
    }
    unreadNoticeCount.value++
  })

  sse.on('notice-removed', () => {
    // 服务端通知删除，可选：从前端列表中移除
  })

  sse.on('connected', () => {
    // 连接建立时可选刷新一次列表
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
   * 获取通知列表
   */
  async function fetchNotices(): Promise<void> {
    loading.value = true
    try {
      const res = await noticeApi.list({ page: 1, pageSize: 10 })
      notices.value = res.data?.rows || []
      // 通过专用接口获取真正的未读数，而非使用分页 total
      const countRes = await noticeApi.getUnreadCount()
      unreadNoticeCount.value = countRes.data?.count || 0
    } catch {
      // 通知列表获取失败，保持旧数据不变
    } finally {
      loading.value = false
    }
  }

  /**
   * 获取消息列表
   */
  async function fetchMessages(): Promise<void> {
    try {
      const { messageApi } = await import('@/api/message')
      const res = await messageApi.list({ page: 1, pageSize: 10 })
      messages.value = res.data?.rows || []
      // 统计未读数
      unreadMessageCount.value = res.data?.rows?.filter((m: Message) => !m.read).length || 0
    } catch {
      // 消息列表获取失败，忽略
    }
  }

  /**
   * 标记通知为已读
   */
  async function markNoticeRead(noticeId: number): Promise<void> {
    // 乐观更新本地状态
    const notice = notices.value.find((n) => n.id === noticeId)
    if (notice && !notice.read) {
      notice.read = true
      if (unreadNoticeCount.value > 0) {
        unreadNoticeCount.value--
      }
    }
    // 同步到后端
    try {
      await noticeApi.markRead(noticeId)
    } catch {
      // 同步失败不影响本地体验
    }
  }

  /**
   * 标记消息为已读
   */
  async function markMessageRead(messageId: number): Promise<void> {
    const msg = messages.value.find((m) => m.id === messageId)
    if (msg && !msg.read) {
      msg.read = true
      if (unreadMessageCount.value > 0) {
        unreadMessageCount.value--
      }
    }
    // 同步到后端
    try {
      const { messageApi } = await import('@/api/message')
      await messageApi.markRead(messageId)
    } catch {
      // 同步失败不影响本地体验
    }
  }

  /**
   * 建立 SSE 连接（通过 useSSE 自动处理 ticket 和重连）
   */
  function connectSSE(): void {
    sse.connect()
  }

  /**
   * 断开 SSE 连接（主动断开，不再重连）
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
    markNoticeRead,
    markMessageRead,
    connectSSE,
    disconnectSSE,
    reset,
  }
})
