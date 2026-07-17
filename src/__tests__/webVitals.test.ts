/**
 * webVitals.ts 单元测试
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Sentry
vi.mock('@sentry/vue', () => ({
  metrics: {
    distribution: vi.fn(),
  },
}))

// Mock web-vitals
vi.mock('web-vitals', () => ({
  onCLS: vi.fn((cb) => cb({ id: '1', value: 0.1, rating: 'good' })),
  onFCP: vi.fn((cb) => cb({ id: '2', value: 500, rating: 'good' })),
  onLCP: vi.fn((cb) => cb({ id: '3', value: 2000, rating: 'needs-improvement' })),
  onTTFB: vi.fn((cb) => cb({ id: '4', value: 300, rating: 'good' })),
  onINP: vi.fn((cb) => cb({ id: '5', value: 150, rating: 'good' })),
}))

// 导入需要在 mock 之后
import * as Sentry from '@sentry/vue'
import { reportWebVitals } from '../utils/webVitals'

describe('webVitals.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reportWebVitals 调用所有 web-vitals 指标', () => {
    reportWebVitals()
    expect(Sentry.metrics.distribution).toHaveBeenCalled()
  })

  it('CLS 指标上报正确', () => {
    reportWebVitals()
    const calls = (Sentry.metrics.distribution as ReturnType<typeof vi.fn>).mock.calls
    const clsCall = calls.find((call) => call[0] === 'web_vitals_cls')!
    expect(clsCall).toBeDefined()
    expect(clsCall[1]).toBe(0.1)
    expect(clsCall[2].tags).toEqual({ rating: 'good' })
  })

  it('FCP 指标上报正确', () => {
    reportWebVitals()
    const calls = (Sentry.metrics.distribution as ReturnType<typeof vi.fn>).mock.calls
    const fcpCall = calls.find((call) => call[0] === 'web_vitals_fcp')!
    expect(fcpCall).toBeDefined()
    expect(fcpCall[1]).toBe(500)
    expect(fcpCall[2].unit).toBe('millisecond')
  })

  it('LCP 指标上报正确', () => {
    reportWebVitals()
    const calls = (Sentry.metrics.distribution as ReturnType<typeof vi.fn>).mock.calls
    const lcpCall = calls.find((call) => call[0] === 'web_vitals_lcp')!
    expect(lcpCall).toBeDefined()
    expect(lcpCall[1]).toBe(2000)
    expect(lcpCall[2].tags.rating).toBe('needs-improvement')
  })

  it('TTFB 指标上报正确', () => {
    reportWebVitals()
    const calls = (Sentry.metrics.distribution as ReturnType<typeof vi.fn>).mock.calls
    const ttfbCall = calls.find((call) => call[0] === 'web_vitals_ttfb')!
    expect(ttfbCall).toBeDefined()
    expect(ttfbCall[1]).toBe(300)
  })

  it('INP 指标上报正确', () => {
    reportWebVitals()
    const calls = (Sentry.metrics.distribution as ReturnType<typeof vi.fn>).mock.calls
    const inpCall = calls.find((call) => call[0] === 'web_vitals_inp')!
    expect(inpCall).toBeDefined()
    expect(inpCall[1]).toBe(150)
  })

  it('所有指标都上报了单位', () => {
    reportWebVitals()
    const calls = (Sentry.metrics.distribution as ReturnType<typeof vi.fn>).mock.calls
    calls.forEach((call) => {
      expect(call[2].unit).toBeDefined()
    })
  })
})
