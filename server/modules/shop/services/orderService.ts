import { AppError } from '../../../middleware/errorHandler.js'
import sequelize from '../../../config/database.js'
import { ShopOrder, ShopOrderItem, ShopOrderShipment, ShopSku, ShopChannel, ShopShop, ShopInventoryReservation } from '../models/index.js'
import type { CreateOrderInput, ShipOrderInput } from '../../../shared/schemas/shop.js'
import { getTenantContext } from '../../../modules/tenant/context.js'
import { logInfo } from '../../../utils/fileLogger.js'
import * as inventoryService from './inventoryService.js'
import { createShipment } from './channelAdapter.js'
import { tryEnqueue } from './orderMailService.js'

/** 当前租户 ID（读取全局租户上下文，平台超管兜底为 1） */
const tid = (): number => getTenantContext()?.tenantId ?? 1

function tenantId(): number {
  return getTenantContext()?.tenantId ?? 1
}

function genOrderNo(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const ts = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  return `SO${ts}${Math.floor(Math.random() * 1e4).toString().padStart(4, '0')}`
}

export async function listOrders(params: { channelId?: number; status?: string; page?: number; pageSize?: number } = {}) {
  const page = params.page ?? 1
  const pageSize = params.pageSize ?? 20
  const where: Record<string, unknown> = { tenantId: tid() }
  if (params.channelId) where.channelId = params.channelId
  if (params.status && ['created', 'paid', 'fulfilled', 'shipped', 'done', 'cancelled'].includes(params.status)) where.status = params.status
  const { rows, count } = await ShopOrder.findAndCountAll({
    where,
    order: [['id', 'DESC']],
    offset: (page - 1) * pageSize,
    limit: pageSize,
  })
  return { list: rows, total: count, page, pageSize }
}

export async function getOrderById(id: number) {
  const order = await ShopOrder.findOne({ where: { id, tenantId: tid() } })
  if (!order) throw new AppError(404, '订单不存在')
  const items = await ShopOrderItem.findAll({ where: { orderId: id, tenantId: tid() } })
  const shipments = await ShopOrderShipment.findAll({ where: { orderId: id, tenantId: tid() } })
  return { order, items, shipments }
}

/** 手工建单：写 orders + order_items，并对每个 SKU 占用库存（不足则回滚） */
export async function createManualOrder(input: CreateOrderInput): Promise<ShopOrder> {
  const tId = tenantId()
  const channel = await ShopChannel.findOne({ where: { id: input.channelId, tenantId: tId } })
  if (!channel) throw new AppError(400, '渠道不存在')
  const shop = await ShopShop.findOne({ where: { id: input.shopId, tenantId: tId } })
  if (!shop) throw new AppError(400, '店铺不存在')
  if (shop.channelId !== input.channelId) throw new AppError(400, '店铺不属于该渠道')

  // 预校验 SKU 合法 + 以「分」为整数计算金额，避免浮点累加误差（如 13.33*3=39.98 而非 39.99）
  let amountCents = 0
  for (const item of input.items) {
    const sku = await ShopSku.findOne({ where: { id: item.skuId, tenantId: tId } })
    if (!sku) throw new AppError(400, `SKU ${item.skuId} 不存在`)
    amountCents += Math.round(Number(item.price) * 100) * item.qty
  }
  const amount = Number((amountCents / 100).toFixed(2))

  const orderNo = genOrderNo()
  return sequelize.transaction(async (t) => {
    const order = await ShopOrder.create({
      orderNo,
      channelId: input.channelId,
      shopId: input.shopId,
      buyer: input.buyer,
      currency: input.currency,
      amount,
      amountCents,
      subtotalCents: amountCents,
      status: 'created',
      tenantId: tId,
    } as never, { transaction: t })

    for (const item of input.items) {
      await ShopOrderItem.create({
        orderId: order.id,
        skuId: item.skuId,
        qty: item.qty,
        price: item.price,
        tenantId: tId,
      } as never, { transaction: t })
      // 占用库存（不足抛错，事务整体回滚）
      await inventoryService.occupy(item.skuId, item.qty, orderNo)
    }
    return order
  })
}

export async function markPaid(id: number): Promise<ShopOrder> {
  // 锁订单行串行化状态流转：否则与 ship/cancel 并发时各自读到旧状态，
  // 后写覆盖会让「已取消」又被改回「已支付」。
  return sequelize.transaction(async (t) => {
    const order = await ShopOrder.findOne({
      where: { id, tenantId: tid() },
      transaction: t,
      lock: t.LOCK.UPDATE,
    })
    if (!order) throw new AppError(404, '订单不存在')
    if (order.status !== 'created') throw new AppError(400, `当前状态 ${order.status} 不可标记为已支付`)
    await order.update({ status: 'paid' }, { transaction: t })
    return order
  })
}

/**
 * 发货：生成运单号（物流适配层 mock）+ 报关字段自动带出；
 * 释放占用并实际扣减库存，订单状态置为 shipped。
 */
export async function ship(id: number, input: ShipOrderInput): Promise<ShopOrder> {
  const tId = tid()
  // 状态检查与状态变更必须在同一事务内锁订单行完成：否则并发两次都读到
  // 可发货状态，会重复扣减在库量、重复生成运单与两封发货通知。
  const { order, trackingNo, carrier } = await sequelize.transaction(async (t) => {
    const order = await ShopOrder.findOne({
      where: { id, tenantId: tId },
      transaction: t,
      lock: t.LOCK.UPDATE,
    })
    if (!order) throw new AppError(404, '订单不存在')
    if (!['created', 'paid', 'fulfilled'].includes(order.status)) {
      throw new AppError(400, `当前状态 ${order.status} 不可发货`)
    }

    const items = await ShopOrderItem.findAll({ where: { orderId: id, tenantId: tId }, transaction: t })
    if (items.length === 0) throw new AppError(400, '订单无明细，无法发货')

    // 报关单号：依据首个 SKU 的 hs_code / origin_country / declared_value 自动带出
    const firstSku = await ShopSku.findByPk(items[0].skuId, { transaction: t })
    const customsNo = firstSku
      ? `${firstSku.hsCode || 'NA'}-${firstSku.originCountry || 'NA'}-${firstSku.declaredValue ?? 'NA'}`
      : 'NA'

    // 运单在锁内生成：被拒绝的并发请求不应产生外部运单与通知去重键
    const logistics = await createShipment({ carrier: input.carrier, shopId: order.shopId, channelId: order.channelId })
    const trackingNo = input.trackingNo || logistics.trackingNo

    for (const item of items) {
      // 传入订单事务 t，使「释放占用 + 实际扣减 + 建运单 + 置发货」在同一事务内原子提交；
      // 否则 deduct 各自独立提交，建运单/置发货失败回滚时库存已被永久扣减（账实不一致）。
      await inventoryService.release(item.skuId, item.qty, order.orderNo, t)
      await inventoryService.deduct(item.skuId, item.qty, order.orderNo, t)
    }
    await ShopOrderShipment.create({
      orderId: id,
      carrier: logistics.carrier,
      trackingNo,
      customsNo,
      status: 'created',
      tenantId: tId,
    } as never, { transaction: t })
    await order.update({ status: 'shipped' }, { transaction: t })
    return { order, trackingNo, carrier: logistics.carrier }
  })
  // P3-T17：发货通知入队（以运单号去重；邮件失败不影响发货事实）
  await tryEnqueue({ orderId: id, type: 'shipped', dedupeKey: trackingNo, trackingNo, carrier })
  return order
}

/** 取消：释放占用，置为 cancelled（已发货/已完成不可取消） */
export async function cancel(id: number): Promise<ShopOrder> {
  const tId = tid()
  // 与 ship/markPaid 共用订单行锁，保证状态检查与变更原子：
  // 否则取消与发货并发时两者都成功返回，订单最终状态与库存账不一致。
  const { order, marked } = await sequelize.transaction(async (t) => {
    const order = await ShopOrder.findOne({
      where: { id, tenantId: tId },
      transaction: t,
      lock: t.LOCK.UPDATE,
    })
    if (!order) throw new AppError(404, '订单不存在')
    if (['shipped', 'done', 'cancelled'].includes(order.status)) {
      throw new AppError(400, `当前状态 ${order.status} 不可取消`)
    }
    const items = await ShopOrderItem.findAll({ where: { orderId: id, tenantId: tId }, transaction: t })
    for (const item of items) {
      await inventoryService.release(item.skuId, item.qty, order.orderNo)
    }
    // 关闭收口：库存已按明细释放，这里只把该单 active 预占标记为 released。
    // 若留着 active，TTL sweeper 到期会再释放一次，误放掉同 SKU 其它在途订单的占用。
    const [marked] = await ShopInventoryReservation.update(
      { status: 'released', releasedAt: new Date() } as never,
      { where: { tenantId: tId, ref: order.orderNo, status: 'active' } as never, transaction: t },
    )
    await order.update({ status: 'cancelled' }, { transaction: t })
    return { order, marked }
  })

  // 券占用回收仅针对「本次标记了 active 预占」的未支付订单：
  // 已支付订单预占为 committed，券已用于成交，退款应走独立链路，不能在此释放。
  // releaseCoupon 自身开事务，故放在订单事务提交之后；幂等，失败只告警不阻断取消。
  if (marked > 0) {
    const { releaseCoupon } = await import('../../storefront/services/couponService.js')
    await releaseCoupon(order.orderNo).catch((err) =>
      logInfo(`[order.cancel] 券占用回退失败 ${order.orderNo}: ${(err as Error).message}`),
    )
  }
  return order
}

/**
 * 批量发货（PLAN 4.1）
 *
 * 设计要点（尊重既有事务边界，不做「大事务包所有单」）：
 * - 逐单调用 `ship(id, input)`，每单仍是自己的事务：一单失败不会回滚已成功的单，
 *   也不会把多单的库存扣减绑在同一个长事务里（跨境订单常有部分单地址异常）。
 * - 单条失败只记录原因并继续，最后返回逐单结果；`failed` 明细供运营直接定位重试。
 * - 未在行内给承运商的，用 `defaultCarrier`；两者都缺则该行失败（不猜承运商）。
 * - 已发货/已取消的订单由 `ship` 自身状态机拒绝，这里不预先过滤，
 *   避免「预检查通过但执行时被并发改状态」造成误判。
 */
export interface BatchShipItemInput {
  orderId: number
  carrier?: string
  trackingNo?: string
}

export interface BatchShipRowResult {
  orderId: number
  ok: boolean
  status?: string
  trackingNo?: string | null
  carrier?: string | null
  error?: string
}

export interface BatchShipResult {
  total: number
  succeeded: number
  failed: number
  rows: BatchShipRowResult[]
}

export async function batchShip(
  items: Array<{ orderId?: number; carrier?: string; trackingNo?: string }>,
  defaultCarrier?: string,
): Promise<BatchShipResult> {
  if (!Array.isArray(items) || items.length === 0) throw new AppError(400, '请至少提供一条发货记录')
  if (items.length > 100) throw new AppError(400, '单次最多 100 条发货记录')

  // 同一单在一次请求里出现多次会产生「已发货」伪失败，先去重并保留首个
  const seen = new Set<number>()
  const unique: BatchShipItemInput[] = []
  for (const it of items) {
    if (typeof it.orderId !== 'number' || !Number.isInteger(it.orderId) || it.orderId <= 0) {
      throw new AppError(400, '发货记录缺少有效的 orderId')
    }
    if (seen.has(it.orderId)) continue
    seen.add(it.orderId)
    unique.push({ orderId: it.orderId, carrier: it.carrier, trackingNo: it.trackingNo })
  }

  const rows: BatchShipRowResult[] = []
  for (const it of unique) {
    const carrier = it.carrier || defaultCarrier
    if (!carrier) {
      // 承运商是运单必填项；缺失时明确失败，不静默用店铺名兜底（会导致轨迹查不到）
      rows.push({ orderId: it.orderId, ok: false, error: '缺少承运商（行内与默认值均为空）' })
      continue
    }
    try {
      const order = await ship(it.orderId, { carrier, trackingNo: it.trackingNo })
      // ship 内部已建运单并置 shipped；回读最近一条运单拿实际运单号（未传时由适配层生成）
      const shipment = await ShopOrderShipment.findOne({
        where: { orderId: it.orderId, tenantId: tid() },
        order: [['id', 'DESC']],
      })
      rows.push({
        orderId: it.orderId,
        ok: true,
        status: order.status,
        trackingNo: shipment?.trackingNo ?? null,
        carrier: shipment?.carrier ?? carrier,
      })
    } catch (err) {
      rows.push({ orderId: it.orderId, ok: false, error: err instanceof Error ? err.message : String(err) })
    }
  }

  const succeeded = rows.filter((r) => r.ok).length
  return { total: rows.length, succeeded, failed: rows.length - succeeded, rows }
}
