// @vitest-environment node
/**
 * P4-T13 监控与告警（monitoringService）
 *
 * 覆盖：P95 计算、计数器/gauge、按规则阈值告警与冷却、快照形状、
 * 六类必测指标（SSR 错误率 / API P95 / 支付失败率 / Webhook 延迟 / 库存异常 / 币种配置失败）均有规则
 * 且每条规则含阈值、通知渠道、runbook 链接。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  recordLatency,
  incCounter,
  setGauge,
  getCounter,
  p95,
  snapshot,
  evaluate,
  reset,
  DEFAULT_ALERT_RULES,
} from '../modules/storefront/services/monitoringService.js'

beforeEach(() => reset())

describe('P4-T13 指标注册表', () => {
  it('P95：无样本返回 0', () => {
    expect(p95('api_latency_ms')).toBe(0)
  })

  it('P95：单样本即本身', () => {
    recordLatency('api_latency_ms', 120)
    expect(p95('api_latency_ms')).toBe(120)
  })

  it('P95：按 95 分位计算（100 个样本取第 95 位附近）', () => {
    for (let i = 1; i <= 100; i++) recordLatency('api_latency_ms', i)
    const v = p95('api_latency_ms')
    expect(v).toBeGreaterThanOrEqual(95)
    expect(v).toBeLessThanOrEqual(100)
  })

  it('计数器与 gauge 累加/设置/读取', () => {
    incCounter('inventory_anomaly')
    incCounter('inventory_anomaly', 2)
    expect(getCounter('inventory_anomaly')).toBe(3)
    setGauge('payment_failure_rate', 0.5)
    expect(snapshot().gauges.payment_failure_rate).toBe(0.5)
  })
})

describe('P4-T13 告警规则与评估', () => {
  it('六类必测指标全部有规则，且含阈值/通知渠道/runbook', () => {
    const metrics = new Set(DEFAULT_ALERT_RULES.map((r) => r.metric))
    for (const m of ['ssr_error_rate', 'api_latency_ms', 'payment_failure_rate', 'webhook_latency_ms', 'inventory_anomaly', 'currency_config_fail']) {
      expect(metrics.has(m), `缺少指标规则: ${m}`).toBe(true)
    }
    for (const r of DEFAULT_ALERT_RULES) {
      expect(typeof r.threshold).toBe('number')
      expect(r.channel).toBeTruthy()
      expect(r.runbook).toMatch(/DEPLOYMENT_RUNBOOK\.md/)
    }
  })

  it('阈值未超不告警；超过后触发并记录', () => {
    setGauge('ssr_error_rate', 0.01) // 阈值 0.05
    expect(evaluate()).toHaveLength(0)

    setGauge('ssr_error_rate', 0.12)
    const fired = evaluate()
    expect(fired.length).toBe(1)
    expect(fired[0].id).toBe('ssr-error-rate')
    expect(fired[0].value).toBe(0.12)
    expect(fired[0].runbook).toMatch(/DEPLOYMENT_RUNBOOK\.md/)
    expect(snapshot().alerts.length).toBe(1)
  })

  it('冷却期内同规则不重复告警', () => {
    setGauge('inventory_anomaly', 1)
    expect(evaluate()).toHaveLength(1)
    expect(evaluate()).toHaveLength(0) // 冷却中
  })

  it('延迟指标按 P95 参与告警', () => {
    for (let i = 0; i < 20; i++) recordLatency('webhook_latency_ms', 3000)
    const fired = evaluate()
    const w = fired.find((f) => f.id === 'webhook-latency')
    expect(w).toBeTruthy()
    expect(w!.value).toBeGreaterThanOrEqual(2000)
  })
})
