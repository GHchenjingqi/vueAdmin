import { Op } from 'sequelize'
import { ShopAnalyticsEvent, ShopSku } from '../../shop/models/index.js'
import { getTenantContext } from '../../tenant/context.js'

/**
 * 浏览历史服务（C 端顾客 / 游客）
 *
 * 数据源：复用 shop_analytics_events 的 view_item 事件（前端 trackViewItem 已上报，
 * params.items[].item_id = skuId）。零新表、零新写入。
 * - 登录顾客按 customerId 查；游客按 sessionId 查
 * - skuId → productId（spuId）映射，去重保留最近一次浏览，倒序返回
 */

const tid = (): number => getTenantContext()?.tenantId ?? 1

export interface ViewHistoryItem {
  productId: number
  lastViewedAt: Date
}

/**
 * 取浏览历史（去重到 SPU，按最近浏览倒序）。
 * @param identity { customerId } 或 { sessionId }，二者至少一个
 * @param limit 最多返回条数（默认 20，上限 50）
 */
export async function listViewHistory(
  identity: { customerId?: number; sessionId?: string },
  limit = 20,
): Promise<ViewHistoryItem[]> {
  const tId = tid()
  const where: Record<string, unknown> = { tenantId: tId, eventName: 'view_item' }
  if (identity.customerId) {
    where.customerId = identity.customerId
  } else if (identity.sessionId) {
    where.sessionId = identity.sessionId
    where.customerId = null
  } else {
    return []
  }

  const max = Math.min(Math.max(1, limit), 50)
  const events = await ShopAnalyticsEvent.findAll({
    where,
    order: [['createdAt', 'DESC']],
    limit: 200, // 取足够多再在内存去重到 SPU
    attributes: ['params', 'createdAt'],
  })
  if (!events.length) return []

  // 事件里的 item_id 是 skuId，映射到 spuId（productId）
  const skuIds = new Set<number>()
  for (const ev of events) {
    const items = (ev.params as { items?: { item_id?: string }[] } | null)?.items
    for (const it of items ?? []) {
      const skuId = Number(it?.item_id)
      if (Number.isInteger(skuId) && skuId > 0) skuIds.add(skuId)
    }
  }
  if (!skuIds.size) return []

  const skus = await ShopSku.findAll({
    where: { id: { [Op.in]: [...skuIds] }, tenantId: tId },
    attributes: ['id', 'spuId'],
  })
  const skuToSpu = new Map(skus.map((s) => [s.id, s.spuId]))

  // 去重到 SPU：保留最近一次浏览时间（事件已按 createdAt DESC，首次遇到即最新）
  const seen = new Map<number, Date>()
  for (const ev of events) {
    const items = (ev.params as { items?: { item_id?: string }[] } | null)?.items
    for (const it of items ?? []) {
      const skuId = Number(it?.item_id)
      const productId = skuToSpu.get(skuId)
      if (productId && !seen.has(productId)) seen.set(productId, ev.createdAt)
    }
  }

  return [...seen.entries()]
    .sort((a, b) => b[1].getTime() - a[1].getTime())
    .slice(0, max)
    .map(([productId, lastViewedAt]) => ({ productId, lastViewedAt }))
}
