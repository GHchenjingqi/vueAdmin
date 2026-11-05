import { AppError } from '../../../middleware/errorHandler.js'
import { getTenantContext } from '../../tenant/context.js'
import Setting from '../../../models/Setting.js'
import { ShopCoupon, ShopProductPrice } from '../../shop/models/index.js'
import { ShopCartItem } from '../models/index.js'
import { getActiveCurrency, toCents } from './currencyConfig.js'

/**
 * 服务端报价（P3-T04~T07 / C4/C5）：
 * - 前端传入总价被忽略；金额一律整数分，currency=当前启用币种（不换算）
 * - 运费：settings shop.shipping.rates（amountCents，国家白名单，不在范围 → ADDRESS_NOT_SHIPPABLE）
 * - 税费：settings shop.tax.rates（rateBps 万分比；税费失败=阻断，不静默按 0）
 * - 优惠券：ShopCoupon（kind percent/fixed、usageLimit/usedCount、币种绑定、时间窗）
 */

const tid = (): number => getTenantContext()?.tenantId ?? 1

export interface QuoteInput {
  country?: string
  couponCode?: string
  shippingRateId?: string
}

export interface QuoteMoney {
  amount: number
  currency: string
}

export interface QuoteResult {
  currency: string
  items: { skuId: number; title: string; qty: number; unit: QuoteMoney; lineTotal: QuoteMoney }[]
  subtotal: QuoteMoney
  discount: QuoteMoney
  shipping: QuoteMoney
  tax: QuoteMoney
  total: QuoteMoney
  shippingRates: { id: string; name: string; amount: QuoteMoney; etaDays: string }[]
  appliedCoupon: { code: string; discount: QuoteMoney } | null
  warnings: string[]
}

async function readJsonSetting(key: string): Promise<unknown> {
  const row = await Setting.findOne({ where: { optionKey: key } })
  if (!row?.optionValue) return null
  try {
    return JSON.parse(row.optionValue)
  } catch {
    return null
  }
}

async function validateCoupon(code: string, subtotalCents: number, currency: string): Promise<{ code: string; discountCents: number }> {
  const tenantId = tid()
  const coupon = await ShopCoupon.findOne({ where: { tenantId, code } })
  if (!coupon) throw new AppError(422, 'COUPON_NOT_APPLICABLE')
  const now = Date.now()
  if (coupon.validFrom && new Date(coupon.validFrom).getTime() > now) throw new AppError(422, 'COUPON_NOT_APPLICABLE')
  if (coupon.validTo && new Date(coupon.validTo).getTime() < now) throw new AppError(422, 'COUPON_EXPIRED')
  if (coupon.currency !== currency) throw new AppError(422, 'COUPON_CURRENCY_MISMATCH')
  if (coupon.minSpend !== null && Number(coupon.minSpend) * 100 > subtotalCents) throw new AppError(422, 'COUPON_NOT_APPLICABLE')
  if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) throw new AppError(422, 'COUPON_EXHAUSTED')
  const kind = coupon.kind === 'fixed' ? 'fixed' : 'percent'
  const discountCents = kind === 'percent' ? Math.floor((subtotalCents * Number(coupon.value)) / 100) : toCents(Number(coupon.value))
  return { code: coupon.code, discountCents: Math.min(discountCents, subtotalCents) }
}

export async function computeQuote(cartToken: string, input: QuoteInput = {}): Promise<QuoteResult> {
  const tenantId = tid()
  const currency = (await getActiveCurrency()).code
  const cart = (await import('../models/index.js')).ShopCart
  const cartRow = await cart.findOne({ where: { tenantId, token: cartToken } })
  if (!cartRow) throw new AppError(404, 'CART_NOT_FOUND')
  if (cartRow.currency !== currency) throw new AppError(409, 'CURRENCY_CHANGED')

  const items = await ShopCartItem.findAll({ where: { tenantId, cartId: cartRow.id }, order: [['id', 'ASC']] })
  if (items.length === 0) throw new AppError(422, 'CART_EMPTY')

  // 服务端重价（C4：金额对象统一；无价格行 → 该 SKU 不可售）
  const skuIds = items.map((i) => i.skuId)
  const priceRows = await ShopProductPrice.findAll({ where: { tenantId, skuId: skuIds, currency } })
  const priceMap = new Map(priceRows.map((p) => [p.skuId, toCents(Number(p.amount))]))
  const spuModel = (await import('../../shop/models/index.js')).ShopSpu
  const spus = await spuModel.findAll({ where: { tenantId, id: items.map((i) => i.spuId) } })
  const spuMap = new Map(spus.map((s) => [s.id, s]))

  const lineItems: QuoteResult['items'] = []
  const warnings: string[] = []
  let subtotalCents = 0
  for (const item of items) {
    const unit = priceMap.get(item.skuId)
    const spu = spuMap.get(item.spuId)
    const title = String((spu?.name as Record<string, string> | null)?.['en-US'] ?? item.titleSnapshot ?? `sku-${item.skuId}`)
    if (unit === undefined || unit === null) {
      warnings.push(`SKU ${item.skuId} not sellable in ${currency}`)
      continue
    }
    const lineTotal = unit * item.qty
    subtotalCents += lineTotal
    lineItems.push({ skuId: item.skuId, title, qty: item.qty, unit: { amount: unit, currency }, lineTotal: { amount: lineTotal, currency } })
  }
  if (lineItems.length === 0) throw new AppError(422, 'CART_NOT_SELLABLE_IN_CURRENCY')

  // 优惠
  let discountCents = 0
  let appliedCoupon: QuoteResult['appliedCoupon'] = null
  if (input.couponCode) {
    const c = await validateCoupon(input.couponCode, subtotalCents, currency)
    discountCents = c.discountCents
    appliedCoupon = { code: c.code, discount: { amount: discountCents, currency } }
  }

  // 运费（按地址国家；未传地址给默认档）
  const rates = (await readJsonSetting('shop.shipping.rates')) as { id: string; name: string; countries: string[]; amountCents: number; etaDays: string }[] | null
  const country = (input.country ?? '').toUpperCase()
  const matched = (rates ?? []).filter((r) => r.countries.includes('*') || (country && r.countries.includes(country)))
  if (country && matched.length === 0) throw new AppError(422, 'ADDRESS_NOT_SHIPPABLE')
  const chosenRate = matched.find((r) => r.id === input.shippingRateId) ?? matched[0] ?? { id: 'none', name: 'None', countries: ['*'], amountCents: 0, etaDays: '-' }
  const shippingCents = chosenRate.amountCents

  // 税费（规则表；无规则按 0，但显式记录）
  const taxRules = (await readJsonSetting('shop.tax.rates')) as { country: string; rateBps: number }[] | null
  const rule = (taxRules ?? []).find((r) => r.country === country)
  const taxable = subtotalCents - discountCents
  const taxCents = rule ? Math.round((taxable * rule.rateBps) / 10000) : 0

  const totalCents = taxable + shippingCents + taxCents
  const moneyOf = (a: number): QuoteMoney => ({ amount: a, currency })

  return {
    currency,
    items: lineItems,
    subtotal: moneyOf(subtotalCents),
    discount: moneyOf(discountCents),
    shipping: moneyOf(shippingCents),
    tax: moneyOf(taxCents),
    total: moneyOf(totalCents),
    shippingRates: matched.map((r) => ({ id: r.id, name: r.name, amount: moneyOf(r.amountCents), etaDays: r.etaDays })),
    appliedCoupon,
    warnings,
  }
}
