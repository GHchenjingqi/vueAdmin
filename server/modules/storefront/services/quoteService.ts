import { AppError } from '../../../middleware/errorHandler.js'
import { getTenantContext } from '../../tenant/context.js'
import { ShopSku, ShopSpu, ShopProductPrice } from '../../shop/models/index.js'
import * as inventoryService from '../../shop/services/inventoryService.js'
import { resolveShipping } from './shippingService.js'
import { evaluateCoupon } from './couponService.js'
import { resolveTax } from './taxService.js'
import type { StorefrontSite } from '../middleware/siteContext.js'

/**
 * 结算报价服务（阶段 5 步骤 4 / P3-T04）
 *
 * 核心原则：服务端子价格重算，前端传入的任何总价均被忽略。
 * - currency 取当前站点配置币种（来源 siteContext 注入的 site.defaultCurrency）；
 * - 购物车币种与配置不一致 → 抛 CURRENCY_CHANGED，要求前端重建报价；
 * - 逐项校验可售 + 可用库存，不足直接拒绝；
 * - 运费：提供收货地址时按 settings.shop.shipping 白名单校验并按分区计费（T-08 / P3-T05）；
 * - 税费：提供目的国时按 P3-T06 可插拔 TaxProvider 计算，目的国无配置税率则阻断报价（fail-closed）。
 * - 返回版本号 + 过期时间，供建单时校验报价新鲜度。
 */

const tid = (): number => getTenantContext()?.tenantId ?? 1

const QUOTE_TTL_MS = 15 * 60_000

export interface QuoteLine {
  skuId: number
  spuId: number
  title: string | null
  spec: Record<string, string> | null
  unitAmountCents: number
  qty: number
  lineTotalCents: number
  available: number
}

export interface QuoteResult {
  currency: string
  items: QuoteLine[]
  subtotalCents: number
  shippingCents: number
  taxCents: number
  /** 实际适用税率（0..1），未计税费时为 0 */
  taxRate: number
  discountCents: number
  /** T-07：服务端校验通过的券码 / 券 ID（供建单占用，未用券为 null） */
  couponCode: string | null
  couponId: number | null
  amountCents: number
  version: number
  expiresAt: string
}

function localize(value: Record<string, string> | null | undefined, lang: string): string {
  if (!value) return ''
  return value[lang] ?? value['en-US'] ?? value['zh-CN'] ?? Object.values(value)[0] ?? ''
}

/** 将输入（购物车 token 或显式明细）解析为待报价行，并做币种一致性校验 */
export async function resolveQuoteLines(
  site: StorefrontSite,
  input: { cartToken?: string; items?: { skuId: number; qty: number }[] },
): Promise<{ currency: string; lines: { skuId: number; qty: number }[] }> {
  const tId = tid()
  const currency = site.defaultCurrency

  if (input.cartToken) {
    const { ShopCart, ShopCartItem } = await import('../../shop/models/index.js')
    const cart = await ShopCart.findOne({ where: { token: input.cartToken, tenantId: tId } })
    if (!cart) throw new AppError(404, '购物车不存在')
    if (cart.currency !== currency) {
      // 站点币种已切换，要求前端以新币种重建（清理旧购物车或重新加购）
      throw new AppError(409, 'CURRENCY_CHANGED')
    }
    const rows = await ShopCartItem.findAll({ where: { cartId: cart.id, tenantId: tId } })
    if (rows.length === 0) throw new AppError(400, '购物车为空')
    return {
      currency,
      lines: rows.map((r) => ({ skuId: r.skuId, qty: r.qty })),
    }
  }

  if (input.items && input.items.length > 0) {
    return { currency, lines: input.items.map((i) => ({ skuId: i.skuId, qty: i.qty })) }
  }

  throw new AppError(400, '请提供购物车 token 或商品明细')
}

/** 服务端重算报价 */
export async function createQuote(
  site: StorefrontSite,
  input: {
    cartToken?: string
    items?: { skuId: number; qty: number }[]
    shippingAddress?: Record<string, unknown> | null
    couponCode?: string
  },
): Promise<QuoteResult> {
  const { currency, lines } = await resolveQuoteLines(site, input)
  const tId = tid()
  const quoteLines: QuoteLine[] = []

  let subtotalCents = 0
  for (const line of lines) {
    const sku = await ShopSku.findOne({ where: { id: line.skuId, tenantId: tId } })
    if (!sku) throw new AppError(404, `SKU ${line.skuId} 不存在`)
    const spu = await ShopSpu.findOne({ where: { id: sku.spuId, tenantId: tId } })

    // 仅接受当前配置币种的报价；缺失即拒绝（fail closed）
    const priceRow = await ShopProductPrice.findOne({
      where: { skuId: sku.id, currency, tenantId: tId },
    })
    if (!priceRow) throw new AppError(400, `SKU ${line.skuId} 在币种 ${currency} 下无有效报价`)

    const unitAmountCents = Math.round(Number(priceRow.amount) * 100)
    const available = await inventoryService.available(sku.id)
    if (available < line.qty) throw new AppError(400, `SKU ${line.skuId} 库存不足（可用 ${available}，需 ${line.qty}）`)

    const lineTotalCents = unitAmountCents * line.qty
    subtotalCents += lineTotalCents
    quoteLines.push({
      skuId: sku.id,
      spuId: sku.spuId,
      title: spu ? localize(spu.name, site.defaultLocale) : null,
      spec: sku.spec ?? null,
      unitAmountCents,
      qty: line.qty,
      lineTotalCents,
      available,
    })
  }

  // 运费：地址驱动的白名单校验 + 分区计费（服务端重算，忽略前端传入运费）
  const { shippingCents } = await resolveShipping(input.shippingAddress)
  // 税费：仅当提供目的国时计算；目的国无配置税率时 Provider 会阻断报价（fail-closed，不静默按 0）
  let taxCents = 0
  let taxRate = 0
  if (input.shippingAddress && input.shippingAddress.country) {
    const tax = await resolveTax({
      country: String(input.shippingAddress.country),
      subtotalCents,
      currency,
    })
    taxCents = tax.taxCents
    taxRate = tax.rate
  }

  // T-07：券码由服务端校验并重算折扣，前端传入的任何折扣金额一律忽略
  const coupon = await evaluateCoupon(input.couponCode, { currency, subtotalCents })
  const discountCents = coupon?.discountCents ?? 0
  const amountCents = subtotalCents + shippingCents + taxCents - discountCents

  return {
    currency,
    items: quoteLines,
    subtotalCents,
    shippingCents,
    taxCents,
    taxRate,
    discountCents,
    couponCode: coupon?.couponCode ?? null,
    couponId: coupon?.couponId ?? null,
    amountCents,
    version: Date.now(),
    expiresAt: new Date(Date.now() + QUOTE_TTL_MS).toISOString(),
  }
}
