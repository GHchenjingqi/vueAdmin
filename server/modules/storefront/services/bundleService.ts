import { Op } from 'sequelize'
import { AppError } from '../../../middleware/errorHandler.js'
import { getTenantContext } from '../../tenant/context.js'
import ShopBundle, { type BundleComponent } from '../../shop/models/ShopBundle.js'
import { ShopSku, ShopProductPrice } from '../../shop/models/index.js'

/**
 * Bundle / 搭配购（P5-T05）。
 *
 * - 匹配：购物车行「包含」Bundle 全部组件（每个组件 skuId 的 qty ≥ 组件 qty）即命中；
 * - 报价：仅在服务端 createQuote 完成（前端不传 bundle 价）；命中后按组件小计应用折扣，
 *   并做行级分摊（按各组件行金额比例），订单仍按组件 SKU 建明细（库存按组件扣减）；
 * - 库存：订单明细为组件 SKU，沿用 occupy/reserveItems 的按组件扣减，不单独建 bundle 虚拟 SKU；
 * - 推荐位：placement 命中的 active Bundle 经 /recommendations 返回。
 */

const tid = (): number => getTenantContext()?.tenantId ?? 1

export interface BundleLine {
  skuId: number
  qty: number
  unitAmountCents: number
}

export interface BundleEvaluation {
  bundleId: number
  bundleName: Record<string, string>
  /** 命中的组件行（skuId/qty/unitAmountCents），用于行级分摊 */
  components: BundleComponent[]
  /** Bundle 小计（按组件 × 单价） */
  bundleSubtotalCents: number
  /** 应用折扣后的优惠金额 */
  discountCents: number
  currency: string
}

/** 取生效中的 active Bundle（币种过滤） */
export async function getActiveBundles(currency: string): Promise<ShopBundle[]> {
  const today = new Date().toISOString().slice(0, 10)
  return ShopBundle.findAll({
    where: {
      tenantId: tid(),
      active: true,
      currency: currency.toUpperCase(),
      startAt: { [Op.lte]: today } as never,
      endAt: { [Op.gte]: today } as never,
    },
  })
}

/** 购物车行是否包含某 Bundle 的全部组件（qty ≥ 组件 qty） */
export function containsBundle(cartLines: { skuId: number; qty: number }[], bundle: ShopBundle): boolean {
  const comps = bundle.components as BundleComponent[]
  if (!Array.isArray(comps) || comps.length === 0) return false
  for (const c of comps) {
    const line = cartLines.find((l) => l.skuId === c.skuId)
    if (!line || line.qty < c.qty) return false
  }
  return true
}

/** 评估命中 Bundle 的优惠（纯读，无副作用）。返回 null 表示未命中/无有效价。 */
export async function evaluateBundle(
  lines: { skuId: number; qty: number }[],
  currency: string,
): Promise<BundleEvaluation | null> {
  const tId = tid()
  const bundles = await getActiveBundles(currency)
  for (const bundle of bundles) {
    if (!containsBundle(lines, bundle)) continue
    const comps = bundle.components as BundleComponent[]
    // 逐组件取币种单价（缺失价则跳过该 bundle，fail-safe 不误打折）
    let bundleSubtotalCents = 0
    const priced: BundleLine[] = []
    for (const c of comps) {
      const priceRow = await ShopProductPrice.findOne({ where: { skuId: c.skuId, currency, tenantId: tId } })
      if (!priceRow) {
        bundleSubtotalCents = 0
        break
      }
      const unit = Math.round(Number(priceRow.amount) * 100)
      bundleSubtotalCents += unit * c.qty
      priced.push({ skuId: c.skuId, qty: c.qty, unitAmountCents: unit })
    }
    if (priced.length !== comps.length || bundleSubtotalCents <= 0) continue
    const raw = Number(bundle.discountValue)
    let discountCents = bundle.discountType === 'percent' ? Math.round((bundleSubtotalCents * raw) / 100) : Math.round(raw * 100)
    discountCents = Math.max(0, Math.min(discountCents, bundleSubtotalCents))
    if (discountCents <= 0) continue
    return {
      bundleId: bundle.id,
      bundleName: bundle.name,
      components: comps,
      bundleSubtotalCents,
      discountCents,
      currency: currency.toUpperCase(),
    }
  }
  return null
}

/** 命中 Bundle 的行级分摊：按各组件行金额比例分配优惠，返回 skuId → 行优惠分（分） */
export function allocateBundleDiscount(evalResult: BundleEvaluation, lines: { skuId: number; qty: number; lineTotalCents: number }[]): Map<number, number> {
  const alloc = new Map<number, number>()
  if (evalResult.bundleSubtotalCents <= 0) return alloc
  let allocated = 0
  for (const comp of evalResult.components) {
    const line = lines.find((l) => l.skuId === comp.skuId)
    const base = comp.qty * (line ? line.lineTotalCents / Math.max(1, line.qty) : 0)
    const share = Math.round((base / evalResult.bundleSubtotalCents) * evalResult.discountCents)
    alloc.set(comp.skuId, share)
    allocated += share
  }
  // 分摊舍入误差归到最后一个组件
  if (allocated !== evalResult.discountCents && evalResult.components.length > 0) {
    const last = evalResult.components[evalResult.components.length - 1].skuId
    alloc.set(last, (alloc.get(last) ?? 0) + (evalResult.discountCents - allocated))
  }
  return alloc
}

/** 推荐位：返回指定 placement 的 active Bundle（含组件商品摘要） */
export async function listRecommendedBundles(placement: string, currency: string) {
  const tId = tid()
  const today = new Date().toISOString().slice(0, 10)
  const rows = await ShopBundle.findAll({
    where: {
      tenantId: tId,
      active: true,
      placement,
      currency: currency.toUpperCase(),
      startAt: { [Op.lte]: today } as never,
      endAt: { [Op.gte]: today } as never,
    },
  })
  const out = []
  for (const b of rows) {
    const comps = b.components as BundleComponent[]
    const skuIds = comps.map((c) => c.skuId)
    const skus = await ShopSku.findAll({ where: { id: skuIds, tenantId: tId } })
    const skuMap = new Map(skus.map((s) => [s.id, s]))
    out.push({
      id: b.id,
      name: b.name,
      placement: b.placement,
      currency: b.currency,
      discountType: b.discountType,
      discountValue: Number(b.discountValue),
      components: comps.map((c) => ({
        skuId: c.skuId,
        qty: c.qty,
        spuId: skuMap.get(c.skuId)?.spuId ?? null,
      })),
    })
  }
  return out
}
