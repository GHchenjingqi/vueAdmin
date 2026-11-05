import { onCLS, onFCP, onINP, onLCP, onTTFB, type Metric } from 'web-vitals'

/**
 * P4-T16（前端 RUM 部分）：Core Web Vitals 采集。
 * - 指标：LCP / INP / CLS / FCP / TTFB（web-vitals v4）
 * - 上报：sendBeacon → BFF /api/vitals（name/value/rating/id/page）；BFF 落进程日志，
 *   聚合看板与 API P95 属后端监控（P4-T13）与部署层（X-T06）
 * - 阈值评级沿用 web-vitals（good/needs-improvement/poor）
 */

function send(metric: Metric): void {
  const payload = JSON.stringify({
    name: metric.name,
    value: Math.round(metric.name === 'CLS' ? metric.value * 1000 : metric.value),
    unit: metric.name === 'CLS' ? 'ms-x1000' : 'ms',
    rating: metric.rating,
    id: metric.id,
    page: window.location.pathname,
    ts: new Date().toISOString(),
  })
  try {
    if (navigator.sendBeacon) navigator.sendBeacon('/api/vitals', payload)
    else void fetch('/api/vitals', { method: 'POST', body: payload, keepalive: true })
  } catch {
    /* 上报失败静默 */
  }
}

export default defineNuxtPlugin(() => {
  if (typeof window === 'undefined') return
  try {
    onCLS(send)
    onFCP(send)
    onINP(send)
    onLCP(send)
    onTTFB(send)
  } catch {
    /* 旧浏览器不支持对应指标时静默 */
  }
})
