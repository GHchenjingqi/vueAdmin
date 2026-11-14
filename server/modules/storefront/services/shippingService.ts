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

/** 可选配送档位：在分区基础运费之上叠加固定加价（如特快件）。缺省时只有标准档。 */
export interface ShippingOption {
  id: string
  name: string
  surchargeCents: number
  etaDays: string
}

export interface ShippingConfig {
  mode: 'whitelist'
  allowedCountries: string[]
  zones: ShippingZone[]
  defaultShippingCents: number
  /** 后台可配的配送档位；未配置时回退为单一标准档（向后兼容旧配置） */
  options?: ShippingOption[]
}

const SETTING_KEY = 'shop.shipping'
const TTL_MS = 60_000
const cache: { value: ShippingConfig | null; expiresAt: number } = { value: null, expiresAt: 0 }

/**
 * 配置注入点（与 taxService.setTaxProvider / promotionService.setPromotionEvaluator 同款惯例）。
 *
 * 用于单测隔离：共享库的 `settings.shop.shipping` 是全局单行（非租户维度），
 * 直接改它会与并行测试竞态；注入后档位加价链路可确定性测试。
 * 生产不设置时走默认实现（DB 读取 + 缓存），行为不变。
 */
type ShippingConfigProvider = () => Promise<ShippingConfig>
let shippingConfigProvider: ShippingConfigProvider | null = null

export function setShippingConfigProvider(provider: ShippingConfigProvider | null): void {
  shippingConfigProvider = provider
  clearShippingCache()
}

/** 后台改配置后主动失效（对齐 currencyConfig 的缓存治理） */
export function clearShippingCache(): void {
  cache.value = null
  cache.expiresAt = 0
}

const iso2 = (v: unknown): boolean => typeof v === 'string' && /^[A-Z]{2}$/.test(v.trim().toUpperCase())

/** 默认档位：旧配置（无 options）时唯一可选，id 与前端历史写死的 'std' 保持一致 */
export const DEFAULT_SHIPPING_OPTION: ShippingOption = { id: 'std', name: 'Standard', surchargeCents: 0, etaDays: '7-12' }

/** 校验档位数组：id 唯一非空、加价非负整数、etaDays 为可读字符串 */
function validateShippingOptions(raw: unknown): ShippingOption[] | undefined {
  if (raw === undefined || raw === null) return undefined
  if (!Array.isArray(raw) || raw.length === 0) throw new AppError(503, 'SHOP_SHIPPING_CONFIG_INVALID')
  const seen = new Set<string>()
  const out: ShippingOption[] = []
  for (const item of raw) {
    const o = item as ShippingOption | null
    if (!o || typeof o !== 'object') throw new AppError(503, 'SHOP_SHIPPING_CONFIG_INVALID')
    const id = typeof o.id === 'string' ? o.id.trim() : ''
    if (!/^[a-z0-9_-]{1,20}$/i.test(id) || seen.has(id)) throw new AppError(503, 'SHOP_SHIPPING_CONFIG_INVALID')
    if (!Number.isInteger(o.surchargeCents) || o.surchargeCents < 0) throw new AppError(503, 'SHOP_SHIPPING_CONFIG_INVALID')
    if (typeof o.name !== 'string' || !o.name.trim()) throw new AppError(503, 'SHOP_SHIPPING_CONFIG_INVALID')
    if (typeof o.etaDays !== 'string' || !/^[\d\s-]{1,20}$/.test(o.etaDays)) throw new AppError(503, 'SHOP_SHIPPING_CONFIG_INVALID')
    seen.add(id)
    out.push({ id, name: o.name.trim(), surchargeCents: o.surchargeCents, etaDays: o.etaDays.trim() })
  }
  return out
}

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
    options: validateShippingOptions((cfg as { options?: unknown }).options),
  }
}

export async function getActiveShipping(): Promise<ShippingConfig> {
  // 测试注入路径：不走缓存，避免 provider 在多次调用间被 60s 缓存掩盖
  if (shippingConfigProvider) return shippingConfigProvider()
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

/** 读取可用配送档位（旧配置无 options 时回退为单一标准档） */
export async function listShippingOptions(): Promise<ShippingOption[]> {
  const cfg = await getActiveShipping()
  return cfg.options && cfg.options.length > 0 ? cfg.options : [DEFAULT_SHIPPING_OPTION]
}

/** 可配送国家白名单（供 C 端国家下拉与后台配置同源，避免前端写死） */
export async function listShippableCountries(): Promise<string[]> {
  const cfg = await getActiveShipping()
  return [...cfg.allowedCountries]
}

/**
 * 解析收货地址 → 国家 + 分区运费。
 * 未提供地址时返回旧行为（config.checkout.shippingCents），不触发配置读取。
 *
 * shippingRateId 指定档位时，在分区基础运费上叠加该档位 surchargeCents；
 * 未指定或档位不存在时回退标准档（加价 0），保证既有调用方行为不变。
 */
export async function resolveShipping(
  address?: Record<string, unknown> | null,
  shippingRateId?: string,
): Promise<{
  country: string | null
  shippingCents: number
  shippingOption: ShippingOption
  shippingOptions: ShippingOption[]
}> {
  const options = await listShippingOptions().catch(() => [DEFAULT_SHIPPING_OPTION])
  const selected =
    options.find((o) => o.id === shippingRateId) ??
    options.find((o) => o.id === DEFAULT_SHIPPING_OPTION.id) ??
    options[0]

  if (!address || typeof address !== 'object' || Object.keys(address).length === 0) {
    const base = Math.round(Number(config.checkout?.shippingCents ?? 0))
    return { country: null, shippingCents: base + selected.surchargeCents, shippingOption: selected, shippingOptions: options }
  }
  const country = extractCountry(address)
  if (!country) throw new AppError(400, 'ADDRESS_COUNTRY_REQUIRED: 收货地址缺少有效的两位国家码')

  const cfg = await getActiveShipping()
  if (!cfg.allowedCountries.includes(country)) {
    throw new AppError(400, `ADDRESS_NOT_SHIPPABLE: 国家 ${country} 不在配送范围`)
  }
  const zone = cfg.zones.find((z) => z.countries.includes(country))
  const base = zone ? zone.shippingCents : cfg.defaultShippingCents
  return { country, shippingCents: base + selected.surchargeCents, shippingOption: selected, shippingOptions: options }
}
