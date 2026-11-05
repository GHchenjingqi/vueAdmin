/**
 * 订单来源归因采集（后端步骤 6 · `orderAttributionSchema`）。
 *
 * - 字段：UTM 五参 + landingPage + referrer，随建单固化进订单快照；
 * - 首次触达：仅当本次会话首次捕获到 UTM 时写入 sessionStorage，后续页面沿用；
 *   直接访问（无 UTM）不写缓存，避免之后的广告落地被误判为直接流量；
 * - 纯函数 `parseAttribution` 可单测；`collectAttribution` 只在浏览器端调用。
 */

export interface OrderAttribution {
  utmSource?: string
  utmMedium?: string
  utmCampaign?: string
  utmTerm?: string
  utmContent?: string
  landingPage?: string
  referrer?: string
}

const STORAGE_KEY = 'sb_attribution'

const FIELDS: [keyof OrderAttribution, string, number][] = [
  ['utmSource', 'utm_source', 120],
  ['utmMedium', 'utm_medium', 120],
  ['utmCampaign', 'utm_campaign', 200],
  ['utmTerm', 'utm_term', 200],
  ['utmContent', 'utm_content', 200],
]

function cap(value: string | null | undefined, max: number): string | undefined {
  if (!value) return undefined
  const s = value.trim().slice(0, max)
  return s || undefined
}

function hasUtm(a: OrderAttribution): boolean {
  return Boolean(a.utmSource || a.utmMedium || a.utmCampaign || a.utmTerm || a.utmContent)
}

/** 纯函数：从 query / referrer / 落地页解析归因；无任何有效值时返回 undefined */
export function parseAttribution(search: string, referrer: string, landingPage: string): OrderAttribution | undefined {
  const q = new URLSearchParams(search)
  const out: OrderAttribution = {}
  for (const [key, param, max] of FIELDS) {
    const v = cap(q.get(param), max)
    if (v) out[key] = v
  }
  const lp = cap(landingPage, 512)
  const ref = cap(referrer, 512)
  if (lp) out.landingPage = lp
  if (ref) out.referrer = ref
  return Object.keys(out).length ? out : undefined
}

/** 浏览器端采集（SSR 返回 undefined，由结算页在提交时调用） */
export function collectAttribution(): OrderAttribution | undefined {
  if (typeof window === 'undefined') return undefined
  try {
    const cached = sessionStorage.getItem(STORAGE_KEY)
    if (cached) return JSON.parse(cached) as OrderAttribution
  } catch {
    /* 缓存损坏则重新解析 */
  }
  const parsed = parseAttribution(
    window.location.search,
    document.referrer,
    window.location.pathname + window.location.search,
  )
  if (parsed && hasUtm(parsed)) {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(parsed))
    } catch {
      /* sessionStorage 不可用时退化为「仅本次页面」归因 */
    }
  }
  return parsed
}
