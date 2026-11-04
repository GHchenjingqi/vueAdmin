import { AppError } from '../../../middleware/errorHandler.js'
import sequelize from '../../../config/database.js'
import { ShopOrder, ShopOrderItem, ShopOrderShipment, ShopSku, ShopChannel, ShopShop } from '../models/index.js'
import type { CreateOrderInput, ShipOrderInput } from '../../../shared/schemas/shop.js'
import { getTenantContext } from '../../../modules/tenant/context.js'
import * as inventoryService from './inventoryService.js'
import { createShipment } from './channelAdapter.js'

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

  // 预校验 SKU 合法 + 计算金额
  let amount = 0
  for (const item of input.items) {
    const sku = await ShopSku.findOne({ where: { id: item.skuId, tenantId: tId } })
    if (!sku) throw new AppError(400, `SKU ${item.skuId} 不存在`)
    amount += Number(item.price) * item.qty
  }

  const orderNo = genOrderNo()
  return sequelize.transaction(async (t) => {
    const order = await ShopOrder.create({
      orderNo,
      channelId: input.channelId,
      shopId: input.shopId,
      buyer: input.buyer,
      currency: input.currency,
      amount,
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
  const order = await ShopOrder.findOne({ where: { id, tenantId: tid() } })
  if (!order) throw new AppError(404, '订单不存在')
  if (order.status !== 'created') throw new AppError(400, `当前状态 ${order.status} 不可标记为已支付`)
  await order.update({ status: 'paid' })
  return order
}

/**
 * 发货：生成运单号（物流适配层 mock）+ 报关字段自动带出；
 * 释放占用并实际扣减库存，订单状态置为 shipped。
 */
export async function ship(id: number, input: ShipOrderInput): Promise<ShopOrder> {
  const order = await ShopOrder.findOne({ where: { id, tenantId: tid() } })
  if (!order) throw new AppError(404, '订单不存在')
  if (!['created', 'paid', 'fulfilled'].includes(order.status)) {
    throw new AppError(400, `当前状态 ${order.status} 不可发货`)
  }

  const items = await ShopOrderItem.findAll({ where: { orderId: id, tenantId: tid() } })
  if (items.length === 0) throw new AppError(400, '订单无明细，无法发货')

  // 报关单号：依据首个 SKU 的 hs_code / origin_country / declared_value 自动带出
  const firstSku = await ShopSku.findByPk(items[0].skuId)
  const customsNo = firstSku
    ? `${firstSku.hsCode || 'NA'}-${firstSku.originCountry || 'NA'}-${firstSku.declaredValue ?? 'NA'}`
    : 'NA'

  const logistics = await createShipment({ carrier: input.carrier, shopId: order.shopId, channelId: order.channelId })
  const trackingNo = input.trackingNo || logistics.trackingNo

  await sequelize.transaction(async (t) => {
    for (const item of items) {
      await inventoryService.release(item.skuId, item.qty, order.orderNo)
      await inventoryService.deduct(item.skuId, item.qty, order.orderNo)
    }
    await ShopOrderShipment.create({
      orderId: id,
      carrier: logistics.carrier,
      trackingNo,
      customsNo,
      status: 'created',
      tenantId: tid(),
    } as never, { transaction: t })
    await order.update({ status: 'shipped' }, { transaction: t })
  })
  return order
}

/** 取消：释放占用，置为 cancelled（已发货/已完成不可取消） */
export async function cancel(id: number): Promise<ShopOrder> {
  const order = await ShopOrder.findOne({ where: { id, tenantId: tid() } })
  if (!order) throw new AppError(404, '订单不存在')
  if (['shipped', 'done', 'cancelled'].includes(order.status)) {
    throw new AppError(400, `当前状态 ${order.status} 不可取消`)
  }
  const items = await ShopOrderItem.findAll({ where: { orderId: id, tenantId: tid() } })
  await sequelize.transaction(async (t) => {
    for (const item of items) {
      await inventoryService.release(item.skuId, item.qty, order.orderNo)
    }
    await order.update({ status: 'cancelled' }, { transaction: t })
  })
  return order
}
