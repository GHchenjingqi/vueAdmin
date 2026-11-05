import { readConsent } from './consent'

/**
 * 服务端 CAPI 埋点上报（P4-T10 / P4-T11 与后端步骤 6 的接线）。
 *
 * - 后端契约：POST /api/storefront/v1/track-event
 *   { eventId, eventName, consent:{analytics}, sessionId?, params? }
 * - 浏览器只走同源 BFF `/api/track-event`，不直连 Express（P1-T08）。
 * - 幂等 eventId 每次上报唯一；sessionId 会话内稳定，供后台串联漏斗。
 * - consent 随事件传给后端：未同意时后端仅落库留痕、绝不向 CAPI 外发
 *   （`skipped_no_consent`），前端不自行决定丢弃，保证前后端口径一致。
 * - fire-and-forget：任何异常静默，埋点故障绝不影响 C 端交互。
 */

const SESSION_KEY = 'sb_session_id'

export interface CapiEventPayload {
  eventId: string
  eventName: string
  consent: { analytics: boolean }
  sessionId?: string
  params: Record<string, unknown>
}

function newId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  } catch {
    /* 非安全上下文下 crypto.randomUUID 不可用 → 退化为时间戳 + 随机串 */
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

/** 会话级 ID（sessionStorage；不可用时返回空串，后端 sessionId 为可选） */
export function getSessionId(): string {
  if (typeof window === 'undefined') return ''
  try {
    const existing = sessionStorage.getItem(SESSION_KEY)
    if (existing) return existing
    const id = newId()
    sessionStorage.setItem(SESSION_KEY, id)
    return id
  } catch {
    return ''
  }
}

/** 纯函数：构造上报体（便于单测，不依赖 DOM / fetch） */
export function buildCapiPayload(
  eventName: string,
  params: Record<string, unknown>,
  analyticsConsent: boolean,
  sessionId = '',
  eventId = newId(),
): CapiEventPayload {
  return {
    eventId,
    eventName,
    consent: { analytics: analyticsConsent },
    ...(sessionId ? { sessionId } : {}),
    params,
  }
}

/** 上报一个事件（fire-and-forget）；SSR 与无 fetch 环境直接跳过 */
export function sendCapiEvent(eventName: string, params: Record<string, unknown>): void {
  if (typeof window === 'undefined' || typeof fetch !== 'function') return
  try {
    const payload = buildCapiPayload(eventName, params, readConsent()?.analytics === true, getSessionId())
    void fetch('/api/track-event', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {
      /* 埋点失败不影响页面 */
    })
  } catch {
    /* localStorage / sessionStorage / fetch 不可用均静默降级 */
  }
}
