/**
 * P4-T13 监控与告警（后端可观测性核心）
 *
 * 轻量内存指标注册表：计数器（counter）、延迟直方图（latency，含 P95）、瞬时值（gauge）。
 * 不做外部依赖（避免引入 prom-client），对外提供 snapshot() 供看板/指标端点读取，
 * 以及 evaluate() 按规则阈值评估并记录告警（日志 + 内存环形缓冲兜底；可通过 setAlertSink 注册真实通知通道）。
 *
 * 覆盖指标（与验收对应）：
 * - SSR 错误率          ssr_error_rate       （gauge，0..1）
 * - API P95             api_latency_ms       （latency，P95 毫秒）
 * - 支付失败率          payment_failure_rate （gauge，0..1）
 * - Webhook 延迟        webhook_latency_ms   （latency，P95 毫秒）
 * - 库存异常            inventory_anomaly    （counter，累计异常次数）
 * - 币种配置读取失败     currency_config_fail （counter，fail-closed 次数）
 */

export interface AlertRule {
  id: string
  name: string
  /** 指标键 */
  metric: string
  /** 比较类型 */
  operator: '>' | '>=' | '<' | '<='
  /** 阈值 */
  threshold: number
  /** 观察窗口（ms），用于 rate 型指标换算，0 表示按累计值 */
  windowMs: number
  /** 通知渠道（通知中心 / 邮件 / webhook 等，上线时接真实通道） */
  channel: string
  /** 处置手册链接（runbook） */
  runbook: string
  /** 触发后冷却（ms），避免同一规则反复告警 */
  cooldownMs: number
}

export const DEFAULT_ALERT_RULES: AlertRule[] = [
  {
    id: 'ssr-error-rate',
    name: 'SSR 页面错误率',
    metric: 'ssr_error_rate',
    operator: '>',
    threshold: 0.05,
    windowMs: 5 * 60 * 1000,
    channel: 'ops/notification',
    runbook: 'docs/DEPLOYMENT_RUNBOOK.md#监控告警处置',
    cooldownMs: 5 * 60 * 1000,
  },
  {
    id: 'api-p95',
    name: 'Storefront API P95 延迟',
    metric: 'api_latency_ms',
    operator: '>',
    threshold: 800,
    windowMs: 5 * 60 * 1000,
    channel: 'ops/notification',
    runbook: 'docs/DEPLOYMENT_RUNBOOK.md#监控告警处置',
    cooldownMs: 5 * 60 * 1000,
  },
  {
    id: 'payment-failure-rate',
    name: '支付失败率',
    metric: 'payment_failure_rate',
    operator: '>',
    threshold: 0.1,
    windowMs: 10 * 60 * 1000,
    channel: 'ops/notification',
    runbook: 'docs/DEPLOYMENT_RUNBOOK.md#监控告警处置',
    cooldownMs: 10 * 60 * 1000,
  },
  {
    id: 'webhook-latency',
    name: '支付 Webhook 处理延迟',
    metric: 'webhook_latency_ms',
    operator: '>',
    threshold: 2000,
    windowMs: 5 * 60 * 1000,
    channel: 'ops/notification',
    runbook: 'docs/DEPLOYMENT_RUNBOOK.md#监控告警处置',
    cooldownMs: 5 * 60 * 1000,
  },
  {
    id: 'inventory-anomaly',
    name: '库存异常（预占冲突/不一致）',
    metric: 'inventory_anomaly',
    operator: '>=',
    threshold: 1,
    windowMs: 5 * 60 * 1000,
    channel: 'ops/notification',
    runbook: 'docs/DEPLOYMENT_RUNBOOK.md#监控告警处置',
    cooldownMs: 5 * 60 * 1000,
  },
  {
    id: 'currency-config-fail',
    name: '币种配置读取失败（fail-closed）',
    metric: 'currency_config_fail',
    operator: '>=',
    threshold: 1,
    windowMs: 5 * 60 * 1000,
    channel: 'ops/notification',
    runbook: 'docs/DEPLOYMENT_RUNBOOK.md#监控告警处置',
    cooldownMs: 5 * 60 * 1000,
  },
]

const MAX_LATENCY_SAMPLES = 2000
const MAX_ALERTS = 200

const counters = new Map<string, number>()
const gauges = new Map<string, number>()
const latencies = new Map<string, number[]>()
const alerts: FiredAlert[] = []
const lastFiredAt = new Map<string, number>()

export interface FiredAlert {
  id: string
  name: string
  metric: string
  operator: string
  threshold: number
  value: number
  channel: string
  runbook: string
  firedAt: string
}

/**
 * 告警出口（降本 P0-1）：默认 null，行为与历史一致（仅日志 + 内存），
 * 由 bootstrap 注册为系统通知分发器。保持同步回调，evaluate() 无需改为 async，
 * 因此现有控制器与单测的调用方式、返回类型都不变；sink 自身异常被吞掉，不影响评估。
 */
export type AlertSink = (alert: FiredAlert) => void
let alertSink: AlertSink | null = null

export function setAlertSink(sink: AlertSink | null): void {
  alertSink = sink
}

/** 记录一次请求延迟（ms），保留最近 MAX_LATENCY_SAMPLES 个样本用于 P95 */
export function recordLatency(key: string, ms: number): void {
  const arr = latencies.get(key)
  if (!arr) {
    latencies.set(key, [ms])
    return
  }
  arr.push(ms)
  if (arr.length > MAX_LATENCY_SAMPLES) arr.splice(0, arr.length - MAX_LATENCY_SAMPLES)
}

/** 累加计数器 */
export function incCounter(key: string, delta = 1): void {
  counters.set(key, (counters.get(key) ?? 0) + delta)
}

/** 读取计数器当前值 */
export function getCounter(key: string): number {
  return counters.get(key) ?? 0
}

/** 设置瞬时值（0..1 比率等） */
export function setGauge(key: string, value: number): void {
  gauges.set(key, value)
}

/** 计算指定延迟指标的 P95（毫秒，整数）；无样本返回 0 */
export function p95(key: string): number {
  const arr = latencies.get(key)
  if (!arr || arr.length === 0) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  const idx = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)
  return Math.round(sorted[idx])
}

/** 当前指标快照（供看板/指标端点） */
export function snapshot(): {
  counters: Record<string, number>
  gauges: Record<string, number>
  latencies: { key: string; p95Ms: number; samples: number }[]
  alerts: FiredAlert[]
} {
  return {
    counters: Object.fromEntries(counters),
    gauges: Object.fromEntries(gauges),
    latencies: [...latencies.keys()].map((k) => ({ key: k, p95Ms: p95(k), samples: latencies.get(k)?.length ?? 0 })),
    alerts: [...alerts].slice(-MAX_ALERTS),
  }
}

/** 按规则阈值评估并记录告警（幂等冷却）。返回本轮新触发的告警。 */
export function evaluate(rules: AlertRule[] = DEFAULT_ALERT_RULES): FiredAlert[] {
  const now = Date.now()
  const fired: FiredAlert[] = []
  for (const rule of rules) {
    const value = metricValue(rule)
    if (value === null) continue
    const passed = compare(value, rule.operator, rule.threshold)
    if (!passed) continue
    const last = lastFiredAt.get(rule.id) ?? 0
    if (now - last < rule.cooldownMs) continue
    lastFiredAt.set(rule.id, now)
    const alert: FiredAlert = {
      id: rule.id,
      name: rule.name,
      metric: rule.metric,
      operator: rule.operator,
      threshold: rule.threshold,
      value,
      channel: rule.channel,
      runbook: rule.runbook,
      firedAt: new Date(now).toISOString(),
    }
    alerts.push(alert)
    fired.push(alert)
    // 日志 + 内存 sink 始终保留（无渠道时也可排障）；已注册则额外投递到真实通知渠道
    console.warn(`[alert] ${alert.name} 触发: ${alert.metric} ${alert.operator} ${rule.threshold}（当前 ${value}），runbook=${rule.runbook}`)
    if (alertSink) {
      try {
        alertSink(alert)
      } catch {
        // 通知通道异常不得影响告警评估与内存记录
      }
    }
  }
  return fired
}

function metricValue(rule: AlertRule): number | null {
  if (latencies.has(rule.metric)) return p95(rule.metric)
  if (counters.has(rule.metric)) return counters.get(rule.metric) ?? 0
  if (gauges.has(rule.metric)) return gauges.get(rule.metric) ?? 0
  return null
}

function compare(value: number, op: AlertRule['operator'], threshold: number): boolean {
  switch (op) {
    case '>':
      return value > threshold
    case '>=':
      return value >= threshold
    case '<':
      return value < threshold
    case '<=':
      return value <= threshold
  }
}

/** 测试/调试用：重置全部指标与告警 */
export function reset(): void {
  counters.clear()
  gauges.clear()
  latencies.clear()
  alerts.length = 0
  lastFiredAt.clear()
}
