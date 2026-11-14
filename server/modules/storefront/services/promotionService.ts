import { Op } from 'sequelize'
import { ShopCategory, ShopPromotion, ShopSku, ShopSpu } from '../../shop/models/index.js'
import { getTenantContext } from '../../tenant/context.js'

/**
 * 促销活动求值（PLAN 3.1）
 *
 * 背景：后台可建促销（`promotions` 表 + 完整 CRUD），但 `quoteService` 的优惠计算只认
 * 搭配购 / 优惠券 / 会员等级 / 积分四类，`activePromotions()` 全仓无调用方 ——
 * 运营建的活动不进入任何订单金额。
 *
 * 设计取舍（保守优先，避免误伤金额）：
 * - 只消费后台界面实际能写入的形态：`type='discount'` + `rule.rate`（0..1 的折后系数）。
 *   后台表单对 `full_reduce` 也只写 `rate`，没有阶梯数据，因此不做满减猜测。
 * - `scope='all'` 直接对商品小计打折；`sku/spu/category` 因后台表单没有「绑定哪个对象」的字段，
 *   缺少可判定的目标，**跳过并记录原因**，不猜。
 * - 多活动命中取「折扣最深」的一个，不做叠加：叠加顺序未由业务确认（PLAN 业务待确认项 4），
 *   叠加实现会在规则未定时产生折上折归零风险。
 * - 仅在 `startAt <= today <= endAt` 内生效，日期格式为 DATEONLY。
 */

const tid = (): number => getTenantContext()?.tenantId ?? 1

export interface PromotionEvaluation {
  promotionId: number
  /** 命中的活动名（多语言 JSON，原样返回供上层本地化） */
  name: Record<string, string>
  /** 折后系数（0..1），如 0.8 表示 8 折 */
  rate: number
  discountCents: number
}

export interface PromotionContext {
  currency: string
  /** 参与促销的商品小计（分） */
  subtotalCents: number
  /** 命中明细（供未来按行分摊；当前 all 范围不需要） */
  skuIds?: number[]
  spuIds?: number[]
  categoryIds?: number[]
}

function parseRate(rule: unknown): number | null {
  const r = rule as Record<string, unknown> | null
  if (!r || typeof r !== 'object') return null
  const raw = r.rate
  const rate = typeof raw === 'number' ? raw : Number(raw)
  // rate 语义是「折后系数」：0.8 = 打 8 折。0 或负数会让订单归零，按非法处理。
  if (!Number.isFinite(rate) || rate <= 0 || rate >= 1) return null
  return rate
}

/**
 * 求当前生效的最佳促销。
 * 返回 null 表示无活动命中（调用方保持原价）。
 */
/**
 * 促销求值注入点（与 taxService.setTaxProvider / trackingService.setTrackingProvider 同款思路）。
 *
 * 用于：(1) 单测隔离共享数据库里其它用例/并行会话建的促销活动；
 * (2) 未来接入外部促销引擎。
 * 生产不设置时走默认实现，行为不变。
 */
let promotionEvaluator: ((ctx: PromotionContext) => Promise<PromotionEvaluation | null>) | null = null

export function setPromotionEvaluator(
  evaluator: ((ctx: PromotionContext) => Promise<PromotionEvaluation | null>) | null,
): void {
  promotionEvaluator = evaluator
}

export async function evaluatePromotion(ctx: PromotionContext): Promise<PromotionEvaluation | null> {
  if (promotionEvaluator) return promotionEvaluator(ctx)
  if (ctx.subtotalCents <= 0) return null
  const today = new Date().toISOString().slice(0, 10)
  const rows = await ShopPromotion.findAll({
    where: {
      tenantId: tid(),
      type: 'discount',
      startAt: { [Op.lte]: today } as never,
      endAt: { [Op.gte]: today } as never,
    },
    order: [['id', 'DESC']],
  })

  let best: PromotionEvaluation | null = null
  for (const row of rows) {
    const rate = parseRate(row.rule)
    if (rate === null) continue
    if (row.scope !== 'all') {
      // sku/spu/category 缺少绑定目标字段（后台表单未提供），不做猜测式命中
      continue
    }
    const discountCents = Math.round(ctx.subtotalCents * (1 - rate))
    if (discountCents <= 0) continue
    if (!best || rate < best.rate) {
      best = { promotionId: row.id, name: row.name as Record<string, string>, rate, discountCents }
    }
  }
  return best
}

/** 诊断用：列出被跳过的活动及原因（供后台/日志排查"为什么活动没生效"） */
export async function explainInactivePromotions(): Promise<Array<{ id: number; reason: string }>> {
  const today = new Date().toISOString().slice(0, 10)
  const rows = await ShopPromotion.findAll({ where: { tenantId: tid() }, order: [['id', 'DESC']] })
  const out: Array<{ id: number; reason: string }> = []
  for (const row of rows) {
    if (row.startAt > today) {
      out.push({ id: row.id, reason: `未到生效日期（${row.startAt}）` })
      continue
    }
    if (row.endAt < today) {
      out.push({ id: row.id, reason: `已过期（${row.endAt}）` })
      continue
    }
    if (row.type !== 'discount') {
      out.push({ id: row.id, reason: `类型 ${row.type} 暂不支持（缺少阶梯数据）` })
      continue
    }
    if (parseRate(row.rule) === null) {
      out.push({ id: row.id, reason: 'rule.rate 缺失或不在 0..1 开区间' })
      continue
    }
    if (row.scope !== 'all') {
      out.push({ id: row.id, reason: `范围 ${row.scope} 缺少绑定目标，暂不参与报价` })
    }
  }
  return out
}

/** 供未来按行分摊使用：判断某 SKU 是否属于活动范围（当前 all 之外一律 false） */
export async function isSkuInScope(promotionId: number, skuId: number): Promise<boolean> {
  const row = await ShopPromotion.findOne({ where: { id: promotionId, tenantId: tid() } })
  if (!row) return false
  if (row.scope === 'all') return true
  if (row.scope === 'sku') {
    const rule = row.rule as Record<string, unknown>
    return Array.isArray(rule.skuIds) && (rule.skuIds as number[]).includes(skuId)
  }
  const sku = await ShopSku.findOne({ where: { id: skuId, tenantId: tid() }, attributes: ['spuId'] })
  if (!sku) return false
  if (row.scope === 'spu') {
    const rule = row.rule as Record<string, unknown>
    return Array.isArray(rule.spuIds) && (rule.spuIds as number[]).includes(sku.spuId)
  }
  if (row.scope === 'category') {
    const spu = await ShopSpu.findOne({ where: { id: sku.spuId, tenantId: tid() }, attributes: ['categoryId'] })
    if (!spu) return false
    const rule = row.rule as Record<string, unknown>
    if (Array.isArray(rule.categoryIds)) return (rule.categoryIds as number[]).includes(spu.categoryId)
    const cat = await ShopCategory.findOne({ where: { id: spu.categoryId, tenantId: tid() }, attributes: ['id'] })
    return !!cat
  }
  return false
}

/**
 * 测试专用导出：把纯逻辑暴露给单测，避免测试为了绕开 DB 而重写一份实现
 * （重写的副本会与真实口径漂移，失去防护意义）。
 */
export const __testing = {
  parseRate,
  /** 折扣金额（分）：小计 × (1 - rate)，向下取整到分；负小计按 0 处理 */
  discountFor: (subtotalCents: number, rate: number): number => {
    if (!Number.isFinite(subtotalCents) || subtotalCents <= 0) return 0
    return Math.round(subtotalCents * (1 - rate))
  },
}
