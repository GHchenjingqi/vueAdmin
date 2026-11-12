import { Op } from 'sequelize'
import { ShopOrder, ShopOrderItem, ShopRateSnapshot, ShopSku, ShopSpu, ShopInventory, ShopInventoryLog, ShopAnalyticsEvent } from '../models/index.js'
import type { AnalyticsQuery } from '../../../shared/schemas/shop.js'
import { getTenantContext } from '../../../modules/tenant/context.js'
import { canonicalTerm } from '../../storefront/services/searchSynonymsService.js'

/** 当前租户 ID（读取全局租户上下文，平台超管兜底为 1） */
const tid = (): number => getTenantContext()?.tenantId ?? 1

/**
 * 批量预取租户全部汇率快照（按 rateDate 升序），供整张报表在内存中换算，
 * 避免 profitReport / salesReport 对每个订单 / 商品行各打一次 rate_snapshots 查询（N+1）。
 * 约定：snapshot.rates[currency] = 1 单位该币种折合多少基础币种（默认 USD），即 amountUSD = amount * rate。
 */
async function loadRateSnapshots(): Promise<{ rateDate: string; rates: Record<string, number> }[]> {
  const rows = await ShopRateSnapshot.findAll({
    where: { tenantId: tid() },
    order: [['rateDate', 'ASC']],
  })
  return rows.map((r) => ({
    rateDate: String(r.rateDate),
    rates: (r.rates as Record<string, number>) || {},
  }))
}

/** 取 dateStr(YYYY-MM-DD) 当日及之前生效的最新快照汇率；无快照退化为 1（不换算） */
function rateAt(
  snaps: { rateDate: string; rates: Record<string, number> }[],
  currency: string,
  dateStr: string,
): number {
  let rates: Record<string, number> | null = null
  for (const s of snaps) {
    if (s.rateDate <= dateStr) rates = s.rates
    else break
  }
  if (!rates) return 1
  const rate = rates[currency]
  return typeof rate === 'number' ? rate : 1
}

function toUSDAmount(
  amount: number,
  currency: string,
  dateStr: string,
  snaps: { rateDate: string; rates: Record<string, number> }[],
): number {
  if (currency === 'USD') return amount
  return amount * rateAt(snaps, currency, dateStr)
}

function rangeFilter(query: AnalyticsQuery) {
  const where: Record<string, unknown> = { tenantId: tid() }
  if (query.startAt || query.endAt) {
    const range: Record<string | symbol, unknown> = {}
    if (query.startAt) range[Op.gte] = new Date(query.startAt + 'T00:00:00Z')
    if (query.endAt) range[Op.lte] = new Date(query.endAt + 'T23:59:59Z')
    where.createdAt = range
  }
  return where
}

/** 销售报表：按维度（day/channel/country/category）聚合销售额 */
export async function salesReport(query: AnalyticsQuery) {
  const where = rangeFilter(query)
  if (query.channelId) where.channelId = query.channelId
  const orders = await ShopOrder.findAll({ where, order: [['createdAt', 'ASC']] })
  const items = await ShopOrderItem.findAll({ where: { tenantId: tid(), orderId: { [Op.in]: orders.map((o) => o.id) } } })
  const rateSnaps = await loadRateSnapshots()

  // sku -> categoryId 映射（用于 category 维度）
  const skuIds = Array.from(new Set(items.map((i) => i.skuId)))
  const skus = await ShopSku.findAll({ where: { id: { [Op.in]: skuIds }, tenantId: tid() } })
  const spuIds = Array.from(new Set(skus.map((s) => s.spuId)))
  const spus = await ShopSpu.findAll({ where: { id: { [Op.in]: spuIds }, tenantId: tid() } })
  const skuToCategory = new Map<number, number>()
  const spuCat = new Map<number, number>()
  spus.forEach((s) => spuCat.set(s.id, s.categoryId))
  skus.forEach((s) => skuToCategory.set(s.id, spuCat.get(s.spuId) ?? 0))

  const groups = new Map<string, { amountByCurrency: Record<string, number>; orderIds: Set<number>; itemQty: number; usdTotal: number }>()
  const orderMap = new Map(orders.map((o) => [o.id, o]))

  for (const it of items) {
    const order = orderMap.get(it.orderId)
    if (!order) continue
    let key: string
    switch (query.dimension) {
      case 'channel':
        key = `channel:${order.channelId}`
        break
      case 'country':
        key = `country:${(order.buyer as Record<string, unknown>)?.country ?? 'unknown'}`
        break
      case 'category':
        key = `category:${skuToCategory.get(it.skuId) ?? 0}`
        break
      default:
        key = `day:${(order.createdAt as Date).toISOString().slice(0, 10)}`
    }
    if (!groups.has(key)) groups.set(key, { amountByCurrency: {}, orderIds: new Set(), itemQty: 0, usdTotal: 0 })
    const g = groups.get(key)!
    const lineAmt = Number(it.price) * it.qty
    g.amountByCurrency[order.currency] = (g.amountByCurrency[order.currency] ?? 0) + lineAmt
    // 按订单实际交易日期换算（与 profitReport 口径一致），杜绝用 new Date() 把历史周期错算成今天汇率
    g.usdTotal += toUSDAmount(lineAmt, order.currency, (order.createdAt as Date).toISOString().slice(0, 10), rateSnaps)
    g.orderIds.add(order.id)
    g.itemQty += it.qty
  }

  const rows = Array.from(groups.entries()).map(([key, g]) => ({
    key,
    amountByCurrency: g.amountByCurrency,
    usdTotal: Number(g.usdTotal.toFixed(2)),
    orderCount: g.orderIds.size,
    itemQty: g.itemQty,
  }))
  return { dimension: query.dimension, rows }
}

/** 利润报表（含汇率损益，基于快照） */
export async function profitReport(query: AnalyticsQuery) {
  const where = rangeFilter(query)
  if (query.channelId) where.channelId = query.channelId
  const orders = await ShopOrder.findAll({ where, order: [['createdAt', 'ASC']] })
  const items = await ShopOrderItem.findAll({ where: { tenantId: tid(), orderId: { [Op.in]: orders.map((o) => o.id) } } })
  const rateSnaps = await loadRateSnapshots()

  // SKU 申报价值（COGS 代理）映射
  const skuIds = Array.from(new Set(items.map((i) => i.skuId)))
  const skus = await ShopSku.findAll({ where: { id: { [Op.in]: skuIds }, tenantId: tid() } })
  const skuCost = new Map<number, number>()
  skus.forEach((s) => skuCost.set(s.id, Number(s.declaredValue ?? 0)))

  let totalRevenueUSD = 0
  let totalCostUSD = 0
  let totalFxGainLoss = 0
  const series: Array<{ day: string; revenueUSD: number; costUSD: number; profitUSD: number; fxGainLoss: number }> = []

  for (const order of orders) {
    const day = (order.createdAt as Date).toISOString().slice(0, 10)
    const revenueUSD = toUSDAmount(Number(order.amount), order.currency, day, rateSnaps)
    const baseRate = rateSnaps.length ? (rateSnaps[0].rates[order.currency] ?? 1) : 1
    const revenueUSDbaseline = order.currency === 'USD' ? Number(order.amount) : Number(order.amount) * baseRate
    const fxGainLoss = Number((revenueUSD - revenueUSDbaseline).toFixed(2))

    const orderItems = items.filter((i) => i.orderId === order.id)
    let cost = 0
    for (const it of orderItems) {
      const declared = skuCost.get(it.skuId) ?? 0
      cost += toUSDAmount(declared * it.qty, order.currency, day, rateSnaps)
    }

    totalRevenueUSD += revenueUSD
    totalCostUSD += cost
    totalFxGainLoss += fxGainLoss

    const existing = series.find((s) => s.day === day)
    if (existing) {
      existing.revenueUSD += revenueUSD
      existing.costUSD += cost
      existing.profitUSD += revenueUSD - cost
      existing.fxGainLoss += fxGainLoss
    } else {
      series.push({ day, revenueUSD, costUSD: cost, profitUSD: revenueUSD - cost, fxGainLoss })
    }
  }

  const round = (n: number) => Number(n.toFixed(2))
  return {
    summary: {
      revenueUSD: round(totalRevenueUSD),
      costUSD: round(totalCostUSD),
      grossProfitUSD: round(totalRevenueUSD - totalCostUSD),
      fxGainLossUSD: round(totalFxGainLoss),
    },
    series: series.map((s) => ({ ...s, revenueUSD: round(s.revenueUSD), costUSD: round(s.costUSD), profitUSD: round(s.profitUSD), fxGainLoss: round(s.fxGainLoss) })),
  }
}

/** 库存周转报表（基于 inventory_log 出库/释放流水估算） */
export async function inventoryTurnover(query: AnalyticsQuery) {
  const where = rangeFilter(query)
  const logs = await ShopInventoryLog.findAll({ where })
  const outBySku = new Map<number, number>()
  for (const log of logs) {
    if (log.type === 'out' || log.type === 'unlock') {
      outBySku.set(log.skuId, (outBySku.get(log.skuId) ?? 0) + Math.abs(log.delta))
    }
  }

  const skuIds = Array.from(outBySku.keys())
  const inv = await ShopInventory.findAll({ where: { tenantId: tid(), skuId: { [Op.in]: skuIds } } })
  const stockBySku = new Map<number, number>()
  inv.forEach((r) => stockBySku.set(r.skuId, (stockBySku.get(r.skuId) ?? 0) + (r.quantity - r.locked)))

  const periodDays = (() => {
    if (query.startAt && query.endAt) {
      const d = (new Date(query.endAt).getTime() - new Date(query.startAt).getTime()) / 86400000
      return Math.max(1, Math.round(d) || 1)
    }
    return 30
  })()

  const rows = skuIds.map((skuId) => {
    const outQty = outBySku.get(skuId) ?? 0
    const avgStock = stockBySku.get(skuId) ?? 0
    const dailyOut = outQty / periodDays
    const turnoverDays = dailyOut > 0 ? Number((avgStock / dailyOut).toFixed(1)) : null
    return { skuId, outQty, avgStock, dailyOut: Number(dailyOut.toFixed(2)), turnoverDays }
  })
  return { periodDays, rows }
}

/** G4 埋点对账：按事件名/派发状态/订单抽样查询原始埋点事件（createdAt 倒序，limit 1..500 默认 100） */
export async function listEventsForReconcile(q: {
  eventName?: string
  dispatchStatus?: string
  orderId?: number
  limit?: number
}) {
  const where: Record<string, unknown> = { tenantId: tid() }
  if (q.eventName) where.eventName = q.eventName
  if (q.dispatchStatus) where.dispatchStatus = q.dispatchStatus
  if (q.orderId) where.orderId = q.orderId
  const limit = Math.min(Math.max(q.limit ?? 100, 1), 500)
  return ShopAnalyticsEvent.findAll({ where, order: [['createdAt', 'DESC'], ['id', 'DESC']], limit })
}

/**
 * P6 推荐效果看板：推荐位 CTR 聚合。
 *
 * 数据源复用 shop_analytics_events（零新表）：
 * - 曝光 = eventName='view_item_list' 且 params.placement 非空
 * - 点击 = eventName='select_item' 且 params.placement 非空
 * 按 (placement, strategy) 分组统计 impressions / clicks / ctr。
 * params 是 JSON 列，MySQL 无通用 JSON 聚合跨版本兼容写法，故取近期窗口在内存分组（窗口默认 7 天，量级可控）。
 */
export async function recommendationCtrReport(q: { startAt?: string; endAt?: string } = {}) {
  const where: Record<string, unknown> = {
    tenantId: tid(),
    eventName: { [Op.in]: ['view_item_list', 'select_item'] },
  }
  const start = q.startAt ? new Date(q.startAt) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const end = q.endAt ? new Date(q.endAt) : new Date()
  where.createdAt = { [Op.gte]: start, [Op.lte]: end }

  const rows = await ShopAnalyticsEvent.findAll({
    where,
    order: [['createdAt', 'ASC']],
    limit: 20000, // 内存聚合窗口上限，防失控
    attributes: ['eventName', 'params', 'createdAt'],
  })

  interface Agg { impressions: number; clicks: number }
  const groups = new Map<string, Agg>()
  for (const ev of rows) {
    const params = (ev.params ?? {}) as Record<string, unknown>
    const placement = typeof params.placement === 'string' ? params.placement : ''
    if (!placement) continue
    const strategy = typeof params.strategy === 'string' ? params.strategy : 'unknown'
    const key = `${placement}|${strategy}`
    const agg = groups.get(key) ?? { impressions: 0, clicks: 0 }
    if (ev.eventName === 'view_item_list') agg.impressions++
    else if (ev.eventName === 'select_item') agg.clicks++
    groups.set(key, agg)
  }

  const items = [...groups.entries()].map(([key, agg]) => {
    const [placement, strategy] = key.split('|')
    const ctr = agg.impressions > 0 ? agg.clicks / agg.impressions : 0
    return {
      placement,
      strategy,
      impressions: agg.impressions,
      clicks: agg.clicks,
      ctr: Number(ctr.toFixed(4)), // 4 位小数，避免浮点噪声
    }
  })

  // 汇总行：按 placement 汇总
  const totals = new Map<string, Agg>()
  for (const it of items) {
    const t = totals.get(it.placement) ?? { impressions: 0, clicks: 0 }
    t.impressions += it.impressions
    t.clicks += it.clicks
    totals.set(it.placement, t)
  }
  const summary = [...totals.entries()].map(([placement, t]) => ({
    placement,
    impressions: t.impressions,
    clicks: t.clicks,
    ctr: Number((t.impressions > 0 ? t.clicks / t.impressions : 0).toFixed(4)),
  }))

  return { startAt: start.toISOString(), endAt: end.toISOString(), items, summary }
}

/**
 * 搜索热词看板（admin 运营增强）：复用 shop_analytics_events 的 search 事件（零新表）。
 * - 词频：按 params.search_term 计数，别名经 canonicalTerm 归并（bodywave→body wave）；
 * - 零结果词：同一 search 事件 params.results 为 0（前端无结果页埋点带 results 计数）；
 *   该字段缺失时零结果占比为 null（口径退化，不臆造）。
 * 内存聚合窗口默认 7 天、上限 20000 行（与 reco-ctr 同策略）。
 */
export async function searchHotReport(q: { startAt?: string; endAt?: string; limit?: number } = {}) {
  const start = q.startAt ? new Date(q.startAt) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const end = q.endAt ? new Date(q.endAt) : new Date()
  const limit = Math.min(Math.max(q.limit ?? 20, 1), 100)

  const rows = await ShopAnalyticsEvent.findAll({
    where: {
      tenantId: tid(),
      eventName: 'search',
      createdAt: { [Op.gte]: start, [Op.lte]: end },
    },
    order: [['createdAt', 'DESC']],
    limit: 20000,
    attributes: ['params'],
  })

  const termCounts = new Map<string, number>()
  let zeroResult = 0
  let hasResultSignal = false // 是否至少有一条 events 带 results 字段
  for (const ev of rows) {
    const p = (ev.params ?? {}) as Record<string, unknown>
    const term = typeof p.search_term === 'string' ? p.search_term.trim().toLowerCase() : ''
    if (!term) continue
    const canonical = canonicalTerm(term)
    termCounts.set(canonical, (termCounts.get(canonical) ?? 0) + 1)
    if (typeof p.results === 'number') {
      hasResultSignal = true
      if (p.results === 0) zeroResult++
    }
  }

  const totalSearches = rows.length
  const keywords = [...termCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([term, count]) => ({ term, count }))

  return {
    startAt: start.toISOString(),
    endAt: end.toISOString(),
    totalSearches,
    zeroResultSearches: hasResultSignal ? zeroResult : null,
    zeroResultRate: hasResultSignal && totalSearches > 0 ? Number((zeroResult / totalSearches).toFixed(4)) : null,
    keywords,
  }
}

/**
 * 搜索转化漏斗（admin 运营增强）：复用现有事件链（零新表），按 sessionId 串联。
 * 步骤：search → view_item → add_to_cart → purchase。
 * 串联口径：同一 sessionId 内，各步骤「首次发生」是否晚于 search 首次发生（时序归因）；
 * 无 sessionId 的游客事件（history 模式匿名）不参与漏斗，仅计入 totalEvents。
 * 各步转化率相对 search 会话数。
 */
export async function searchFunnelReport(q: { startAt?: string; endAt?: string } = {}) {
  const start = q.startAt ? new Date(q.startAt) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const end = q.endAt ? new Date(q.endAt) : new Date()

  const rows = await ShopAnalyticsEvent.findAll({
    where: {
      tenantId: tid(),
      eventName: { [Op.in]: ['search', 'view_item', 'add_to_cart', 'purchase'] },
      createdAt: { [Op.gte]: start, [Op.lte]: end },
    },
    order: [['createdAt', 'ASC']],
    limit: 50000,
    attributes: ['eventName', 'sessionId', 'createdAt'],
  })

  interface SessionState {
    searchAt: number | null
    view: boolean
    add: boolean
    purchase: boolean
  }
  const sessions = new Map<string, SessionState>()
  let noSessionEvents = 0
  for (const ev of rows) {
    const sid = ev.sessionId
    if (!sid) {
      noSessionEvents++
      continue
    }
    const st = sessions.get(sid) ?? { searchAt: null, view: false, add: false, purchase: false }
    const at = new Date(ev.createdAt).getTime()
    if (ev.eventName === 'search') {
      if (st.searchAt === null) st.searchAt = at
    } else if (ev.eventName === 'view_item') {
      if (st.searchAt !== null && at >= st.searchAt) st.view = true
    } else if (ev.eventName === 'add_to_cart') {
      if (st.searchAt !== null && at >= st.searchAt) st.add = true
    } else if (ev.eventName === 'purchase') {
      if (st.searchAt !== null && at >= st.searchAt) st.purchase = true
    }
    sessions.set(sid, st)
  }

  let searched = 0
  let viewed = 0
  let added = 0
  let purchased = 0
  for (const st of sessions.values()) {
    if (st.searchAt === null) continue
    searched++
    if (st.view) viewed++
    if (st.add) added++
    if (st.purchase) purchased++
  }

  const rate = (n: number): number => (searched > 0 ? Number((n / searched).toFixed(4)) : 0)
  return {
    startAt: start.toISOString(),
    endAt: end.toISOString(),
    searched,
    viewed,
    added,
    purchased,
    viewRate: rate(viewed),
    addRate: rate(added),
    purchaseRate: rate(purchased),
    noSessionEvents,
  }
}
