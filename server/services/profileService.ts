import sequelize from '../config/database.js'
import Log from '../models/Log.js'
import UserNotificationPreference from '../models/UserNotificationPreference.js'
import { getTenantContext } from '../modules/tenant/context.js'
import { listActiveChannels } from './notificationChannelService.js'

/**
 * 个人中心增强（P2-10）
 * - 登录安全历史：只读当前用户自己的 login 日志（不暴露 /logs 全量后台日志）
 * - 通知偏好：基于 P2-11 已启用的通知渠道，按用户记录「关闭的渠道」
 */
const tid = (): number => getTenantContext()?.tenantId ?? 1

export interface LoginHistoryItem {
  id: number
  time: Date
  action: string
  ip: string
  userAgent: string
  device: string
}

export interface NotificationPreferences {
  channels: { id: number; name: string; type: 'email' | 'sms' | 'webhook' }[]
  disabledIds: number[]
}

/** 从 User-Agent 粗解析设备描述，不引入额外依赖 */
function parseDevice(ua: string): string {
  if (!ua) return '未知设备'
  const os = /Windows NT 10/.test(ua)
    ? 'Windows 10/11'
    : /Windows/.test(ua)
      ? 'Windows'
      : /Mac OS X/.test(ua)
        ? 'macOS'
        : /Android/.test(ua)
          ? 'Android'
          : /iPhone|iPad/.test(ua)
            ? 'iOS'
            : /Linux/.test(ua)
              ? 'Linux'
              : '其他系统'
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Chrome\//.test(ua)
      ? 'Chrome'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Safari\//.test(ua)
          ? 'Safari'
          : '其他浏览器'
  return `${os} · ${browser}`
}

export async function getLoginHistory(userId: number, limit = 20): Promise<LoginHistoryItem[]> {
  const safeLimit = Math.min(Math.max(1, Number(limit) || 20), 50)
  const rows = await Log.findAll({
    where: { type: 'login', userId },
    order: [['createdAt', 'DESC']],
    limit: safeLimit,
  })
  return rows.map((r) => ({
    id: r.id,
    time: r.createdAt,
    action: r.action,
    ip: r.ipAddress || '',
    userAgent: r.userAgent || '',
    device: parseDevice(r.userAgent || ''),
  }))
}

export async function getNotificationPreferences(userId: number): Promise<NotificationPreferences> {
  const channels = await listActiveChannels()
  const rows = await UserNotificationPreference.findAll({ where: { userId, tenantId: tid() } })
  const activeIds = new Set(channels.map((c) => c.id))
  const disabledIds = [...new Set(rows.map((r) => r.channelId).filter((id) => activeIds.has(id)))]
  return { channels, disabledIds }
}

export async function saveNotificationPreferences(userId: number, disabledIds: number[]): Promise<NotificationPreferences> {
  const channels = await listActiveChannels()
  const activeIds = new Set(channels.map((c) => c.id))
  const ids = [...new Set((Array.isArray(disabledIds) ? disabledIds : []).map(Number))]
    .filter((id) => Number.isInteger(id) && activeIds.has(id))
    .slice(0, 100)
  const tenantId = tid()

  await sequelize.transaction(async (tx) => {
    await UserNotificationPreference.destroy({ where: { userId, tenantId }, transaction: tx })
    if (ids.length) {
      await UserNotificationPreference.bulkCreate(
        ids.map((channelId) => ({ userId, tenantId, channelId })),
        { transaction: tx },
      )
    }
  })

  return getNotificationPreferences(userId)
}
