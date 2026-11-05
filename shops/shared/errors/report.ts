/**
 * P1-T10：客户端错误上报与脱敏。
 * - 捕获：window.onerror + unhandledrejection + Vue errorHandler
 * - 脱敏：email/token/phone/password/authorization/cookie 不入日志（发送前清洗）
 * - 传输：POST /api/log-errors（BFF 服务端二次脱敏后落日志）
 */

const SENSITIVE_PATTERNS: [RegExp, string][] = [
  [/[\w.+-]+@[\w-]+\.[\w.]+/g, '[email]'],
  [/(authorization|cookie|token|password|access_token|refresh_token)["']?\s*[:=]\s*["']?[^"',}\r\n]*/gi, '$1: [redacted]'],
  [/\b(?:\d[ -]*?){13,16}\b/g, '[card-number]'],
  [/\b1[3-9]\d{9}\b/g, '[phone]'],
]

export function scrub(text: string): string {
  let out = text
  for (const [pattern, replacement] of SENSITIVE_PATTERNS) {
    out = out.replace(pattern, replacement)
  }
  return out.slice(0, 2000)
}

export interface ErrorReport {
  message: string
  stack?: string
  source: 'window.onerror' | 'unhandledrejection' | 'vue'
  requestId?: string
  url?: string
}

export function reportError(report: ErrorReport): void {
  if (typeof window === 'undefined') return
  const payload = {
    message: scrub(report.message),
    stack: report.stack ? scrub(report.stack) : undefined,
    source: report.source,
    url: window.location.pathname,
    requestId: report.requestId,
    ts: new Date().toISOString(),
  }
  try {
    void fetch('/api/log-errors', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    })
  } catch {
    /* 上报失败静默（避免错误风暴） */
  }
}

/** 安装全局捕获（client-only，插件调用一次） */
export function installErrorReporting(): void {
  if (typeof window === 'undefined') return
  const w = window as unknown as { __errReportInstalled?: boolean }
  if (w.__errReportInstalled) return
  w.__errReportInstalled = true

  window.addEventListener('error', (event) => {
    reportError({ message: event.message, stack: event.error?.stack, source: 'window.onerror' })
  })
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason as Error | undefined
    reportError({ message: reason?.message ?? String(event.reason), stack: reason?.stack, source: 'unhandledrejection' })
  })
}
