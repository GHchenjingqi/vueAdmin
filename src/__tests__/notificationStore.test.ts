/**
 * notificationStore.ts 单元测试
 * 覆盖：通知/消息状态管理、SSE 事件处理、乐观更新
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const elNotificationMock = vi.fn()
vi.mock('element-plus', () => ({
  ElNotification: (...args: unknown[]) => elNotificationMock(...args),
}))
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@/api/notice', () => ({
  noticeApi: {
    list: vi.fn(() => Promise.resolve({ data: { rows: [], total: 0 } })),
    listUser: vi.fn(() => Promise.resolve({ data: { items: [], unread: 0 } })),
    getUnreadCount: vi.fn(() => Promise.resolve({ data: { count: 0, total: 0 } })),
    markRead: vi.fn(() => Promise.resolve()),
    markAllRead: vi.fn(() => Promise.resolve()),
  },
}))

vi.mock('@/api/message', () => ({
  messageApi: {
    list: vi.fn(() => Promise.resolve({ data: { rows: [], total: 0, unreadCount: 0 } })),
    getUnreadCount: vi.fn(() => Promise.resolve({ data: { count: 0 } })),
    markRead: vi.fn(() => Promise.resolve()),
    markAllRead: vi.fn(() => Promise.resolve()),
  },
}))

const mockSSE = {
  connected: { value: false },
  on: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
}

vi.mock('@/composables/useSSE', () => ({
  useSSE: vi.fn(() => mockSSE),
}))

import { useNotificationStore } from '../stores/notificationStore'
import { noticeApi } from '@/api/notice'
import { messageApi } from '@/api/message'

describe('notificationStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    elNotificationMock.mockClear()
    mockSSE.connected.value = false
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('初始状态', () => {
    it('notices 为空数组', () => {
      const store = useNotificationStore()
      expect(store.notices).toEqual([])
    })

    it('messages 为空数组', () => {
      const store = useNotificationStore()
      expect(store.messages).toEqual([])
    })

    it('未读数为 0', () => {
      const store = useNotificationStore()
      expect(store.unreadNoticeCount).toBe(0)
      expect(store.unreadMessageCount).toBe(0)
    })

    it('loading 为 false', () => {
      const store = useNotificationStore()
      expect(store.loading).toBe(false)
    })

    it('sseConnected 为 false', () => {
      const store = useNotificationStore()
      expect(store.sseConnected).toBe(false)
    })
  })

  describe('totalUnread', () => {
    it('计算通知 + 消息的总未读数', () => {
      const store = useNotificationStore()
      store.unreadNoticeCount = 3
      store.unreadMessageCount = 2
      expect(store.totalUnread).toBe(5)
    })

    it('未读数为 0 时返回 0', () => {
      const store = useNotificationStore()
      expect(store.totalUnread).toBe(0)
    })
  })

  describe('hasUnread', () => {
    it('有未读时返回 true', () => {
      const store = useNotificationStore()
      store.unreadNoticeCount = 1
      expect(store.hasUnread).toBe(true)
    })

    it('无未读时返回 false', () => {
      const store = useNotificationStore()
      expect(store.hasUnread).toBe(false)
    })
  })

  describe('fetchNotices', () => {
    it('成功获取通知列表', async () => {
      const mockNotices = [
        { id: 1, title: '通知1', read: false },
        { id: 2, title: '通知2', read: true },
      ]
      vi.mocked(noticeApi.listUser).mockResolvedValueOnce({
        data: { items: mockNotices, unread: 1 },
      } as any)
      vi.mocked(noticeApi.getUnreadCount).mockResolvedValueOnce({
        data: { count: 1, total: 1 },
      } as any)

      const store = useNotificationStore()
      await store.fetchNotices()

      expect(store.notices).toEqual(mockNotices)
      expect(store.unreadNoticeCount).toBe(1)
      expect(store.loading).toBe(false)
    })

    it('获取失败时保持旧数据', async () => {
      vi.mocked(noticeApi.listUser).mockRejectedValueOnce(new Error('网络错误'))

      const store = useNotificationStore()
      store.notices = [{ id: 99, title: '旧通知' } as any]
      await store.fetchNotices()

      expect(store.notices).toHaveLength(1)
      expect(store.notices[0].id).toBe(99)
      expect(store.loading).toBe(false)
    })
  })

  describe('fetchMessages', () => {
    it('使用后端 unreadCount / getUnreadCount', async () => {
      vi.mocked(messageApi.list).mockResolvedValueOnce({
        data: {
          rows: [
            { id: 1, title: 'm1', isRead: false },
            { id: 2, title: 'm2', isRead: true },
          ],
          total: 2,
          unreadCount: 3,
        },
      } as any)
      vi.mocked(messageApi.getUnreadCount).mockResolvedValueOnce({
        data: { count: 3 },
      } as any)

      const store = useNotificationStore()
      await store.fetchMessages()

      expect(store.messages).toHaveLength(2)
      expect(store.messages[0].read).toBe(false)
      expect(store.unreadMessageCount).toBe(3)
    })
  })

  describe('markNoticeRead', () => {
    it('乐观更新本地状态', async () => {
      const store = useNotificationStore()
      store.notices = [
        { id: 1, title: '未读通知', read: false },
        { id: 2, title: '已读通知', read: true },
      ] as any
      store.unreadNoticeCount = 1

      await store.markNoticeRead(1)

      expect(store.notices[0].read).toBe(true)
      expect(store.unreadNoticeCount).toBe(0)
      expect(noticeApi.markRead).toHaveBeenCalledWith(1)
    })

    it('标记已读通知不会重复减计数', async () => {
      const store = useNotificationStore()
      store.notices = [{ id: 1, title: '已读', read: true }] as any
      store.unreadNoticeCount = 0

      await store.markNoticeRead(1)

      expect(store.unreadNoticeCount).toBe(0)
    })

    it('同步失败不影响本地状态', async () => {
      vi.mocked(noticeApi.markRead).mockRejectedValueOnce(new Error('网络错误'))

      const store = useNotificationStore()
      store.notices = [{ id: 1, title: '未读', read: false }] as any
      store.unreadNoticeCount = 1

      await expect(store.markNoticeRead(1)).resolves.toBeUndefined()
      expect(store.notices[0].read).toBe(true)
    })
  })

  describe('markMessageRead', () => {
    it('兼容 isRead 字段并减少未读数', async () => {
      const store = useNotificationStore()
      store.messages = [{ id: 1, title: '未读', isRead: false }] as any
      store.unreadMessageCount = 1

      await store.markMessageRead(1)

      expect(store.messages[0].isRead).toBe(true)
      expect(store.messages[0].read).toBe(true)
      expect(store.unreadMessageCount).toBe(0)
      expect(messageApi.markRead).toHaveBeenCalledWith(1)
    })
  })

  describe('connectSSE / disconnectSSE', () => {
    it('connectSSE 调用 sse.connect', () => {
      const store = useNotificationStore()
      store.connectSSE()
      expect(mockSSE.connect).toHaveBeenCalled()
    })

    it('disconnectSSE 调用 sse.disconnect', () => {
      const store = useNotificationStore()
      store.disconnectSSE()
      expect(mockSSE.disconnect).toHaveBeenCalled()
    })
  })

  describe('reset', () => {
    it('重置所有状态', () => {
      const store = useNotificationStore()
      store.notices = [{ id: 1 }] as any
      store.messages = [{ id: 2 }] as any
      store.unreadNoticeCount = 5
      store.unreadMessageCount = 3
      store.loading = true

      store.reset()

      expect(store.notices).toEqual([])
      expect(store.messages).toEqual([])
      expect(store.unreadNoticeCount).toBe(0)
      expect(store.unreadMessageCount).toBe(0)
      expect(store.loading).toBe(false)
      expect(mockSSE.disconnect).toHaveBeenCalled()
    })
  })

  describe('SSE 事件注册', () => {
    it('注册 notice-published 事件处理器', () => {
      useNotificationStore()
      expect(mockSSE.on).toHaveBeenCalledWith('notice-published', expect.any(Function))
    })

    it('注册 notice-removed 事件处理器', () => {
      useNotificationStore()
      expect(mockSSE.on).toHaveBeenCalledWith('notice-removed', expect.any(Function))
    })

    it('注册 connected 事件处理器', () => {
      useNotificationStore()
      expect(mockSSE.on).toHaveBeenCalledWith('connected', expect.any(Function))
    })

    it('notice-published 事件增加未读数并插入通知', () => {
      const store = useNotificationStore()
      const call = mockSSE.on.mock.calls.find((c) => c[0] === 'notice-published')
      const handler = call?.[1] as (payload: any) => void

      handler({ notice: { id: 10, title: '新通知', content: '这是内容摘要' } })

      expect(store.notices).toHaveLength(1)
      expect(store.notices[0].id).toBe(10)
      expect(store.unreadNoticeCount).toBe(1)
      expect(elNotificationMock).toHaveBeenCalled()
      expect(elNotificationMock.mock.calls[0][0].title).toContain('通知')
      expect(elNotificationMock.mock.calls[0][0].message).toContain('新通知')
    })

    it('connected 事件触发 fetchNotices 和 fetchMessages', async () => {
      vi.mocked(noticeApi.listUser).mockResolvedValueOnce({ data: { items: [], unread: 0 } } as any)
      vi.mocked(noticeApi.getUnreadCount).mockResolvedValueOnce({ data: { count: 0, total: 0 } } as any)
      vi.mocked(messageApi.list).mockResolvedValueOnce({ data: { rows: [], total: 0, unreadCount: 0 } } as any)
      vi.mocked(messageApi.getUnreadCount).mockResolvedValueOnce({ data: { count: 0 } } as any)

      useNotificationStore()
      const call = mockSSE.on.mock.calls.find((c) => c[0] === 'connected')
      const handler = call?.[1] as () => void

      handler()
      await new Promise((resolve) => setTimeout(resolve, 10))

      expect(noticeApi.listUser).toHaveBeenCalled()
      expect(messageApi.list).toHaveBeenCalled()
    })
  })
})
