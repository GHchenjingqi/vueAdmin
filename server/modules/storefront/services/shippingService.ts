import { AppError } from '../../../middleware/errorHandler.js'
import Setting from '../../../models/Setting.js'
import config from '../../../config/index.js'

/**
 * 配送范围与分区运费（T-08 / P3-T05）
 *
 * 唯一数据源：settings.optionKey='shop.shipping'（迁移 000060 种入）。
 * - 白名单 fail-closed：配置缺失/非法 → 503，不静默放行；
 * - 进程内缓存 TTL 60s，后台改配置后可调 clearShippingCache 主动失效；
 * - 未提供收货地址时沿用 config.checkout.shippingCents 的既有行为（不读配置），
 *   保证历史链路与既有调用方不受影响；一旦提供地址，则强制校验国家。
 *
 * 金额一律整数「分」，禁止浮点运算。
 */

export interface ShippingZone {
  countries: string[]
  shippingCents: number
}

export interface ShippingConfig {
  mode: 'whitelist'
  allowedCountries: string[]
  zones: ShippingZone[]
  defaultShippingCents: number
}

const SETTING_KEY = 'shop.shipping'
const TTL_MS = 60_000
const cache: { value: ShippingConfig | null; expiresAt: number } = { value: null, expiresAt: 0 }

/** 后台改配置后主动失效（对齐 currencyConfig 的缓存治理） */
export function clearShippingCache(): void {
  cache.value = null
  cache.expiresAt = 0
}

const iso2 = (v: unknown): boolean => typeof v === 'string' && /^[A-Z]{2}$/.test(v.trim().toUpperCase())

export function validateShippingConfig(raw: unknown): ShippingConfig {
  const cfg = raw as ShippingConfig | null
  if (!cfg || typeof cfg !== 'object') throw new AppError(503, 'SHOP_SHIPPING_CONFIG_MISSING')
  if (cfg.mode !== 'whitelist') throw new AppError(503, 'SHOP_SHIPPING_CONFIG_INVALID')
  if (!Array.isArray(cfg.allowedCountries) || cfg.allowedCountries.length === 0 || !cfg.allowedCountries.every(iso2)) {
    throw new AppError(503, 'SHOP_SHIPPING_CONFIG_INVALID')
  }
  const zones = Array.isArray(cfg.zones) ? cfg.zones : []
  for (const z of zones) {
    if (!z || !Array.isArray(z.countries) || !z.countries.every(iso2) || !Number.isInteger(z.shippingCents) || z.shippingCents < 0) {
      throw new AppError(503, 'SHOP_SHIPPING_CONFIG_INVALID')
    }
  }
  const fallback = Number(cfg.defaultShippingCents)
  if (!Number.isInteger(fallback) || fallback < 0) throw new AppError(503, 'SHOP_SHIPPING_CONFIG_INVALID')

  return {
    mode: 'whitelist',
    allowedCountries: [...new Set(cfg.allowedCountries.map((c) => c.trim().toUpperCase()))],
    zones: zones.map((z) => ({ countries: z.countries.map((c) => c.trim().toUpperCase()), shippingCents: z.shippingCents })),
    defaultShippingCents: fallback,
  }
}

export async function getActiveShipping(): Promise<ShippingConfig> {
  const now = Date.now()
  if (cache.value && now < cache.expiresAt) return cache.value
  const row = await Setting.findOne({ where: { optionKey: SETTING_KEY } })
  if (!row?.optionValue) throw new AppError(503, 'SHOP_SHIPPING_CONFIG_MISSING')
  let parsed: unknown
  try {
    parsed = JSON.parse(row.optionValue)
  } catch {
    throw new AppError(503, 'SHOP_SHIPPING_CONFIG_INVALID')
  }
  const value = validateShippingConfig(parsed)
  cache.value = value
  cache.expiresAt = now + TTL_MS
  return value
}

/** 从收货地址提取 ISO-3166-1 alpha-2 国家码；兼容前端常见字段名 */
export function extractCountry(address: Record<string, unknown> | null | undefined): string | null {
  if (!address || typeof address !== 'object') return null
  const raw = address.country ?? address.countryCode ?? address.country_code
  if (typeof raw !== 'string' || !/^[A-Za-z]{2}$/.test(raw.trim())) return null
  return raw.trim().toUpperCase()
}

/** 只做范围判定（供支付会话在「创建可支付订单」前调用） */
export async function assertShippableCountry(country: string): Promise<void> {
  const cfg = await getActiveShipping()
  if (!cfg.allowedCountries.includes(country.trim().toUpperCase())) {
    throw new AppError(409, `ADDRESS_NOT_SHIPPABLE: 国家 ${country} 不在配送范围`)
  }
}

/**
 * 解析收货地址 → 国家 + 分区运费。
 * 未提供地址时返回旧行为（config.checkout.shippingCents），不触发配置读取。
 */
export async function resolveShipping(
  address?: Record<string, unknown> | null,
): Promise<{ country: string | null; shippingCents: number }> {
  if (!address || typeof address !== 'object' || Object.keys(address).length === 0) {
    return { country: null, shippingCents: Math.round(Number(config.checkout?.shippingCents ?? 0)) }
  }
  const country = extractCountry(address)
  if (!country) throw new AppError(400, 'ADDRESS_COUNTRY_REQUIRED: 收货地址缺少有效的两位国家码')

  const cfg = await getActiveShipping()
  if (!cfg.allowedCountries.includes(country)) {
    throw new AppError(400, `ADDRESS_NOT_SHIPPABLE: 国家 ${country} 不在配送范围`)
  }
  const zone = cfg.zones.find((z) => z.countries.includes(country))
  return { country, shippingCents: zone ? zone.shippingCents : cfg.defaultShippingCents }
}
