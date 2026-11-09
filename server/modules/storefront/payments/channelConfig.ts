import Setting from '../../../models/Setting.js'
import { AppError } from '../../../middleware/errorHandler.js'
import { refreshSiteInfo } from '../../../utils/siteCache.js'

/**
 * 后台支付通道开关（唯一数据源：settings.optionKey = 'shop.payment.channels'）。
 *
 * - 后台只存「启用哪些通道」与非敏感的商户标识；**密钥/证书一律走环境变量**，
 *   绝不写入 settings（该表有通用读取接口且全局明文）。
 * - 未配置时返回 configured=false（legacy 兼容模式：仅 mock / bnpl 可用），
 *   保证既有回归与沙箱链路不回退；一旦后台保存过配置，则严格按勾选过滤。
 * - 与 currencyConfig 同为进程内 60s 缓存 + 保存后主动失效。
 */
export const PAYMENT_CHANNELS_KEY = 'shop.payment.channels'
const TTL_MS = 60_000

/** 合法通道 id（与 providerRegistry.PROVIDERS 对齐，避免存入未知值） */
export const CHANNEL_IDS = ['paypal', 'wechat', 'alipay', 'unionpay', 'mock', 'bnpl'] as const
export type ChannelId = (typeof CHANNEL_IDS)[number]

/** legacy 兼容模式下默认暴露的通道（真实网关必须显式勾选才启用） */
export const LEGACY_ENABLED: string[] = ['mock', 'bnpl']

export interface PaymentChannelConfig {
  configured: boolean
  enabled: string[]
  /** 非敏感商户标识，仅供后台回显（如 mchId / appId 后四位），不参与验签 */
  accounts: Record<string, Record<string, string>>
}

let cache: { value: PaymentChannelConfig | null; expiresAt: number } = { value: null, expiresAt: 0 }

/**
 * 进程内配置覆盖（优先级高于 settings 表）。
 * 供「多租户/多站点按站点下发通道配置」与单测注入使用；未设置时完全沿用库配置。
 */
let override: PaymentChannelConfig | null = null
export function setChannelConfigOverride(value: PaymentChannelConfig | null): void {
  override = value
  invalidateChannelCache()
}

export function invalidateChannelCache(): void {
  cache = { value: null, expiresAt: 0 }
}

export function validateEnabled(enabled: unknown): string[] {
  if (!Array.isArray(enabled)) throw new AppError(400, 'PAYMENT_CHANNELS_INVALID: enabled 必须为数组')
  const out: string[] = []
  for (const id of enabled) {
    if (typeof id !== 'string' || !(CHANNEL_IDS as readonly string[]).includes(id)) {
      throw new AppError(400, `PAYMENT_CHANNELS_INVALID: 未知支付通道 ${String(id)}`)
    }
    if (!out.includes(id)) out.push(id)
  }
  return out
}

/** 读取当前生效配置；库中没有该项 → legacy 兼容模式 */
export async function getChannelConfig(): Promise<PaymentChannelConfig> {
  if (override) return override
  const now = Date.now()
  if (cache.value && now < cache.expiresAt) return cache.value
  const row = await Setting.findOne({ where: { optionKey: PAYMENT_CHANNELS_KEY } })
  let value: PaymentChannelConfig = { configured: false, enabled: [...LEGACY_ENABLED], accounts: {} }
  if (row?.optionValue) {
    try {
      const raw = JSON.parse(row.optionValue) as { enabled?: unknown; accounts?: unknown }
      value = {
        configured: true,
        enabled: validateEnabled(raw.enabled ?? []),
        accounts: raw.accounts && typeof raw.accounts === 'object' ? (raw.accounts as Record<string, Record<string, string>>) : {},
      }
    } catch {
      value = { configured: true, enabled: [], accounts: {} }
    }
  }
  cache.value = value
  cache.expiresAt = now + TTL_MS
  return value
}

/** 后台保存（立即生效 + 主动失效），返回落库后的配置 */
export async function saveChannelConfig(input: { enabled: unknown; accounts?: unknown }): Promise<PaymentChannelConfig> {
  const enabled = validateEnabled(input.enabled)
  const accounts = input.accounts && typeof input.accounts === 'object' ? (input.accounts as Record<string, Record<string, string>>) : {}
  const value = { enabled, accounts }
  await Setting.upsert({ optionKey: PAYMENT_CHANNELS_KEY, optionValue: JSON.stringify(value), autoload: 1 } as never)
  invalidateChannelCache()
  void refreshSiteInfo(PAYMENT_CHANNELS_KEY, JSON.stringify(value))
  return { configured: true, ...value }
}

/** 单通道是否已被后台启用（legacy 模式下只有 mock/bnpl） */
export async function isChannelEnabled(id: string): Promise<boolean> {
  const cfg = await getChannelConfig()
  return cfg.enabled.includes(id)
}
