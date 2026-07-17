/**
 * useSSE Composable 单元测试
 *
 * 测试策略：
 * - MockEventSource 模拟浏览器 EventSource
 * - 真实 setTimeout（不用 fake timers，避免异步兼容性问题）
 * - 显式调用 es.open() 模拟浏览器触发 onopen
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ─── Mock EventSource ────────────────────────────────────────────────────────
class MockEventSource {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSED = 2

  readyState: number = MockEventSource.CONNECTING
  url: string
  onopen: ((event: Event) => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  listeners = new Map<string, (e: MessageEvent) => void>()

  static instances: MockEventSource[] = []

  constructor(url: string) {
    this.url = url
    MockEventSource.instances.push(this)
  }

  addEventListener(type: string, fn: (e: MessageEvent) => void): void {
    this.listeners.set(type, fn)
  }

  removeEventListener(type: string): void {
    this.listeners.delete(type)
  }

  /** 手动触发 onopen（模拟浏览器行为） */
  triggerOpen(): void {
    this.readyState = MockEventSource.OPEN
    this.onopen?.({} as Event)
  }

  /** 手动触发 onerror（模拟连接失败） */
  triggerError(): void {
    this.readyState = MockEventSource.CLOSED
    this.onerror?.({} as Event)
  }

  /** 触发具名事件 */
  emit(type: string, data: string): void {
    this.listeners.get(type)?.({ data } as MessageEvent)
  }

  close(): void {
    this.readyState = MockEventSource.CLOSED
    MockEventSource.instances = MockEventSource.instances.filter((i) => i !== this)
  }
}

// 替换全局 EventSource（为 enable-testing 使用 MockEventSource）
;(globalThis as unknown as { EventSource: typeof EventSource }).EventSource = MockEventSource as unknown as typeof EventSource

// ─── Mock 依赖 ───────────────────────────────────────────────────────────────
vi.mock('@/api/auth', () => ({
  authApi: {
    sseTicket: vi.fn().mockResolvedValue({ data: { ticket: 'mock-ticket-xxx' } }),
  },
}))

vi.mock('@/utils/request', () => ({
  getAccessToken: vi.fn().mockReturnValue('mock-token'),
  setAccessToken: vi.fn(),
}))

// ─── 测试 ────────────────────────────────────────────────────────────────────
describe('useSSE composable', () => {
  beforeEach(() => {
    MockEventSource.instances = []
    vi.clearAllMocks()
  })

  afterEach(() => {
    MockEventSource.instances.forEach((es) => es.close())
    MockEventSource.instances = []
  })

  // ── connect() ──────────────────────────────────────────────────────────────

  it('connect() 创建 EventSource 并包含带 ticket 的正确 URL', async () => {
    const { useSSE } = await import('@/composables/useSSE')
    const sse = useSSE({ url: '/api/notices/sse' })

    sse.connect()
    await new Promise((r) => setTimeout(r, 10))

    const es = MockEventSource.instances[0]
    expect(es).toBeDefined()
    expect(es.url).toBe('/api/notices/sse?ticket=mock-ticket-xxx')
    sse.disconnect()
  })

  it('connected.value 在 onopen 触发后为 true', async () => {
    const { useSSE } = await import('@/composables/useSSE')
    const sse = useSSE({ url: '/api/test' })

    sse.connect()
    await new Promise((r) => setTimeout(r, 10))

    // 模拟浏览器触发 onopen
    MockEventSource.instances[0].triggerOpen()
    expect(sse.connected.value).toBe(true)

    sse.disconnect()
  })

  it('disconnect() 关闭连接并重置状态', async () => {
    const { useSSE } = await import('@/composables/useSSE')
    const sse = useSSE({ url: '/api/test' })

    sse.connect()
    await new Promise((r) => setTimeout(r, 10))
    MockEventSource.instances[0].triggerOpen()
    sse.disconnect()

    expect(MockEventSource.instances.length).toBe(0)
    expect(sse.connected.value).toBe(false)
  })

  // ── 事件订阅 ───────────────────────────────────────────────────────────────

  it('on() 注册 notice-published 处理器', async () => {
    const { useSSE } = await import('@/composables/useSSE')
    const handler = vi.fn()
    const sse = useSSE({ url: '/api/test' })

    sse.on('notice-published', handler)
    sse.connect()
    await new Promise((r) => setTimeout(r, 10))

    MockEventSource.instances[0].emit('notice-published', '{"type":"notice-published","notice":{"id":1}}')
    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ type: 'notice-published' }), expect.any(Object))

    sse.disconnect()
  })

  it('on() 返回的 off() 取消订阅', async () => {
    const { useSSE } = await import('@/composables/useSSE')
    const handler = vi.fn()
    const sse = useSSE({ url: '/api/test' })

    const off = sse.on('notice-published', handler)
    off()

    sse.connect()
    await new Promise((r) => setTimeout(r, 10))

    MockEventSource.instances[0].emit('notice-published', '{"type":"notice-published"}')
    expect(handler).not.toHaveBeenCalled()

    sse.disconnect()
  })

  it('connected 事件在 onopen 触发时调用', async () => {
    const { useSSE } = await import('@/composables/useSSE')
    const handler = vi.fn()
    const sse = useSSE({ url: '/api/test' })

    sse.on('connected', handler)
    sse.connect()
    await new Promise((r) => setTimeout(r, 10))

    MockEventSource.instances[0].triggerOpen()
    expect(handler).toHaveBeenCalledTimes(1)

    sse.disconnect()
  })

  it('kicked 事件携带 reason 时可正确解析', async () => {
    const { useSSE } = await import('@/composables/useSSE')
    const handler = vi.fn()
    const sse = useSSE({ url: '/api/test' })

    sse.on('kicked', handler)
    sse.connect()
    await new Promise((r) => setTimeout(r, 10))

    MockEventSource.instances[0].emit('kicked', '{"type":"kicked","reason":"管理员强制下线"}')
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ reason: '管理员强制下线' }), expect.any(Object))

    sse.disconnect()
  })

  it('disconnected 事件在 disconnect 时触发', async () => {
    const { useSSE } = await import('@/composables/useSSE')
    const handler = vi.fn()
    const sse = useSSE({ url: '/api/test' })

    sse.on('disconnected', handler)
    sse.connect()
    await new Promise((r) => setTimeout(r, 10))
    sse.disconnect()

    expect(handler).toHaveBeenCalledTimes(1)
  })

  // ── 重连 ───────────────────────────────────────────────────────────────────

  it('onerror 触发重连（自动用新实例重连）', async () => {
    const { useSSE } = await import('@/composables/useSSE')
    // 极短延迟，加速测试
    const sse = useSSE({
      url: '/api/test',
      reconnect: { initialDelay: 20, maxDelay: 100, multiplier: 1.5 },
    })

    sse.connect()
    await new Promise((r) => setTimeout(r, 10))
    MockEventSource.instances[0].triggerOpen()

    // 触发错误
    MockEventSource.instances[0].triggerError()
    expect(sse.connected.value).toBe(false)

    // 等待重连定时器 + 触发新实例的 onopen
    await new Promise((r) => setTimeout(r, 60))
    // 新实例已创建，但 onopen 需手动触发（模拟浏览器行为）
    if (MockEventSource.instances.length > 0) {
      MockEventSource.instances[MockEventSource.instances.length - 1].triggerOpen()
    }
    expect(sse.connected.value).toBe(true)

    sse.disconnect()
  })

  it('retryCount() 正确记录重试次数', async () => {
    const { useSSE } = await import('@/composables/useSSE')
    const sse = useSSE({
      url: '/api/test',
      reconnect: { initialDelay: 20, maxDelay: 100 },
    })

    expect(sse.retryCount()).toBe(0)

    sse.connect()
    await new Promise((r) => setTimeout(r, 10))
    MockEventSource.instances[0].triggerOpen()

    MockEventSource.instances[0].triggerError()
    await new Promise((r) => setTimeout(r, 60))
    expect(sse.retryCount()).toBe(1)

    sse.disconnect()
  })

  // ── Ticket 刷新 ────────────────────────────────────────────────────────────

  it('首次 ticket 获取失败时尝试 token 刷新', async () => {
    const { authApi } = await import('@/api/auth')
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    // 第一次失败，第二次成功
    ;(authApi.sseTicket as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error('token expired'))
      .mockResolvedValueOnce({ data: { ticket: 'refreshed-ticket' } })

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ code: 0, data: { accessToken: 'new-token' } }),
    } as Response)

    const { useSSE } = await import('@/composables/useSSE')
    const sse = useSSE({ url: '/api/test' })

    sse.connect()
    await new Promise((r) => setTimeout(r, 10))

    // authApi.sseTicket 被调用了两次（首次失败 + 刷新后重试）
    expect(authApi.sseTicket).toHaveBeenCalledTimes(2)
    // 最终 URL 包含刷新后的 ticket
    expect(MockEventSource.instances[0].url).toContain('refreshed-ticket')

    sse.disconnect()
    fetchSpy.mockRestore()
  })

  // ── URL 拼接 ───────────────────────────────────────────────────────────────

  it('url 以 /api 开头时不重复拼接', async () => {
    const { useSSE } = await import('@/composables/useSSE')
    const sse = useSSE({ url: '/api/notices/sse' })

    sse.connect()
    await new Promise((r) => setTimeout(r, 10))

    expect(MockEventSource.instances[0].url).toBe('/api/notices/sse?ticket=mock-ticket-xxx')
    expect(MockEventSource.instances[0].url).not.toContain('/api/api/')

    sse.disconnect()
  })

  it('url 不以 /api 开头时自动添加 /api/v1 前缀', async () => {
    const { useSSE } = await import('@/composables/useSSE')
    const sse = useSSE({ url: 'notices/sse' }) // 相对路径

    sse.connect()
    await new Promise((r) => setTimeout(r, 10))

    expect(MockEventSource.instances[0].url).toContain('/api/v1/notices/sse?ticket=')

    sse.disconnect()
  })
})
