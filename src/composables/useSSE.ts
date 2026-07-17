/**
 * SSE（Server-Sent Events）连接管理 Composable
 *
 * 特性：
 * - 指数退避重连（最大 30s，避免过度重试）
 * - 心跳保活（默认 30s 间隔，检测连接存活状态）
 * - 自动 ticket 获取（无缝处理 token 刷新）
 * - 连接状态追踪（ref）
 * - 完整的生命周期清理
 *
 * 使用方式：
 *   const sse = useSSE({
 *     url: '/api/notices/sse',
 *     heartbeatInterval: 30_000,
 *     reconnect: { maxDelay: 30_000 },
 *   })
 *
 *   sse.on('notice-published', () => fetchUnreadCount())
 *   sse.on('kicked', (event) => performLogout(event.data))
 *
 *   sse.connect()     // 建立连接
 *   sse.disconnect()  // 主动断开
 *
 *   onUnmounted(() => sse.disconnect())  // 组件卸载时清理
 */
import { ref, onUnmounted } from 'vue'
import { setAccessToken } from '@/utils/request'
import { authApi } from '@/api/auth'

export interface SSEOptions {
  /** SSE 端点（不含 query 参数，ticket 会自动追加） */
  url: string
  /** 心跳间隔（ms），设为 0 禁用心跳检测。默认 30_000 */
  heartbeatInterval?: number
  /** 重连配置 */
  reconnect?: {
    /** 初始重连延迟（ms）。默认 3_000 */
    initialDelay?: number
    /** 最大重连延迟（ms）。默认 30_000 */
    maxDelay?: number
    /** 重连延迟倍数。默认 1.5（指数退避） */
    multiplier?: number
  }
  /** 最大重连次数。默认 -1（无限） */
  maxRetries?: number
}

export interface SSEMessage {
  type: string
  data?: unknown
  [key: string]: unknown
}

const DEFAULT_OPTIONS: Required<Omit<SSEOptions, 'url'>> = {
  heartbeatInterval: 30_000,
  reconnect: {
    initialDelay: 3_000,
    maxDelay: 30_000,
    multiplier: 1.5,
  },
  maxRetries: -1,
}

type EventHandler = (payload: SSEMessage, raw?: MessageEvent) => void

/**
 * SSE Composable
 *
 * @param options - 连接配置
 * @returns SSE 控制接口
 */
export function useSSE(options: SSEOptions) {
  const resolvedOptions = {
    ...DEFAULT_OPTIONS,
    ...options,
    reconnect: {
      ...DEFAULT_OPTIONS.reconnect,
      ...(options.reconnect ?? {}),
    },
  }

  const {
    url,
    heartbeatInterval = resolvedOptions.heartbeatInterval,
    maxRetries = resolvedOptions.maxRetries,
    reconnect: { initialDelay = 3000, maxDelay = 30000, multiplier = 1.5 } = resolvedOptions.reconnect!,
  } = resolvedOptions

  /** 连接状态 */
  const connected = ref(false)

  /** SSE EventSource 实例 */
  let eventSource: EventSource | null = null

  /** 心跳定时器 */
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null

  /** 重连定时器 */
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null

  /** 当前重试计数 */
  let retryCount = 0

  /** 是否已主动销毁（永远不再重连） */
  let destroyed = false

  /** 已注册的事件处理器 */
  const handlers: Map<string, Set<EventHandler>> = new Map()

  // ──────────────────────────────────────────────
  // 内部方法
  // ──────────────────────────────────────────────

  /**
   * 获取 SSE 认证 ticket（自动处理 token 刷新）
   * @returns ticket 字符串，失败返回 null
   */
  async function fetchTicket(): Promise<string | null> {
    try {
      const res = await authApi.sseTicket()
      return res.data?.ticket ?? null
    } catch {
      // token 可能已过期，尝试刷新
      try {
        const res = await fetch('/api/v1/auth/token', {
          method: 'POST',
          credentials: 'include',
        })
        if (res.ok) {
          const data = await res.json()
          if (data.code === 0) {
            setAccessToken(data.data.accessToken)
            // 刷新后重试获取 ticket
            const retryRes = await authApi.sseTicket()
            return retryRes.data?.ticket ?? null
          }
        }
      } catch {
        // 刷新失败
      }
      return null
    }
  }

  /** 关闭 EventSource 并清理定时器 */
  function closeConnection(): void {
    if (eventSource) {
      eventSource.close()
      eventSource = null
    }
    stopHeartbeat()
  }

  /** 停止心跳 */
  function stopHeartbeat(): void {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer)
      heartbeatTimer = null
    }
  }

  /**
   * 启动心跳检测
   * 心跳策略：EventSource 的 readyState 变为非 OPEN 时立即重连
   */
  function startHeartbeat(): void {
    stopHeartbeat()
    if (heartbeatInterval <= 0) return

    heartbeatTimer = setInterval(() => {
      if (eventSource && eventSource.readyState !== EventSource.OPEN) {
        // 连接已断开但未触发 onerror（浏览器未检测到断线）
        connected.value = false
        closeConnection()
        scheduleReconnect()
      }
    }, heartbeatInterval)
  }

  /**
   * 计算下次重连延迟（指数退避）
   */
  function getNextDelay(): number {
    const delay = initialDelay * Math.pow(multiplier, retryCount)
    return Math.min(delay, maxDelay)
  }

  /**
   * 调度重连
   */
  function scheduleReconnect(): void {
    if (destroyed) return
    if (maxRetries !== -1 && retryCount >= maxRetries) {
      // 达到最大重试次数，停止
      return
    }

    if (reconnectTimer) clearTimeout(reconnectTimer)
    const delay = getNextDelay()
    retryCount++

    reconnectTimer = setTimeout(() => {
      if (!destroyed) {
        connect()
      }
    }, delay)
  }

  /**
   * 向所有注册的 handler 广播消息
   */
  function emit(type: string, payload: SSEMessage, raw?: MessageEvent): void {
    handlers.get(type)?.forEach((fn) => fn(payload, raw))
    handlers.get('*')?.forEach((fn) => fn(payload, raw))
  }

  // ──────────────────────────────────────────────
  // 连接逻辑
  // ──────────────────────────────────────────────

  /**
   * 建立 SSE 连接
   *
   * 流程：
   * 1. 获取 ticket（自动处理 token 刷新）
   * 2. 创建 EventSource（?ticket=xxx）
   * 3. 注册内置事件处理器（connected / error）
   * 4. 启动心跳
   * 5. 触发外部注册的 'connected' 事件
   */
  async function connect(): Promise<void> {
    if (destroyed) return

    // 关闭已有连接
    closeConnection()
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }

    const ticket = await fetchTicket()
    if (!ticket) {
      scheduleReconnect()
      return
    }

    // SSE 端点：统一追加 /api/v1 前缀（因为 useSSE 的 url 参数不含 /api 前缀）
    // 如果 url 已包含 /api（比如 /api/v1/notices/sse）则直接使用，否则拼接 /api/v1
    const sseUrl = `${url.includes('/api') ? '' : '/api/v1/'}${url}?ticket=${encodeURIComponent(ticket)}`

    try {
      eventSource = new EventSource(sseUrl)
    } catch {
      scheduleReconnect()
      return
    }

    // 连接建立
    eventSource.onopen = () => {
      connected.value = true
      retryCount = 0
      startHeartbeat()
      emit('connected', { type: 'connected' })
    }

    // generic message 事件（type 字段在 data 中）
    eventSource.onmessage = (event: MessageEvent) => {
      try {
        const data: SSEMessage = JSON.parse(event.data)
        emit(data.type, data, event)
      } catch {
        // 无法解析，忽略
      }
    }

    // 其他具名事件（由服务端通过 event:xxx 发送）
    eventSource.addEventListener('connected', (event: MessageEvent) => {
      try {
        const data: SSEMessage = JSON.parse(event.data || '{}')
        emit('connected', { ...data, type: 'connected' }, event)
      } catch {
        emit('connected', { type: 'connected' }, event)
      }
    })

    eventSource.addEventListener('notice-published', (event: MessageEvent) => {
      try {
        emit('notice-published', JSON.parse(event.data || '{}'), event)
      } catch {
        emit('notice-published', { type: 'notice-published' }, event)
      }
    })

    eventSource.addEventListener('notice-removed', (event: MessageEvent) => {
      try {
        emit('notice-removed', JSON.parse(event.data || '{}'), event)
      } catch {
        emit('notice-removed', { type: 'notice-removed' }, event)
      }
    })

    eventSource.addEventListener('kicked', (event: MessageEvent) => {
      try {
        emit('kicked', JSON.parse(event.data || '{}'), event)
      } catch {
        emit('kicked', { type: 'kicked' }, event)
      }
    })

    // 连接错误 → 重连
    eventSource.onerror = () => {
      connected.value = false
      closeConnection()
      emit('error', { type: 'error' })
      scheduleReconnect()
    }
  }

  /**
   * 主动断开连接（不再自动重连）
   */
  function disconnect(): void {
    destroyed = true
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    closeConnection()
    connected.value = false
    emit('disconnected', { type: 'disconnected' })
  }

  // ──────────────────────────────────────────────
  // 事件订阅
  // ──────────────────────────────────────────────

  /**
   * 监听 SSE 事件
   *
   * 常用事件：
   * - 'connected'：连接建立
   * - 'notice-published'：新通知发布
   * - 'notice-removed'：通知被删除
   * - 'kicked'：被踢下线
   * - 'error'：连接错误
   * - '*'：所有事件
   *
   * @param type 事件类型
   * @param handler 事件处理器
   * @returns 取消订阅函数
   */
  function on(type: string, handler: EventHandler): () => void {
    if (!handlers.has(type)) {
      handlers.set(type, new Set())
    }
    handlers.get(type)!.add(handler)
    // 返回取消订阅函数
    return () => {
      handlers.get(type)?.delete(handler)
    }
  }

  // ──────────────────────────────────────────────
  // 生命周期清理
  // ──────────────────────────────────────────────

  onUnmounted(() => {
    disconnect()
    handlers.clear()
  })

  return {
    /** 连接状态（响应式） */
    connected,
    /** 当前重试次数 */
    retryCount: () => retryCount,
    /** 建立连接 */
    connect,
    /** 主动断开 */
    disconnect,
    /** 订阅事件 */
    on,
  }
}
