import { createHmac } from 'node:crypto'
import { AppError } from '../../../middleware/errorHandler.js'
import Setting from '../../../models/Setting.js'
import { refreshSiteInfo } from '../../../utils/siteCache.js'
import { incCounter } from './monitoringService.js'

/**
 * 单一启用币种服务（P1-T06 / C1/C7/C8）——后端侧
 *
 * 唯一数据源：settings.optionKey='shop.currency'（JSON CurrencyConfig，迁移 000050 种子 USD）。
 * - 缺失/非法 → fail-closed（SHOP_CURRENCY_CONFIG_MISSING / _INVALID，503），禁止默认 USD 兜底
 * - 进程内缓存 TTL 60s（C8）+ 管理端保存/回滚/定时应用后主动失效
 * - siteContext.defaultCurrency 跟随本服务（缺失时回退站点 credentials 并告警，保证目录可浏览）
 */

export interface CurrencyConfig {
  code: string
  symbol: string
  decimalDigits: number
  symbolPosition: 'before' | 'after'
  thousandsSeparator: string
  decimalSeparator: string
  locale: string
}

/** ISO-4217 白名单（code → 默认元数据；配置以后台 settings 为准） */
export const ISO_META: Record<string, { symbol: string; decimalDigits: number; locale: string }> = {
  USD: { symbol: '$', decimalDigits: 2, locale: 'en-US' },
  CNY: { symbol: '¥', decimalDigits: 2, locale: 'zh-CN' },
  EUR: { symbol: '€', decimalDigits: 2, locale: 'de-DE' },
  GBP: { symbol: '£', decimalDigits: 2, locale: 'en-GB' },
  CAD: { symbol: 'CA$', decimalDigits: 2, locale: 'en-CA' },
  AUD: { symbol: 'A$', decimalDigits: 2, locale: 'en-AU' },
}

const cache: { value: CurrencyConfig | null; expiresAt: number } = { value: null, expiresAt: 0 }
const TTL_MS = 60_000

export function validateCurrencyConfig(raw: unknown): CurrencyConfig {
  const cfg = raw as CurrencyConfig | null
  if (!cfg || typeof cfg !== 'object') throw new AppError(503, 'SHOP_CURRENCY_CONFIG_MISSING')
  const code = typeof cfg.code === 'string' ? cfg.code.trim().toUpperCase() : ''
  if (!/^[A-Z]{3}$/.test(code) || !ISO_META[code]) throw new AppError(503, 'SHOP_CURRENCY_CONFIG_INVALID')
  const meta = ISO_META[code]
  const decimalDigits = Number.isInteger(cfg.decimalDigits) && cfg.decimalDigits >= 0 && cfg.decimalDigits <= 4 ? cfg.decimalDigits : meta.decimalDigits
  return {
    code,
    symbol: typeof cfg.symbol === 'string' && cfg.symbol.trim() ? cfg.symbol.trim() : meta.symbol,
    decimalDigits,
    symbolPosition: cfg.symbolPosition === 'after' ? 'after' : 'before',
    thousandsSeparator: typeof cfg.thousandsSeparator === 'string' && cfg.thousandsSeparator ? cfg.thousandsSeparator : ',',
    decimalSeparator: typeof cfg.decimalSeparator === 'string' && cfg.decimalSeparator ? cfg.decimalSeparator : '.',
    locale: typeof cfg.locale === 'string' && cfg.locale.trim() ? cfg.locale.trim() : meta.locale,
  }
}

async function readSettingRaw(key: string): Promise<string | null> {
  const row = await Setting.findOne({ where: { optionKey: key } })
  return row?.optionValue ?? null
}

export async function getActiveCurrency(): Promise<CurrencyConfig> {
  const now = Date.now()
  if (cache.value && now < cache.expiresAt) return cache.value
  const raw = await readSettingRaw('shop.currency')
  if (!raw) throw new AppError(503, 'SHOP_CURRENCY_CONFIG_MISSING')
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new AppError(503, 'SHOP_CURRENCY_CONFIG_INVALID')
  }
  const cfg = validateCurrencyConfig(parsed)
  cache.value = cfg
  cache.expiresAt = now + TTL_MS
  return cfg
}

/** P4-T13 观测：币种配置读取失败（fail-closed 503）计数 */
export async function getActiveCurrencyMonitored(): Promise<CurrencyConfig> {
  try {
    return await getActiveCurrency()
  } catch (err) {
    incCounter('currency_config_fail')
    throw err
  }
}

/** siteContext 回退用：settings 失效时回退站点 credentials 币种（warn，不阻断目录浏览） */
export async function getActiveCurrencyWithFallback(fallback: string): Promise<{ code: string; degraded: boolean }> {
  try {
    return { code: (await getActiveCurrency()).code, degraded: false }
  } catch (err) {
    const code = (err as AppError).message
    console.warn(`[currency] settings 不可用（${code}），回退站点默认 ${fallback}`)
    return { code: fallback, degraded: true }
  }
}

/** 管理端保存/回滚/定时应用后调用：主动失效两级缓存（C8：≤60s 前台生效） */
export function invalidateCurrencyCache(): void {
  cache.value = null
  cache.expiresAt = 0
  void (async () => {
    try {
      const row = await Setting.findOne({ where: { optionKey: 'shop.currency' } })
      if (row?.optionValue) await refreshSiteInfo('shop.currency', row.optionValue)
    } catch {
      /* siteCache 更新失败不阻断（TTL 兜底） */
    }
  })()
}

export function toCents(v: number): number {
  return Math.round(Number(v) * 100)
}

/** mock 收单事件签名（与 webhook 验签同构；并行方 paymentService.signWebhook 等价） */
export function signMockPayload(secret: string, payload: unknown): string {
  const t = Math.floor(Date.now() / 1000)
  const body = typeof payload === 'string' ? payload : JSON.stringify(payload)
  const v1 = createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')
  return `t=${t},v1=${v1}`
}
