import { AppError } from '../../../middleware/errorHandler.js'
import { getTenantContext } from '../../tenant/context.js'
import { ShopSku, ShopSpu, ShopProductPrice } from '../../shop/models/index.js'
import * as inventoryService from '../../shop/services/inventoryService.js'
import config from '../../../config/index.js'
import type { StorefrontSite } from '../middleware/siteContext.js'

/**
 * 结算报价服务（阶段 5 步骤 4 / P3-T04）
 *
 * 核心原则：服务端子价格重算，前端传入的任何总价均被忽略。
 * - currency 取当前站点配置币种（来源 siteContext 注入的 site.defaultCurrency）；
 * - 购物车币种与配置不一致 → 抛 CURRENCY_CHANGED，要求前端重建报价；
 * - 逐项校验可售 + 可用库存，不足直接拒绝；
 * - 运费 / 税费为占位规则（config.checkout），待 P3-T05 / P3-T06 接入真实 Provider 后替换；
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
  discountCents: number
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
  input: { cartToken?: string; items?: { skuId: number; qty: number }[] },
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

  // 运费 / 税费占位规则（P3-T05 / P3-T06 接入真实 Provider 后替换）
  const shippingCents = Math.round(Number(config.checkout?.shippingCents ?? 0))
  const taxCents = Math.round(subtotalCents * Number(config.checkout?.taxRate ?? 0))
  const discountCents = 0
  const amountCents = subtotalCents + shippingCents + taxCents - discountCents

  return {
    currency,
    items: quoteLines,
    subtotalCents,
    shippingCents,
    taxCents,
    discountCents,
    amountCents,
    version: Date.now(),
    expiresAt: new Date(Date.now() + QUOTE_TTL_MS).toISOString(),
  }
}
