import { Op, type WhereOptions } from 'sequelize'
import nodemailer from 'nodemailer'
import NotificationChannel, { type ChannelType, type ChannelConfig } from '../models/NotificationChannel.js'
import UserNotificationPreference from '../models/UserNotificationPreference.js'
import { AppError } from '../middleware/errorHandler.js'
import { getTenantContext } from '../modules/tenant/context.js'
import { getTransporter, getSenderName } from '../utils/mailer.js'

export type { ChannelType, ChannelConfig } from '../models/NotificationChannel.js'

/**
 * 通知渠道服务（P2-11）
 * - CRUD / 启停 / 连通性测试；敏感配置（pass/apiKey/secret/token）出参统一脱敏，入参 '******' 表示保留原值。
 * - sendViaChannel 为统一分发入口：webhook 真实 POST、email 走渠道自带或系统级 SMTP、sms 保留扩展点。
 */
const tid = (): number => getTenantContext()?.tenantId ?? 1
const MASK = '******'
const SECRET_KEYS = ['pass', 'password', 'apiKey', 'secret', 'token']

export interface ChannelView {
  id: number
  name: string
  type: ChannelType
  enabled: boolean
  config: ChannelConfig
  remark: string | null
  lastTestedAt: Date | null
  lastTestResult: string | null
  createdAt: Date
  updatedAt: Date
}

export interface ChannelInput {
  name?: string
  type?: ChannelType
  enabled?: boolean
  config?: ChannelConfig
  remark?: string | null
}

export interface NotifyPayload {
  event?: string
  to?: string
  subject?: string
  text: string
}

function readConfig(row: NotificationChannel): ChannelConfig {
  const raw = row.config as unknown
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) as ChannelConfig } catch { return {} }
  }
  return (raw && typeof raw === 'object' ? raw : {}) as ChannelConfig
}

function maskConfig(cfg: ChannelConfig): ChannelConfig {
  const out: ChannelConfig = { ...cfg }
  for (const key of SECRET_KEYS) {
    if (out[key] !== undefined && out[key] !== '') out[key] = MASK
  }
  return out
}

/** 编辑时提交脱敏占位符表示「不修改原密钥」 */
function mergeSecrets(next: ChannelConfig, prev: ChannelConfig): ChannelConfig {
  const out: ChannelConfig = { ...next }
  for (const key of SECRET_KEYS) {
    if (out[key] === MASK) {
      if (prev[key] !== undefined) out[key] = prev[key]
      else delete out[key]
    }
  }
  return out
}

function toView(row: NotificationChannel): ChannelView {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    enabled: row.enabled,
    config: maskConfig(readConfig(row)),
    remark: row.remark ?? null,
    lastTestedAt: row.lastTestedAt ?? null,
    lastTestResult: row.lastTestResult ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function validateConfig(type: ChannelType | undefined, cfg: ChannelConfig): void {
  if (type === 'webhook' && cfg.url && !/^https?:\/\//i.test(String(cfg.url))) {
    throw new AppError(400, 'Webhook URL 必须是 http(s) 协议')
  }
}

export async function listChannels(query: { keyword?: string; type?: ChannelType; enabled?: boolean } = {}): Promise<ChannelView[]> {
  const where: WhereOptions = {
    tenantId: tid(),
    ...(query.keyword ? { name: { [Op.like]: `%${query.keyword}%` } } : {}),
    ...(query.type ? { type: query.type } : {}),
    ...(query.enabled !== undefined ? { enabled: query.enabled } : {}),
  }
  const rows = await NotificationChannel.findAll({ where, order: [['id', 'DESC']] })
  return rows.map(toView)
}

/** 已启用渠道的精简清单（供个人中心「通知偏好」等 C 端/B 端消费，不含任何配置） */
export async function listActiveChannels(): Promise<{ id: number; name: string; type: ChannelType }[]> {
  const rows = await NotificationChannel.findAll({ where: { tenantId: tid(), enabled: true }, order: [['id', 'ASC']] })
  return rows.map((r) => ({ id: r.id, name: r.name, type: r.type }))
}

export async function createChannel(data: ChannelInput): Promise<ChannelView> {
  if (!data.name?.trim()) throw new AppError(400, '渠道名称不能为空')
  if (!data.type || !['email', 'sms', 'webhook'].includes(data.type)) throw new AppError(400, '渠道类型不合法')
  const cfg = data.config ?? {}
  validateConfig(data.type, cfg)
  const row = await NotificationChannel.create({
    tenantId: tid(),
    name: data.name.trim(),
    type: data.type,
    enabled: data.enabled ?? true,
    config: cfg,
    remark: data.remark ?? null,
  })
  return toView(row)
}

async function findOwned(id: number): Promise<NotificationChannel> {
  const row = await NotificationChannel.findOne({ where: { id, tenantId: tid() } })
  if (!row) throw new AppError(404, '通知渠道不存在')
  return row
}

export async function updateChannel(id: number, data: ChannelInput): Promise<ChannelView> {
  const row = await findOwned(id)
  const prev = readConfig(row)
  const patch: Record<string, unknown> = {}
  if (data.name !== undefined) {
    if (!data.name.trim()) throw new AppError(400, '渠道名称不能为空')
    patch.name = data.name.trim()
  }
  if (data.type !== undefined) {
    if (!['email', 'sms', 'webhook'].includes(data.type)) throw new AppError(400, '渠道类型不合法')
    patch.type = data.type
  }
  if (data.enabled !== undefined) patch.enabled = data.enabled
  if (data.remark !== undefined) patch.remark = data.remark
  if (data.config !== undefined) {
    const merged = mergeSecrets(data.config, prev)
    validateConfig((data.type ?? row.type) as ChannelType, merged)
    patch.config = merged
  }
  await row.update(patch)
  return toView(row)
}

export async function removeChannel(id: number): Promise<void> {
  const row = await findOwned(id)
  // 级联清理用户偏好，避免渠道删除后留下孤儿记录
  await UserNotificationPreference.destroy({ where: { channelId: id } })
  await row.destroy()
}

export async function toggleChannel(id: number, enabled: boolean): Promise<ChannelView> {
  const row = await findOwned(id)
  await row.update({ enabled })
  return toView(row)
}

/** 统一分发入口：业务侧可调用它按渠道发送通知 */
export async function sendViaChannel(
  channel: NotificationChannel,
  payload: NotifyPayload,
): Promise<{ ok: boolean; message: string }> {
  const cfg = readConfig(channel)

  if (channel.type === 'webhook') {
    const url = String(cfg.url ?? '')
    if (!/^https?:\/\//i.test(url)) return { ok: false, message: 'Webhook URL 未配置或协议不合法' }
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(cfg.secret ? { 'x-webhook-secret': String(cfg.secret) } : {}),
        },
        body: JSON.stringify({
          event: payload.event ?? 'notification',
          subject: payload.subject ?? '',
          text: payload.text,
          timestamp: new Date().toISOString(),
        }),
        signal: AbortSignal.timeout(8000),
      })
      return { ok: res.ok, message: `HTTP ${res.status}` }
    } catch (err) {
      return { ok: false, message: (err instanceof Error ? err.message : '请求失败').slice(0, 200) }
    }
  }

  if (channel.type === 'email') {
    const transporter = cfg.host
      ? nodemailer.createTransport({
          host: String(cfg.host),
          port: Number(cfg.port) || 465,
          secure: cfg.secure !== false,
          auth: { user: String(cfg.user ?? ''), pass: String(cfg.pass ?? '') },
        })
      : await getTransporter()
    if (!transporter) return { ok: false, message: 'SMTP 未配置（渠道自身或系统设置）' }
    if (!payload.to && !cfg.user) return { ok: false, message: '缺少收件邮箱' }
    try {
      await transporter.sendMail({
        from: String(cfg.from || cfg.user || (await getSenderName())),
        to: String(payload.to || cfg.user),
        subject: payload.subject || '系统通知',
        text: payload.text,
      })
      return { ok: true, message: '邮件已发送' }
    } catch (err) {
      return { ok: false, message: (err instanceof Error ? err.message : '发送失败').slice(0, 200) }
    }
  }

  return { ok: false, message: '短信网关尚未对接（配置已保存，可后续接入服务商 SDK）' }
}

export async function testChannel(id: number): Promise<{ ok: boolean; message: string }> {
  const row = await findOwned(id)
  const result = await sendViaChannel(row, {
    event: 'notification.test',
    subject: '[测试] 通知渠道连通性',
    text: `这是一条来自 ${row.name} 的连通性测试消息。`,
  })
  await row.update({
    lastTestedAt: new Date(),
    lastTestResult: `${result.ok ? 'OK' : 'FAIL'}: ${result.message}`.slice(0, 255),
  })
  return result
}
