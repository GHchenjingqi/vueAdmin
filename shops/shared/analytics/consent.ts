/**
 * P4-T11：Cookie 同意管理（前端）。
 * - 状态：localStorage + cookie `sb_consent` 双写（SSR 可读 cookie）
 * - 分类：necessary（始终允许）/ analytics（GA4 统计）/ marketing（广告/重定向）
 * - 未决定前：analytics/marketing 一律 denied（Consent Mode v2 默认拒绝）
 * - 撤回：revoke() 立即生效并停用追踪（events.ts 门控读取）
 */

export type ConsentCategory = 'analytics' | 'marketing'
export type ConsentState = { analytics: boolean; marketing: boolean; decidedAt: string }

const COOKIE = 'sb_consent'
const STORAGE = 'sb_consent'

function readCookie(): string | null {
  if (typeof document === 'undefined') return null
  const m = /(?:^|;\s*)sb_consent=([^;]+)/.exec(document.cookie)
  return m ? decodeURIComponent(m[1]) : null
}

function writeCookie(state: ConsentState): void {
  if (typeof document === 'undefined') return
  document.cookie = `${COOKIE}=${encodeURIComponent(JSON.stringify(state))}; max-age=${180 * 24 * 3600}; path=/; sameSite=lax`
}

export function readConsent(): ConsentState | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(STORAGE) ?? readCookie()
    if (!raw) return null
    const parsed = JSON.parse(raw) as ConsentState
    if (typeof parsed.analytics !== 'boolean' || typeof parsed.marketing !== 'boolean') return null
    return parsed
  } catch {
    return null
  }
}

export function grantConsent(categories: { analytics: boolean; marketing: boolean }): ConsentState {
  const state: ConsentState = { ...categories, decidedAt: new Date().toISOString() }
  try {
    localStorage.setItem(STORAGE, JSON.stringify(state))
  } catch {
    /* localStorage 不可用时退化 cookie */
  }
  writeCookie(state)
  // Consent Mode v2 信号
  pushConsentUpdate(state)
  return state
}

export function revokeConsent(): ConsentState {
  return grantConsent({ analytics: false, marketing: false })
}

/** Consent Mode v2 默认拒绝（页面加载即调用，先于任何脚本） */
export function pushConsentDefault(): void {
  if (typeof window === 'undefined') return
  const w = window as unknown as { dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void }
  w.dataLayer = w.dataLayer || []
  w.gtag = w.gtag || ((...args: unknown[]) => w.dataLayer?.push(args))
  w.gtag('consent', 'default', {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: 'denied',
  })
}

function pushConsentUpdate(state: ConsentState): void {
  if (typeof window === 'undefined') return
  const w = window as unknown as { dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void }
  w.dataLayer = w.dataLayer || []
  w.gtag = w.gtag || ((...args: unknown[]) => w.dataLayer?.push(args))
  w.gtag('consent', 'update', {
    ad_storage: state.marketing ? 'granted' : 'denied',
    ad_user_data: state.marketing ? 'granted' : 'denied',
    ad_personalization: state.marketing ? 'granted' : 'denied',
    analytics_storage: state.analytics ? 'granted' : 'denied',
  })
}
