import config from '../../../config/index.js'
import { isFeatureEnabled } from '../../featureflags/featureFlags.js'

/**
 * 支付 Provider 注册表（P5-T03 区域支付方式与 BNPL）。
 *
 * - 每个 Provider 声明支持币种集合（币种能力校验前置：不支持则建会话前 422 拒绝，不产生任何副作用）；
 * - Webhook 一律复用 paymentService.handleWebhook 的同一套 HMAC 验签 + (provider,providerRef) 幂等去重框架；
 * - BNPL 受 Feature Flag `bnpl` 门控（X-T04：新功能默认关闭，开启后才对外暴露/可选）。
 */
export interface PaymentProviderDef {
  id: string
  label: string
  kind: 'card' | 'bnpl'
  /** 支持的币种（ISO 4217）；订单币种不在此集合时不得进入该 Provider（币种能力校验前置） */
  supportedCurrencies: string[]
  /** 需要 Feature Flag 开启才可用（如 bnpl）；card/mock 恒可用 */
  flag?: string
  /** 独立 webhook 密钥（缺省用 config.payment.webhookSecret，同一验签框架） */
  webhookSecret?: string
}

const PROVIDERS: PaymentProviderDef[] = [
  { id: 'mock', label: 'Mock Card', kind: 'card', supportedCurrencies: ['USD', 'EUR', 'CNY'] },
  // P5-T03：区域 BNPL（Klarna 风格），仅支持主力币种；默认 Feature Flag 关闭，开启后可选项
  { id: 'bnpl', label: 'BNPL (Pay in 4)', kind: 'bnpl', supportedCurrencies: ['USD', 'EUR'], flag: 'bnpl' },
]

export function getProvider(id: string | undefined): PaymentProviderDef | undefined {
  return PROVIDERS.find((p) => p.id === id)
}

/** 默认 provider：配置 provider 或首个 card */
export function defaultProvider(): PaymentProviderDef {
  const configured = config.payment?.provider
  return getProvider(configured) ?? PROVIDERS[0]
}

/** 列出对外可用的 provider（flag 关闭的过滤掉；可传订单币种做前置能力过滤） */
export async function listProviders(currency?: string): Promise<PaymentProviderDef[]> {
  const out: PaymentProviderDef[] = []
  for (const p of PROVIDERS) {
    if (p.flag && !(await isFeatureEnabled(p.flag))) continue
    if (currency && !p.supportedCurrencies.includes(currency)) continue
    out.push({ ...p })
  }
  return out
}

/**
 * P5-T03：单 Provider 前置能力校验（存在 + flag 开启 + 币种支持）。
 * 建支付会话前调用；任一不满足返回 false（调用方据此 422 拒绝，不产生副作用）。
 */
export async function isProviderUsable(p: PaymentProviderDef, currency?: string): Promise<boolean> {
  if (p.flag && !(await isFeatureEnabled(p.flag))) return false
  if (currency && !p.supportedCurrencies.includes(currency)) return false
  return true
}

/** 公开安全投影：不泄漏 flag / webhookSecret 等内部字段 */
export function publicProvider(p: PaymentProviderDef): { id: string; label: string; kind: string; supportedCurrencies: string[] } {
  return { id: p.id, label: p.label, kind: p.kind, supportedCurrencies: [...p.supportedCurrencies] }
}
