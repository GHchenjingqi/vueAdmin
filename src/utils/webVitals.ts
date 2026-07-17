/**
 * Web Vitals 性能指标上报
 *
 * 收集 Core Web Vitals 并上报到 Sentry，用于 RUM 真实用户监控。
 */
import { onCLS, onFCP, onLCP, onTTFB, onINP } from 'web-vitals'
import * as Sentry from '@sentry/vue'

/**
 * 上报 Web Vitals 到 Sentry
 */
export function reportWebVitals(): void {
  const metricOptions = <T extends { value: number; rating: string }>(name: string, metric: T) => ({
    unit: name === 'web_vitals_cls' ? ('none' as const) : ('millisecond' as const),
    tags: { rating: metric.rating },
  })

  // CLS (Cumulative Layout Shift) - 累积布局偏移
  onCLS((metric) => {
    Sentry.metrics.distribution('web_vitals_cls', metric.value, metricOptions('web_vitals_cls', metric) as Record<string, unknown>)
  })

  // FCP (First Contentful Paint) - 首次内容绘制
  onFCP((metric) => {
    Sentry.metrics.distribution('web_vitals_fcp', metric.value, metricOptions('web_vitals_fcp', metric) as Record<string, unknown>)
  })

  // LCP (Largest Contentful Paint) - 最大内容绘制
  onLCP((metric) => {
    Sentry.metrics.distribution('web_vitals_lcp', metric.value, metricOptions('web_vitals_lcp', metric) as Record<string, unknown>)
  })

  // TTFB (Time to First Byte) - 首字节时间
  onTTFB((metric) => {
    Sentry.metrics.distribution('web_vitals_ttfb', metric.value, metricOptions('web_vitals_ttfb', metric) as Record<string, unknown>)
  })

  // INP (Interaction to Next Paint) - 交互到下一次绘制
  onINP((metric) => {
    Sentry.metrics.distribution('web_vitals_inp', metric.value, metricOptions('web_vitals_inp', metric) as Record<string, unknown>)
  })
}
