import { Op, fn, col, literal } from 'sequelize'
import { getTenantContext } from '../../tenant/context.js'
import {
  ShopSku,
  ShopSpu,
  ShopOrder,
  ShopOrderItem,
} from '../../shop/models/index.js'
import * as catalogService from './catalogService.js'
import type { StorefrontProductListItem } from './catalogService.js'

/**
 * Storefront 商品推荐服务（P6 推荐 + 相关商品）。
 *
 * 两种模式（纯读、无新表）：
 * - coPurchase（买了又买）：从已支付订单明细取「与给定 SKU 同单」的高频 SPU，取 Top N；
 * - sameCategory（看了又看 / 同分类兜底）：同 categoryId 的公开 SPU，按 id 倒序补足；
 *
 * 输出统一复用 catalogService.listProducts 做字段裁剪与价格/库存组装，避免重复实现 C 端投影。
 * 模型间无 Sequelize 关联，全部走显式两步查询 + 内存连接。
 */

const tid = (): number => getTenantContext()?.tenantId ?? 1
const PUBLIC_STATUSES: [string, ...string[]] = ['listed', 'published']

/**
 * 协同过滤：取与给定 skuIds 同单、且不属于 excludeSpuIds 的高频 SPU id 列表（按共现次数倒序）。
 * 仅统计已支付订单（paidAt 非空），避免未支付信号污染。
 */
async function coPurchaseSpuIds(
  skuIds: number[],
  excludeSpuIds: number[],
  limit: number,
): Promise<number[]> {
  if (!skuIds.length) return []
  const tId = tid()

  // 1) 给定 SKU 出现在哪些订单
  const rows = await ShopOrderItem.findAll({
    where: { tenantId: tId, skuId: { [Op.in]: skuIds } },
    attributes: ['orderId'],
    raw: true,
  })
  const orderIds = [...new Set(rows.map((r) => r.orderId))]
  if (!orderIds.length) return []

  // 2) 过滤已支付订单
  const paid = await ShopOrder.findAll({
    where: { tenantId: tId, id: { [Op.in]: orderIds }, status: { [Op.in]: ['paid', 'fulfilled', 'shipped', 'done'] } },
    attributes: ['id'],
    raw: true,
  })
  const paidOrderIds = paid.map((o) => o.id)
  if (!paidOrderIds.length) return []

  // 3) 这些订单的所有行（一次查询），排除原 SKU 对应 SPU
  const coItems = await ShopOrderItem.findAll({
    where: { tenantId: tId, orderId: { [Op.in]: paidOrderIds } },
    attributes: ['skuId'],
    raw: true,
  })
  if (!coItems.length) return []

  // 4) skuId → spuId 映射
  const coSkuIds = [...new Set(coItems.map((r) => r.skuId))]
  const skuRows = await ShopSku.findAll({
    where: { tenantId: tId, id: { [Op.in]: coSkuIds } },
    attributes: ['id', 'spuId'],
    raw: true,
  })
  const skuToSpu = new Map(skuRows.map((s) => [s.id, s.spuId]))

  const exclude = new Set(excludeSpuIds)
  const counts = new Map<number, number>()
  for (const item of coItems) {
    const spuId = skuToSpu.get(item.skuId)
    if (spuId === undefined || exclude.has(spuId)) continue
    counts.set(spuId, (counts.get(spuId) ?? 0) + 1)
  }
  if (!counts.size) return []

  // 5) 过滤未公开 SPU（避免推荐到已下架）
  const candIds = [...counts.keys()]
  const publicRows = await ShopSpu.findAll({
    where: { tenantId: tId, id: { [Op.in]: candIds }, status: { [Op.in]: PUBLIC_STATUSES } },
    attributes: ['id'],
    raw: true,
  })
  const publicSet = new Set(publicRows.map((r) => r.id))

  return [...counts.entries()]
    .filter(([spuId]) => publicSet.has(spuId))
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([spuId]) => spuId)
}

/** 同分类兜底：给定 categoryId 取公开 SPU id（排除已用过的），按 id DESC */
async function sameCategorySpuIds(
  categoryId: number,
  excludeSpuIds: number[],
  limit: number,
): Promise<number[]> {
  if (!categoryId) return []
  const where: Record<string, unknown> = {
    tenantId: tid(),
    categoryId,
    status: { [Op.in]: PUBLIC_STATUSES },
  }
  if (excludeSpuIds.length) where.id = { [Op.notIn]: excludeSpuIds }
  const rows = await ShopSpu.findAll({
    where,
    order: [['id', 'DESC']],
    limit,
    attributes: ['id'],
    raw: true,
  })
  return rows.map((r) => r.id)
}

/** 借 catalogService.listProducts 按 ids 批量取 C 端投影，并按 ordered 顺序回填 */
async function pickOrdered(
  ordered: number[],
  limit: number,
  opts: { currency?: string; lang?: string },
): Promise<StorefrontProductListItem[]> {
  if (!ordered.length) return []
  const { list } = await catalogService.listProducts(
    {
      ids: ordered.join(','),
      pageSize: limit,
      currency: opts.currency,
      lang: opts.lang,
    } as never,
    { currency: opts.currency, lang: opts.lang },
  )
  const map = new Map(list.map((p) => [p.id, p]))
  return ordered
    .map((id) => map.get(id))
    .filter((x): x is StorefrontProductListItem => !!x)
    .slice(0, limit)
}

/**
 * 详情页「看了又看 / 相关商品」：行为优先（买了又买）→ 同分类兜底。
 */
export async function relatedForProduct(
  product: { id: number; categoryId?: number },
  opts: { limit?: number; currency?: string; lang?: string } = {},
): Promise<{ items: StorefrontProductListItem[]; strategy: 'coPurchase' | 'sameCategory' | 'none' }> {
  const limit = Math.min(Math.max(1, opts.limit ?? 6), 12)
  const tId = tid()

  const baseSpu = await ShopSpu.findOne({
    where: { tenantId: tId, id: product.id },
    attributes: ['id', 'categoryId'],
    raw: true,
  })
  if (!baseSpu) return { items: [], strategy: 'none' }

  const skus = await ShopSku.findAll({
    where: { tenantId: tId, spuId: product.id },
    attributes: ['id'],
    raw: true,
  })
  const skuIds = skus.map((s) => s.id)
  const coIds = await coPurchaseSpuIds(skuIds, [product.id], limit)
  if (coIds.length) {
    return { items: await pickOrdered(coIds, limit, opts), strategy: 'coPurchase' }
  }

  const catIds = await sameCategorySpuIds(baseSpu.categoryId, [product.id], limit)
  if (catIds.length) {
    return { items: await pickOrdered(catIds, limit, opts), strategy: 'sameCategory' }
  }
  return { items: [], strategy: 'none' }
}

/**
 * 购物车「买了又买」：聚合购物车行所有 SKU，给出协同 Top N（排除已在购物车的 SPU）。
 * 协同为空时回退购物车首个 SKU 的同分类。
 */
export async function crossSellForCart(
  lines: { skuId: number; qty: number }[],
  opts: { limit?: number; currency?: string; lang?: string } = {},
): Promise<{ items: StorefrontProductListItem[]; strategy: 'coPurchase' | 'sameCategory' | 'none' }> {
  const limit = Math.min(Math.max(1, opts.limit ?? 6), 12)
  const tId = tid()
  const skuIds = [...new Set(lines.map((l) => l.skuId))].filter(
    (n) => Number.isInteger(n) && n > 0,
  )
  if (!skuIds.length) return { items: [], strategy: 'none' }

  const skus = await ShopSku.findAll({
    where: { tenantId: tId, id: { [Op.in]: skuIds } },
    attributes: ['id', 'spuId'],
    raw: true,
  })
  const cartSpuIds = [...new Set(skus.map((s) => s.spuId))]
  const coIds = await coPurchaseSpuIds(skuIds, cartSpuIds, limit)
  if (coIds.length) {
    return { items: await pickOrdered(coIds, limit, opts), strategy: 'coPurchase' }
  }

  // 兜底：购物车第一个 SKU 的同分类（排除已在购物车的 SPU）
  if (skus.length) {
    const primarySpu = await ShopSpu.findOne({
      where: { tenantId: tId, id: skus[0].spuId },
      attributes: ['id', 'categoryId'],
      raw: true,
    })
    if (primarySpu?.categoryId) {
      const catIds = await sameCategorySpuIds(primarySpu.categoryId, cartSpuIds, limit)
      if (catIds.length) {
        return { items: await pickOrdered(catIds, limit, opts), strategy: 'sameCategory' }
      }
    }
  }
  return { items: [], strategy: 'none' }
}

/** 全站热销 SPU id（已支付订单行 skuId→spuId 频次 Top N，过滤公开） */
async function hotSpuIds(limit: number): Promise<number[]> {
  const tId = tid()
  const items = await ShopOrderItem.findAll({
    where: { tenantId: tId },
    attributes: ['skuId'],
    raw: true,
    limit: 5000,
  })
  if (!items.length) return []

  // 已支付过滤
  const orderIds = [...new Set(items.map((i) => i.orderId))]
  const paid = await ShopOrder.findAll({
    where: { tenantId: tId, id: { [Op.in]: orderIds }, status: { [Op.in]: ['paid', 'fulfilled', 'shipped', 'done'] } },
    attributes: ['id'],
    raw: true,
  })
  const paidSet = new Set(paid.map((o) => o.id))
  const paidItems = items.filter((i) => paidSet.has(i.orderId))
  if (!paidItems.length) return []

  // skuId→spuId
  const skuIds = [...new Set(paidItems.map((i) => i.skuId))]
  const skuRows = await ShopSku.findAll({
    where: { tenantId: tId, id: { [Op.in]: skuIds } },
    attributes: ['id', 'spuId'],
    raw: true,
  })
  const skuToSpu = new Map(skuRows.map((s) => [s.id, s.spuId]))

  const counts = new Map<number, number>()
  for (const item of paidItems) {
    const spuId = skuToSpu.get(item.skuId)
    if (spuId === undefined) continue
    counts.set(spuId, (counts.get(spuId) ?? 0) + 1)
  }

  // 过滤公开
  const candIds = [...counts.keys()]
  const publicRows = await ShopSpu.findAll({
    where: { tenantId: tId, id: { [Op.in]: candIds }, status: { [Op.in]: PUBLIC_STATUSES } },
    attributes: ['id'],
    raw: true,
  })
  const publicSet = new Set(publicRows.map((r) => r.id))

  return [...counts.entries()]
    .filter(([spuId]) => publicSet.has(spuId))
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([spuId]) => spuId)
}

/** 最新公开 SPU id（兜底：全站无订单历史时展示新品） */
async function latestSpuIds(limit: number): Promise<number[]> {
  const rows = await ShopSpu.findAll({
    where: { tenantId: tid(), status: { [Op.in]: PUBLIC_STATUSES } },
    order: [['id', 'DESC']],
    limit,
    attributes: ['id'],
    raw: true,
  })
  return rows.map((r) => r.id)
}

/**
 * 首页「为你推荐」：全站热销 → 最新兜底。
 * 游客默认落地页（无 productId、无购物车），基于全站行为给出大众化推荐。
 */
export async function homeForYou(
  opts: { limit?: number; currency?: string; lang?: string } = {},
): Promise<{ items: StorefrontProductListItem[]; strategy: 'hot' | 'new' | 'none' }> {
  const limit = Math.min(Math.max(1, opts.limit ?? 8), 12)

  const hotIds = await hotSpuIds(limit)
  if (hotIds.length) {
    return { items: await pickOrdered(hotIds, limit, opts), strategy: 'hot' }
  }

  const latestIds = await latestSpuIds(limit)
  if (latestIds.length) {
    return { items: await pickOrdered(latestIds, limit, opts), strategy: 'new' }
  }

  return { items: [], strategy: 'none' }
}
