import type { NextFunction, Request, Response } from 'express'
import * as monitoring from '../services/monitoringService.js'

/**
 * P4-T13 监控与告警 HTTP 层（只读，不泄漏敏感数据）
 * 挂载于 /api/storefront/v1/monitoring：
 *   GET /metrics     指标快照（counters / gauges / latencies P95）
 *   GET /alerts      最近告警记录
 *   GET /rules       告警规则（阈值 / 通知渠道 / runbook 链接）
 *   POST /evaluate   按规则评估一次（返回本次新触发告警）
 */
export const metrics = (_req: Request, res: Response): void => {
  const snap = monitoring.snapshot()
  res.json({ code: 0, data: { counters: snap.counters, gauges: snap.gauges, latencies: snap.latencies } })
}

export const alerts = (_req: Request, res: Response): void => {
  const snap = monitoring.snapshot()
  res.json({ code: 0, data: snap.alerts })
}

export const rules = (_req: Request, res: Response): void => {
  res.json({ code: 0, data: monitoring.DEFAULT_ALERT_RULES.map((r) => ({ id: r.id, name: r.name, metric: r.metric, operator: r.operator, threshold: r.threshold, windowMs: r.windowMs, channel: r.channel, runbook: r.runbook })) })
}

export const evaluateNow = (_req: Request, res: Response, next: NextFunction): void => {
  try {
    const fired = monitoring.evaluate()
    res.json({ code: 0, data: { fired } })
  } catch (err) {
    next(err)
  }
}

/** P4-T13 看板：自包含只读 HTML（指标快照 + 告警规则 + 最近告警），可被运维监控直接挂载 */
export const dashboard = (_req: Request, res: Response): void => {
  const snap = monitoring.snapshot()
  const rules = monitoring.DEFAULT_ALERT_RULES
  const rows = rules
    .map((r) => {
      const value = snap.gauges[r.metric] ?? snap.counters[r.metric] ?? snap.latencies.find((l) => l.key === r.metric)?.p95Ms ?? 0
      const state = (() => {
        if (snap.latencies.some((l) => l.key === r.metric)) return value > r.threshold ? '🔥' : '✓'
        return value > r.threshold ? '🔥' : '✓'
      })()
      return `<tr><td>${state} ${r.name}</td><td>${r.metric}</td><td>${r.operator} ${r.threshold}</td><td>${value}</td><td>${r.channel}</td><td><a href="${r.runbook}">${r.runbook}</a></td></tr>`
    })
    .join('')
  const alertRows = snap.alerts
    .slice(-20)
    .reverse()
    .map((a) => `<tr><td>${a.firedAt}</td><td>${a.name}</td><td>${a.value}</td><td>${a.channel}</td><td><a href="${a.runbook}">${a.runbook}</a></td></tr>`)
    .join('') || '<tr><td colspan="5" class="muted">暂无告警</td></tr>'
  res.setHeader('content-type', 'text/html; charset=utf-8')
  res.send(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>Storefront 监控看板</title>
<style>body{font-family:system-ui,sans-serif;margin:24px;color:#1a1a1a}table{border-collapse:collapse;width:100%;margin:12px 0}th,td{border:1px solid #ddd;padding:6px 10px;text-align:left;font-size:13px}th{background:#f5f5f5}h2{margin-top:24px}.muted{color:#999}</style></head>
<body><h1>Storefront 监控看板（P4-T13）</h1>
<h2>告警规则（阈值 / 通知渠道 / runbook）</h2>
<table><thead><tr><th>规则</th><th>指标</th><th>条件</th><th>当前值</th><th>通知渠道</th><th>处置手册</th></tr></thead><tbody>${rows}</tbody></table>
<h2>最近告警</h2>
<table><thead><tr><th>时间</th><th>规则</th><th>值</th><th>渠道</th><th>runbook</th></tr></thead><tbody>${alertRows}</tbody></table>
<h2>指标快照</h2>
<table><thead><tr><th>类型</th><th>键</th><th>值</th></tr></thead><tbody>
${Object.entries(snap.gauges).map(([k, v]) => `<tr><td>gauge</td><td>${k}</td><td>${v}</td></tr>`).join('')}
${Object.entries(snap.counters).map(([k, v]) => `<tr><td>counter</td><td>${k}</td><td>${v}</td></tr>`).join('')}
${snap.latencies.map((l) => `<tr><td>latency</td><td>${l.key}</td><td>P95 ${l.p95Ms}ms (${l.samples} 样本)</td></tr>`).join('')}
</tbody></table></body></html>`)
}
