import { Op } from 'sequelize'
import { ShopOrder, ShopOrderItem, ShopRateSnapshot, ShopSku, ShopSpu, ShopInventory, ShopInventoryLog } from '../models/index.js'
import type { AnalyticsQuery } from '../../../shared/schemas/shop.js'
import { getTenantContext } from '../../../modules/tenant/context.js'

/** 当前租户 ID（读取全局租户上下文，平台超管兜底为 1） */
const tid = (): number => getTenantContext()?.tenantId ?? 1

/**
 * 汇率换算（基于 rate_snapshots 快照，禁止实时汇率回溯）。
 * 约定：snapshot.rates[currency] = 1 单位该币种折合多少基础币种（默认 USD）。
 * 即 amountUSD = amount * rate。无快照时退化为 1（不换算）。
 */
async function toUSD(amount: number, currency: string, date: Date): Promise<number> {
  if (currency === 'USD') return amount
  const snap = await ShopRateSnapshot.findOne({
    where: { tenantId: tid(), rateDate: { [Op.lte]: date.toISOString().slice(0, 10) } },
    order: [['rateDate', 'DESC']],
  })
  if (!snap) return amount
  const rates = (snap.rates as Record<string, number>) || {}
  const rate = rates[currency]
  return typeof rate === 'number' ? amount * rate : amount
}

async function baselineRate(currency: string): Promise<number> {
  if (currency === 'USD') return 1
  const snap = await ShopRateSnapshot.findOne({ where: { tenantId: tid() }, order: [['rateDate', 'ASC']] })
  if (!snap) return 1
  const rates = (snap.rates as Record<string, number>) || {}
  return typeof rates[currency] === 'number' ? rates[currency] : 1
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

  // sku -> categoryId 映射（用于 category 维度）
  const skuIds = Array.from(new Set(items.map((i) => i.skuId)))
  const skus = await ShopSku.findAll({ where: { id: { [Op.in]: skuIds }, tenantId: tid() } })
  const spuIds = Array.from(new Set(skus.map((s) => s.spuId)))
  const spus = await ShopSpu.findAll({ where: { id: { [Op.in]: spuIds }, tenantId: tid() } })
  const skuToCategory = new Map<number, number>()
  const spuCat = new Map<number, number>()
  spus.forEach((s) => spuCat.set(s.id, s.categoryId))
  skus.forEach((s) => skuToCategory.set(s.id, spuCat.get(s.spuId) ?? 0))

  const groups = new Map<string, { amountByCurrency: Record<string, number>; orderIds: Set<number>; itemQty: number }>()
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
    if (!groups.has(key)) groups.set(key, { amountByCurrency: {}, orderIds: new Set(), itemQty: 0 })
    const g = groups.get(key)!
    g.amountByCurrency[order.currency] = (g.amountByCurrency[order.currency] ?? 0) + Number(it.price) * it.qty
    g.orderIds.add(order.id)
    g.itemQty += it.qty
  }

  const rows = await Promise.all(
    Array.from(groups.entries()).map(async ([key, g]) => {
      let usdTotal = 0
      for (const [cur, amt] of Object.entries(g.amountByCurrency)) {
        usdTotal += await toUSD(amt, cur, new Date())
      }
      return { key, amountByCurrency: g.amountByCurrency, usdTotal: Number(usdTotal.toFixed(2)), orderCount: g.orderIds.size, itemQty: g.itemQty }
    }),
  )
  return { dimension: query.dimension, rows }
}

/** 利润报表（含汇率损益，基于快照） */
export async function profitReport(query: AnalyticsQuery) {
  const where = rangeFilter(query)
  if (query.channelId) where.channelId = query.channelId
  const orders = await ShopOrder.findAll({ where, order: [['createdAt', 'ASC']] })
  const items = await ShopOrderItem.findAll({ where: { tenantId: tid(), orderId: { [Op.in]: orders.map((o) => o.id) } } })

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
    const revenueUSD = await toUSD(Number(order.amount), order.currency, order.createdAt as Date)
    const baseRate = await baselineRate(order.currency)
    const revenueUSDbaseline = order.currency === 'USD' ? Number(order.amount) : Number(order.amount) * baseRate
    const fxGainLoss = Number((revenueUSD - revenueUSDbaseline).toFixed(2))

    const orderItems = items.filter((i) => i.orderId === order.id)
    let cost = 0
    for (const it of orderItems) {
      const declared = skuCost.get(it.skuId) ?? 0
      cost += await toUSD(declared * it.qty, order.currency, order.createdAt as Date)
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
