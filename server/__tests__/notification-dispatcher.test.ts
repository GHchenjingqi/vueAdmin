// @vitest-environment node
/**
 * 系统通知分发器 + 监控告警出口（降本 P0-1）
 *
 * 纯 mock，不触碰数据库：覆盖事件冷却、用户偏好过滤、单渠道失败隔离、
 * 最近投递记录上限，以及 evaluate 的 sink 注册机制（含 sink 抛错不阻断评估）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const m = vi.hoisted(() => ({
  findAllChannels: vi.fn(),
  findAllPrefs: vi.fn(),
  sendViaChannel: vi.fn(),
}))

vi.mock('../models/NotificationChannel.js', () => ({
  default: { findAll: m.findAllChannels },
}))
vi.mock('../models/UserNotificationPreference.js', () => ({
  default: { findAll: m.findAllPrefs },
}))
vi.mock('../services/notificationChannelService.js', () => ({
  sendViaChannel: m.sendViaChannel,
}))
vi.mock('../modules/tenant/context.js', () => ({
  getTenantContext: () => ({ tenantId: 1 }),
  runInTenant: (_ctx: unknown, fn: () => Promise<unknown>) => fn(),
}))
vi.mock('../utils/fileLogger.js', () => ({ logInfo: () => undefined }))

import {
  dispatchNotification,
  notifyAsync,
  getRecentDeliveries,
  resetDeliveries,
} from '../services/notificationDispatcher.js'
import {
  evaluate,
  incCounter,
  reset,
  setAlertSink,
  type FiredAlert,
} from '../modules/storefront/services/monitoringService.js'

const RULE = {
  id: 'test-anomaly',
  name: '测试告警',
  metric: 'inventory_anomaly',
  operator: '>=' as const,
  threshold: 1,
  windowMs: 0,
  channel: 'ops/notification',
  runbook: 'docs/test.md',
  cooldownMs: 0,
}

const channel = (id: number, type = 'webhook') => ({ id, name: `渠道${id}`, type })

beforeEach(() => {
  vi.clearAllMocks()
  resetDeliveries()
  reset()
  setAlertSink(null)
  m.findAllPrefs.mockResolvedValue([])
  m.sendViaChannel.mockResolvedValue({ ok: true, message: 'HTTP 200' })
})

describe('通知分发器', () => {
  it('无启用渠道时返回 total=0 且不产生记录', async () => {
    m.findAllChannels.mockResolvedValue([])
    const r = await dispatchNotification({ event: 'e', subject: 's', text: 'x' })
    expect(r).toEqual({ total: 0, sent: 0, failed: 0, skipped: false })
    expect(getRecentDeliveries()).toHaveLength(0)
  })

  it('向所有启用渠道投递并留下可查记录', async () => {
    m.findAllChannels.mockResolvedValue([channel(1), channel(2, 'email')])
    const r = await dispatchNotification({ event: 'system.alert', subject: '告警', text: '内容' })
    expect(r).toEqual({ total: 2, sent: 2, failed: 0, skipped: false })
    const records = getRecentDeliveries()
    expect(records).toHaveLength(2)
    expect(records[0].event).toBe('system.alert')
    expect(records[0].ok).toBe(true)
    expect(m.sendViaChannel).toHaveBeenCalledTimes(2)
  })

  it('同一事件默认冷却 5 分钟，cooldownMs=0 可关闭', async () => {
    m.findAllChannels.mockResolvedValue([channel(1)])
    const input = { event: 'e', subject: 's', text: 'x' }
    expect((await dispatchNotification(input)).skipped).toBe(false)
    expect((await dispatchNotification(input)).skipped).toBe(true)
    expect(m.sendViaChannel).toHaveBeenCalledTimes(1)

    expect((await dispatchNotification({ ...input, cooldownMs: 0 })).skipped).toBe(false)
    expect(m.sendViaChannel).toHaveBeenCalledTimes(2)
  })

  it('传 userId 时过滤掉用户已关闭的渠道，不传时不受偏好影响', async () => {
    m.findAllChannels.mockResolvedValue([channel(1), channel(2)])
    m.findAllPrefs.mockResolvedValue([{ channelId: 2 }])
    const r = await dispatchNotification({ event: 'e', subject: 's', text: 'x', userId: 7 })
    expect(r.total).toBe(1)
    expect(m.sendViaChannel).toHaveBeenCalledTimes(1)

    m.sendViaChannel.mockClear()
    const sys = await dispatchNotification({ event: 'e2', subject: 's2', text: 'x' })
    expect(sys.total).toBe(2)
    expect(m.sendViaChannel).toHaveBeenCalledTimes(2)
  })

  it('单渠道抛错只计 failed，不阻断其余渠道', async () => {
    m.findAllChannels.mockResolvedValue([channel(1), channel(2)])
    m.sendViaChannel
      .mockRejectedValueOnce(new Error('连接被拒'))
      .mockResolvedValueOnce({ ok: true, message: 'HTTP 200' })
    const r = await dispatchNotification({ event: 'e', subject: 's', text: 'x' })
    expect(r).toMatchObject({ sent: 1, failed: 1 })
    expect(getRecentDeliveries().some((d) => !d.ok)).toBe(true)
  })

  it('最近记录上限 100 条', async () => {
    m.findAllChannels.mockResolvedValue([channel(1)])
    for (let i = 0; i < 105; i++) {
      await dispatchNotification({ event: `e${i}`, subject: '', text: 'x', cooldownMs: 0 })
    }
    expect(getRecentDeliveries()).toHaveLength(100)
  })

  it('notifyAsync 在底层查询失败时不抛（失败隔离）', async () => {
    m.findAllChannels.mockRejectedValue(new Error('DB down'))
    expect(() => notifyAsync({ event: 'e', subject: 's', text: 'x' })).not.toThrow()
    await Promise.resolve()
  })
})

describe('监控告警出口 sink', () => {
  it('注册后 evaluate 触发告警会回调 sink 一次', () => {
    const sink = vi.fn()
    setAlertSink(sink)
    incCounter('inventory_anomaly')
    const fired = evaluate([RULE])
    expect(fired).toHaveLength(1)
    expect(sink).toHaveBeenCalledTimes(1)
    expect((sink.mock.calls[0][0] as FiredAlert).metric).toBe('inventory_anomaly')
  })

  it('sink 抛错不影响评估与内存告警记录', () => {
    setAlertSink(() => { throw new Error('通知挂了') })
    incCounter('inventory_anomaly')
    expect(() => evaluate([RULE])).not.toThrow()
  })

  it('setAlertSink(null) 恢复为仅日志兜底', () => {
    const sink = vi.fn()
    setAlertSink(sink)
    setAlertSink(null)
    incCounter('inventory_anomaly')
    evaluate([RULE])
    expect(sink).not.toHaveBeenCalled()
  })
})
