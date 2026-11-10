import { AppError } from '../../../middleware/errorHandler.js'
import { getTenantContext } from '../../tenant/context.js'
import { ShopSku, ShopSpu, ShopProductPrice, ShopCustomer, ShopMembershipTier } from '../../shop/models/index.js'
import * as inventoryService from '../../shop/services/inventoryService.js'
import { getDeliveryCommitment, type DeliveryCommitment } from '../../shop/services/warehouseRoutingService.js'
import { evaluateBundle, allocateBundleDiscount } from './bundleService.js'
import { resolveShipping } from './shippingService.js'
import { evaluateCoupon } from './couponService.js'
import { resolveTax } from './taxService.js'
import { extractCountry } from './shippingService.js'
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
  /** P5-T04：按仓配送承诺（该 SKU 路由后的主仓） */
  deliveryCommitment: DeliveryCommitment | null
  /** P5-T05：命中 Bundle 时标记（组件行分摊后价格已含优惠） */
  bundleId?: number | null
  bundleName?: Record<string, string> | null
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
  /** P5-T04：按仓配送承诺（路由后的主仓；无库存记录为 null） */
  deliveryCommitment: DeliveryCommitment | null
  /** P5-T05：命中 Bundle 的优惠金额（分，未命中为 0） */
  bundleDiscountCents: number
  /** P5-T05：命中的 Bundle 摘要 */
  bundle: { id: number; name: Record<string, string> } | null
  /** 会员等级折扣（分；顾客下单且等级 discountPct>0 时 >0） */
  tierDiscountCents: number
  /** 会员等级名（游客为 null） */
  tierName: string | null
  /** 积分抵扣（分；pointsToRedeem>0 时 >0） */
  pointsDiscountCents: number
  /** 服务端校验后实际采用的抵扣积分（≤ 请求值与余额） */
  pointsToRedeem: number
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
    /** 顾客 ID（会员折扣/积分抵扣；游客不传） */
    customerId?: number
    /** 要抵扣的积分数（服务端钳制到余额与应付） */
    pointsToRedeem?: number
  },
): Promise<QuoteResult> {
  const { currency, lines } = await resolveQuoteLines(site, input)
  const tId = tid()
  const quoteLines: QuoteLine[] = []
  const destCountry = extractCountry(input.shippingAddress)

  let subtotalCents = 0
  // 同一 skuId 可能在 items / 购物车中拆成多行，库存校验必须按累计需求比较，
  // 否则每行单独通过而总需求已超可用量，报价会给出根本无法成交的结果。
  const requestedBySku = new Map<number, number>()
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
    const requestedQty = (requestedBySku.get(sku.id) ?? 0) + line.qty
    requestedBySku.set(sku.id, requestedQty)
    const available = await inventoryService.available(sku.id)
    if (available < requestedQty) throw new AppError(400, `SKU ${line.skuId} 库存不足（可用 ${available}，需 ${requestedQty}）`)

    // P5-T04：按仓配送承诺（路由后的主仓，按目的国区域/优先级/可用量）
    const deliveryCommitment = await getDeliveryCommitment(sku.id, destCountry)

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
      deliveryCommitment,
    })
  }

  // P5-T05：Bundle / 搭配购 —— 服务端匹配并按组件小计打折（命中后行级分摊，库存仍按组件 SKU 扣减）
  const bundleEval = await evaluateBundle(lines, currency)
  let bundleDiscountCents = 0
  let bundleInfo: { id: number; name: Record<string, string> } | null = null
  if (bundleEval) {
    bundleDiscountCents = bundleEval.discountCents
    bundleInfo = { id: bundleEval.bundleId, name: bundleEval.bundleName }
    const alloc = allocateBundleDiscount(bundleEval, quoteLines)
    for (const line of quoteLines) {
      const share = alloc.get(line.skuId) ?? 0
      if (share > 0) {
        // 组件行：把分摊到的优惠折入单价（保留分整数，行金额随之下降）
        line.unitAmountCents = Math.max(0, line.unitAmountCents - Math.round(share / line.qty))
        line.lineTotalCents = line.unitAmountCents * line.qty
        line.bundleId = bundleEval.bundleId
        line.bundleName = bundleEval.bundleName
      }
    }
    subtotalCents = quoteLines.reduce((s, l) => s + l.lineTotalCents, 0)
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
  const couponDiscountCents = coupon?.discountCents ?? 0
  // P5-T05 修复：bundle 优惠已在 L165-171 折入行单价并重算 subtotalCents，
  // 因此 discountCents 只表示「从折后小计额外扣减的券折」。
  // 原实现把 bundleDiscountCents 再次计入 discountCents，导致同一笔优惠被扣两次
  // （订单明细合计 != amountCents，商户每单多让利一倍优惠）。
  // bundle 优惠仍由 bundleDiscountCents / bundle 字段单独暴露给前端展示。
  const discountCents = couponDiscountCents

  // 会员等级折扣（跨境惯例：按商品小计打折，不含运费/税费；游客/无折扣等级跳过）
  let tierDiscountCents = 0
  let tierName: string | null = null
  if (input.customerId) {
    const customer = await ShopCustomer.findOne({ where: { id: input.customerId, tenantId: tId }, attributes: ['membershipTierId'] })
    if (customer?.membershipTierId) {
      const tier = await ShopMembershipTier.findOne({ where: { id: customer.membershipTierId, tenantId: tId } })
      if (tier && tier.discountPct > 0 && tier.discountPct < 100) {
        tierDiscountCents = Math.round((subtotalCents * (100 - tier.discountPct)) / 100)
        tierName = tier.name
      }
    }
  }

  // 积分抵扣：1 积分 = 1 元本币 = 100 分；服务端钳制（≤ 余额、≤ 折后应付），游客/非法值忽略
  let pointsToRedeem = 0
  let pointsDiscountCents = 0
  if (input.customerId && input.pointsToRedeem && input.pointsToRedeem > 0) {
    const customer = await ShopCustomer.findOne({ where: { id: input.customerId, tenantId: tId }, attributes: ['points'] })
    const balance = customer?.points ?? 0
    pointsToRedeem = Math.min(Math.floor(input.pointsToRedeem), balance)
    if (pointsToRedeem > 0) {
      pointsDiscountCents = pointsToRedeem * 100
      // 抵扣不得使应付为负：钳制到折后应付（含券折/会员折/运费/税费后）
      const payable = Math.max(0, subtotalCents + shippingCents + taxCents - discountCents - tierDiscountCents)
      if (pointsDiscountCents > payable) {
        pointsDiscountCents = payable
        pointsToRedeem = Math.ceil(pointsDiscountCents / 100)
      }
    }
  }

  const amountCents = Math.max(0, subtotalCents + shippingCents + taxCents - discountCents - tierDiscountCents - pointsDiscountCents)

  // P5-T04：订单级配送承诺 = 各 SKU 主仓承诺的最大值（取最不利/最长），无库存记录为 null
  const commitments = quoteLines
    .map((l) => l.deliveryCommitment)
    .filter((c): c is DeliveryCommitment => !!c)
  const orderCommitment: DeliveryCommitment | null =
    commitments.length === 0
      ? null
      : commitments.reduce((a, b) => (b.deliveryEstimateDays > a.deliveryEstimateDays ? b : a))

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
    deliveryCommitment: orderCommitment,
    bundleDiscountCents,
    bundle: bundleInfo,
    tierDiscountCents,
    tierName,
    pointsDiscountCents,
    pointsToRedeem,
    amountCents,
    version: Date.now(),
    expiresAt: new Date(Date.now() + QUOTE_TTL_MS).toISOString(),
  }
}
