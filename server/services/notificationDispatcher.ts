import NotificationChannel from '../models/NotificationChannel.js'
import UserNotificationPreference from '../models/UserNotificationPreference.js'
import { getTenantContext } from '../modules/tenant/context.js'
import { logInfo } from '../utils/fileLogger.js'
import { sendViaChannel, type NotifyPayload } from './notificationChannelService.js'

/**
 * 系统级通知分发器（降本 P0-1）
 *
 * 把 notificationChannelService.sendViaChannel 从「只有连通性测试会调用」变成业务事件的统一出口。
 * 设计约束：
 * - 事件级冷却：同一 event + subject 默认 5 分钟内只投递一次，避免 sweeper 异常造成告警风暴；
 *   已自带冷却的调用方（如监控告警规则）可传 cooldownMs: 0。
 * - 用户偏好：仅在显式传 userId 时按 user_notification_preferences 过滤；系统告警不带 userId，
 *   因此不受个人偏好影响，避免运维告警被某个用户的关闭操作吞掉。
 * - 失败隔离：单个渠道失败、整批 DB 查询失败都只留痕，绝不抛给业务主流程（notifyAsync 亦不抛）。
 * - 最近投递：进程内环形缓冲，供后台「最近投递」查看，重启后清空（不引入新表）。
 */

const MAX_RECORDS = 100
const DEFAULT_COOLDOWN_MS = 5 * 60 * 1000

export interface DeliveryRecord {
  at: string
  event: string
  subject: string
  channelId: number
  channelName: string
  type: string
  ok: boolean
  message: string
}

export interface NotifyEventInput extends NotifyPayload {
  event: string
  /** 传入时按该用户的通知偏好过滤渠道；系统级告警不传 */
  userId?: number
  /** 事件冷却毫秒数，0 表示不冷却 */
  cooldownMs?: number
}

export interface DispatchResult {
  total: number
  sent: number
  failed: number
  /** 被冷却抑制时为 true */
  skipped: boolean
}

const records: DeliveryRecord[] = []
const lastSentAt = new Map<string, number>()

/** 最近投递记录（最新在前） */
export function getRecentDeliveries(): DeliveryRecord[] {
  return [...records].reverse()
}

/** 仅用于测试：清空内存记录与冷却表 */
export function resetDeliveries(): void {
  records.length = 0
  lastSentAt.clear()
}

/**
 * 向当前租户下所有已启用渠道分发一条通知。
 * 返回各渠道投递汇总；调用方可据此记录结果。
 */
export async function dispatchNotification(input: NotifyEventInput): Promise<DispatchResult> {
  const tenantId = getTenantContext()?.tenantId ?? 1
  // 冷却键必须含租户维度：否则多租户下，租户 A 的运维告警会把 5 分钟内租户 B 同事件/同 subject 的告警判为 skipped 吞掉
  const key = `${tenantId}|${input.event}|${input.subject ?? ''}|${input.userId ?? 0}`
  const cooldown = input.cooldownMs ?? DEFAULT_COOLDOWN_MS
  const now = Date.now()
  if (cooldown > 0 && now - (lastSentAt.get(key) ?? 0) < cooldown) {
    return { total: 0, sent: 0, failed: 0, skipped: true }
  }
  lastSentAt.set(key, now)

  const rows = await NotificationChannel.findAll({
    where: { tenantId, enabled: true },
    order: [['id', 'ASC']],
  })

  let targets = rows
  if (input.userId !== undefined) {
    const disabled = await UserNotificationPreference.findAll({ where: { userId: input.userId, tenantId } })
    const blocked = new Set(disabled.map((d) => d.channelId))
    targets = rows.filter((r) => !blocked.has(r.id))
  }

  const payload: NotifyPayload = {
    event: input.event,
    to: input.to,
    subject: input.subject,
    text: input.text,
  }

  let sent = 0
  let failed = 0
  for (const row of targets) {
    let ok = false
    let message = ''
    try {
      const result = await sendViaChannel(row, payload)
      ok = result.ok
      message = result.message
    } catch (err) {
      message = err instanceof Error ? err.message : '投递异常'
    }
    if (ok) sent++
    else failed++
    records.push({
      at: new Date().toISOString(),
      event: input.event,
      subject: input.subject ?? '',
      channelId: row.id,
      channelName: row.name,
      type: row.type,
      ok,
      message: String(message).slice(0, 200),
    })
    if (records.length > MAX_RECORDS) records.splice(0, records.length - MAX_RECORDS)
    logInfo(`[notify] event=${input.event} channel=${row.id}:${row.name} ${ok ? 'OK' : 'FAIL'} ${message}`.slice(0, 300))
  }

  return { total: targets.length, sent, failed, skipped: false }
}

/**
 * fire-and-forget 入口：供异常分支、同步函数（如监控 evaluate 的 sink）调用。
 * 无任何渠道或 DB 不可用时静默留痕，不影响调用方。
 */
export function notifyAsync(input: NotifyEventInput): void {
  void dispatchNotification(input).catch((err) => {
    logInfo(`[notify] 分发失败 event=${input.event}: ${err instanceof Error ? err.message : String(err)}`.slice(0, 300))
  })
}
