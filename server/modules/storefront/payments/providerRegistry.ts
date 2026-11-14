import config from '../../../config/index.js'
import { isFeatureEnabled } from '../../featureflags/featureFlags.js'
import { getChannelConfig, isChannelEnabled, LEGACY_ENABLED } from './channelConfig.js'

/**
 * 支付通道注册表。
 *
 * - `supportedCurrencies: '*'` 表示全币种可用（银联 / 云闪付按业务口径：全国通用，
 *   无论后台启用哪个币种都要展示，且外币订单原样按订单快照币种送网关、不换汇）；
 * - 后台 `shop.payment.channels` 勾选决定「展示 + 可结算」：未勾选不显示，
 *   也不能建会话或改单（建会话与 webhook 两侧都校验，避免只改展示层被绕开）；
 * - 未配置该项时为 legacy 兼容模式，只暴露 mock / bnpl，保证既有回归与沙箱链路不回退；
 * - 真实网关的验签/下单由 gateways/ 下适配器实现，此处只做元数据与准入。
 */
export interface PaymentProviderDef {
  id: string
  label: string
  kind: 'card' | 'bnpl' | 'wallet'
  /** 支持的币种（ISO 4217）；'*' = 全币种（银联） */
  supportedCurrencies: string[] | '*'
  /** 需要 Feature Flag 开启才可用（如 bnpl） */
  flag?: string
  /** 独立 webhook 密钥（缺省用 config.payment.webhookSecret，仅 mock/bnpl 使用） */
  webhookSecret?: string
  /** 是否走真实网关适配器 */
  real: boolean
}

export const PROVIDERS: PaymentProviderDef[] = [
  { id: 'paypal', label: 'PayPal', kind: 'card', supportedCurrencies: ['USD', 'EUR', 'GBP', 'CAD', 'AUD'], real: true },
  // PLAN 6.1：Stripe 覆盖 card / Apple Pay / Google Pay（由 Checkout 自动展示可用方式）
  { id: 'stripe', label: 'Card (Stripe)', kind: 'card', supportedCurrencies: ['USD', 'EUR', 'GBP', 'CAD', 'AUD'], real: true },
  { id: 'wechat', label: '微信支付', kind: 'wallet', supportedCurrencies: ['CNY'], real: true },
  { id: 'alipay', label: '支付宝', kind: 'wallet', supportedCurrencies: ['CNY'], real: true },
  // 业务口径：银联全国通用，任何币种都展示；外币按订单快照原样送网关，不做换汇
  { id: 'unionpay', label: '云闪付 / 银联', kind: 'card', supportedCurrencies: '*', real: true },
  { id: 'mock', label: 'Mock Card', kind: 'card', supportedCurrencies: ['USD', 'EUR', 'CNY'], real: false },
  { id: 'bnpl', label: 'BNPL (Pay in 4)', kind: 'bnpl', supportedCurrencies: ['USD', 'EUR'], flag: 'bnpl', real: false },
]

export function getProvider(id: string | undefined): PaymentProviderDef | undefined {
  return PROVIDERS.find((p) => p.id === id)
}

/** 币种能力：'*' 恒通过（银联），其余按白名单 */
export function supportsCurrency(p: PaymentProviderDef, currency?: string): boolean {
  if (!currency) return true
  if (p.supportedCurrencies === '*') return true
  return p.supportedCurrencies.includes(currency.toUpperCase())
}

/** 默认 provider：legacy 下取配置 provider 或 mock；配置模式下取该币种首个启用通道 */
export async function defaultProvider(currency?: string): Promise<PaymentProviderDef> {
  const cfg = await getChannelConfig()
  if (cfg.configured) {
    const first = (await listProviders(currency))[0]
    if (first) return first
  }
  return getProvider(config.payment?.provider) ?? PROVIDERS[4]
}

/** 列出对外可用通道：后台勾选 + flag + 币种能力三重过滤 */
export async function listProviders(currency?: string): Promise<PaymentProviderDef[]> {
  const cfg = await getChannelConfig()
  const out: PaymentProviderDef[] = []
  for (const p of PROVIDERS) {
    if (!cfg.enabled.includes(p.id)) continue
    if (p.flag && !(await isFeatureEnabled(p.flag))) continue
    if (!supportsCurrency(p, currency)) continue
    out.push({ ...p })
  }
  return out
}

/**
 * 单通道准入：后台启用 + flag + 币种能力。
 * 建会话与 webhook 两侧共用，避免「展示层过滤、回调侧仍可改单」。
 */
export async function isProviderUsable(p: PaymentProviderDef, currency?: string): Promise<boolean> {
  if (p.flag && !(await isFeatureEnabled(p.flag))) return false
  if (!supportsCurrency(p, currency)) return false
  if (!(await isChannelEnabled(p.id))) return false
  return true
}

/** legacy 兼容模式判定（供上层日志/门禁使用） */
export async function isLegacyMode(): Promise<boolean> {
  return !(await getChannelConfig()).configured
}

/** 公开安全投影：不泄漏 flag / webhookSecret / real 等内部字段 */
export function publicProvider(p: PaymentProviderDef): { id: string; label: string; kind: string; supportedCurrencies: string[] } {
  const currencies = p.supportedCurrencies === '*' ? ['*'] : [...p.supportedCurrencies]
  return { id: p.id, label: p.label, kind: p.kind, supportedCurrencies: currencies }
}

export { LEGACY_ENABLED }
