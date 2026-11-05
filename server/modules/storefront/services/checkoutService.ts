import crypto from 'crypto'
import { Op, Sequelize } from 'sequelize'
import { AppError } from '../../../middleware/errorHandler.js'
import { getTenantContext } from '../../tenant/context.js'
import { ShopOrder, ShopOrderItem } from '../../shop/models/index.js'
import * as reservationService from '../../shop/services/reservationService.js'
import { createQuote, type QuoteResult } from './quoteService.js'
import { redeemCoupon, releaseCoupon, type CouponEvaluation } from './couponService.js'
import type { OrderAttribution } from '../../../shared/schemas/storefront.js'
import type { StorefrontSite } from '../middleware/siteContext.js'

/**
 * 建单服务（阶段 5 步骤 4 / P3-T10）
 *
 * - 幂等：idempotencyKey 重复提交返回首单，不产生重复订单（unique 约束兜底）。
 * - 服务端重算：先 createQuote 重算价格，绝不信任前端传入金额。
 * - 库存预占：建单即占用库存并写 inventory_reservations（TTL），支付失败 / 取消由补偿路径释放。
 * - 快照：商品标题 / 规格 / 单价（分）/ 地址 / 政策固化进订单，历史订单不受后台币种切换影响。
 */

const tid = (): number => getTenantContext()?.tenantId ?? 1

function genOrderNo(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const ts = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  return `SO${ts}${Math.floor(Math.random() * 1e4).toString().padStart(4, '0')}`
}

function genAccessToken(): string {
  return crypto.randomBytes(24).toString('hex')
}

export interface CreateOrderParams {
  idempotencyKey?: string
  email?: string
  shippingAddress?: Record<string, unknown>
  note?: string
  cartToken?: string
  items?: { skuId: number; qty: number }[]
  customerId?: number
  /** T-07：券码由服务端校验并重算折扣，建单时原子占用 */
  couponCode?: string
  /** 订单来源归因（site / utm），建单时固化进订单快照 */
  attribution?: OrderAttribution
}

export interface OrderItemView {
  id: number
  skuId: number
  qty: number
  title: string | null
  spec: Record<string, string> | null
  unitAmountCents: number
  lineTotalCents: number
  currency: string
}

export interface OrderView {
  id: number
  orderNo: string
  status: string
  paymentStatus: string
  currency: string
  subtotalCents: number
  discountCents: number
  couponCode: string | null
  shippingCents: number
  taxCents: number
  amountCents: number
  email: string | null
  shippingAddress: Record<string, unknown> | null
  note: string | null
  items: OrderItemView[]
  accessToken: string | null
  createdAt: Date
}

/** 序列化订单（accessToken 仅在建单响应中返回，供防枚举访问使用） */
export async function toOrderView(order: ShopOrder, withToken = false): Promise<OrderView> {
  const items = await ShopOrderItem.findAll({ where: { orderId: order.id, tenantId: tid() }, order: [['id', 'ASC']] })
  return {
    id: order.id,
    orderNo: order.orderNo,
    status: order.status,
    paymentStatus: order.paymentStatus,
    currency: order.currency,
    subtotalCents: Number(order.subtotalCents),
    discountCents: Number(order.discountCents),
    couponCode: order.couponCode ?? null,
    shippingCents: Number(order.shippingCents),
    taxCents: Number(order.taxCents),
    amountCents: Number(order.amountCents),
    email: order.email,
    shippingAddress: order.shippingAddress,
    note: order.note,
    items: items.map((it) => ({
      id: it.id,
      skuId: it.skuId,
      qty: it.qty,
      title: it.title,
      spec: it.spec,
      unitAmountCents: Number(it.unitAmountCents),
      lineTotalCents: Number(it.lineTotalCents),
      currency: it.currency ?? order.currency,
    })),
    accessToken: withToken ? order.accessToken : null,
    createdAt: order.createdAt,
  }
}

/**
 * 创建订单（幂等）。返回带 accessToken 的订单视图。
 * 失败（如库存不足）时若已预占则释放，保证不留孤儿占用。
 */
export async function createOrder(site: StorefrontSite, params: CreateOrderParams): Promise<OrderView> {
  const tId = tid()

  // 1) 幂等：必须先于报价。重复提交应直接返回首单，
  //    否则券已用尽 / 价格已变化会让幂等重放被误拒，且白跑一次服务端重算。
  const idempotencyKey = (params.idempotencyKey ?? crypto.randomBytes(16).toString('hex')).slice(0, 64)
  const existing = await ShopOrder.findOne({ where: { idempotencyKey, tenantId: tId } })
  if (existing) return toOrderView(existing, true)

  // 2) 服务端重算报价（价格 / 库存 / 币种一致性 / 配送范围 / 优惠券）
  const quote: QuoteResult = await createQuote(site, {
    cartToken: params.cartToken,
    items: params.items,
    shippingAddress: params.shippingAddress,
    couponCode: params.couponCode,
  })

  // 3) T-07 优惠券占用（幂等键 = orderNo，失败可精确回退）
  const orderNo = genOrderNo()
  const coupon: CouponEvaluation | null =
    quote.couponId && quote.couponCode
      ? {
          couponId: quote.couponId,
          couponCode: quote.couponCode,
          discountCents: quote.discountCents,
          currency: quote.currency,
        }
      : null
  if (coupon) await redeemCoupon(coupon, orderNo)

  // 4) 库存预占（失败需同时释放预占与券占用）
  const reserveInputs = []
  for (const line of quote.items) {
    const warehouseId = await reservationService.pickWarehouse(line.skuId)
    reserveInputs.push({ skuId: line.skuId, warehouseId, qty: line.qty })
  }
  let reservations: Awaited<ReturnType<typeof reservationService.reserveItems>> = []
  try {
    reservations = await reservationService.reserveItems(orderNo, reserveInputs)
  } catch (err) {
    await reservationService.releaseReservation(orderNo).catch(() => undefined)
    if (coupon) await releaseCoupon(orderNo).catch(() => undefined)
    throw err
  }

  // 4) 落库订单 + 明细（快照）
  const accessToken = genAccessToken()
  const order = await ShopOrder.create({
    orderNo,
    channelId: site.channelId ?? 0,
    shopId: site.shopId ?? 0,
    buyer: { email: params.email ?? null, customerId: params.customerId ?? null } as Record<string, unknown>,
    currency: quote.currency,
    amount: quote.amountCents / 100,
    status: 'created',
    paymentStatus: 'none',
    email: params.email ?? null,
    shippingAddress: params.shippingAddress ?? null,
    note: params.note ?? null,
    subtotalCents: quote.subtotalCents,
    discountCents: quote.discountCents,
    shippingCents: quote.shippingCents,
    taxCents: quote.taxCents,
    amountCents: quote.amountCents,
    couponCode: quote.couponCode ?? null,
    accessToken,
    idempotencyKey,
    reservationId: reservations[0]?.id ?? null,
    policySnapshot: {
      currency: quote.currency,
      taxRate: Number(process.env.STORE_TAX_RATE ?? 0),
      shippingCents: quote.shippingCents,
      generatedAt: new Date().toISOString(),
    } as Record<string, unknown>,
    // 阶段 5 步骤 6：订单来源归因（site / utm），随订单固化，后台报表据此出渠道 ROI
    sourceSiteId: site.shopId ?? null,
    utmSource: params.attribution?.utmSource ?? null,
    utmMedium: params.attribution?.utmMedium ?? null,
    utmCampaign: params.attribution?.utmCampaign ?? null,
    utmTerm: params.attribution?.utmTerm ?? null,
    utmContent: params.attribution?.utmContent ?? null,
    landingPage: params.attribution?.landingPage ?? null,
    referrer: params.attribution?.referrer ?? null,
    tenantId: tId,
  } as never)

  for (const line of quote.items) {
    await ShopOrderItem.create({
      orderId: order.id,
      skuId: line.skuId,
      qty: line.qty,
      price: line.unitAmountCents / 100,
      tenantId: tId,
      title: line.title,
      spec: line.spec,
      unitAmountCents: line.unitAmountCents,
      lineTotalCents: line.lineTotalCents,
      currency: quote.currency,
    } as never)
  }

  return toOrderView(order, true)
}

/** 凭 accessToken 取订单（防枚举：token 不匹配按 404 处理） */
export async function getOrderWithToken(orderId: number, accessToken: string): Promise<OrderView> {
  const order = await ShopOrder.findOne({ where: { id: orderId, accessToken, tenantId: tid() } })
  if (!order) throw new AppError(404, '订单不存在')
  return toOrderView(order, false)
}

/** 取消订单：释放预占与库存占用（已支付 / 已发货不可取消） */
export async function cancelOrder(orderId: number, accessToken: string): Promise<OrderView> {
  const order = await ShopOrder.findOne({ where: { id: orderId, accessToken, tenantId: tid() } })
  if (!order) throw new AppError(404, '订单不存在')
  if (['paid', 'fulfilled', 'shipped', 'done', 'cancelled'].includes(order.status)) {
    throw new AppError(400, `当前状态 ${order.status} 不可取消`)
  }
  await reservationService.releaseReservation(order.orderNo)
  // T-07：取消订单同时回退优惠券用量，避免券被白白消耗
  await releaseCoupon(order.orderNo)
  await order.update({ status: 'cancelled', cancelledReason: 'customer_cancel', closedAt: new Date() } as never)
  return toOrderView(order, false)
}

export interface OrderListResult {
  items: OrderView[]
  total: number
  page: number
  pageSize: number
}

/**
 * P4-T03 顾客订单列表：仅返回归属该顾客（buyer.customerId）的订单。
 * - 归属只来自已校验的顾客 JWT（tenantId + customerId），接口不接受任何归属字段；
 * - 订单归属在创建时写入 buyer.customerId（JSON），此处用 JSON_EXTRACT 精确匹配，不依赖可枚举的 orderNo；
 * - 金额一律取订单快照币种展示（toOrderView 已从快照读取 currency / 各金额分）。
 */
export async function listMyOrders(
  owner: { tenantId: number; customerId: number },
  page = 1,
  pageSize = 10,
): Promise<OrderListResult> {
  const p = page > 0 ? page : 1
  const ps = Math.min(pageSize > 0 ? pageSize : 10, 50)
  const where = {
    tenantId: owner.tenantId,
    [Op.and]: Sequelize.literal('JSON_EXTRACT(buyer, "$.customerId") = :cid'),
  } as Record<string | symbol, unknown>
  const { rows, count } = await ShopOrder.findAndCountAll({
    where,
    replacements: { cid: owner.customerId },
    order: [
      ['createdAt', 'DESC'],
      ['id', 'DESC'],
    ],
    limit: ps,
    offset: (p - 1) * ps,
  })
  const items: OrderView[] = []
  for (const row of rows) items.push(await toOrderView(row, true))
  return { items, total: count, page: p, pageSize: ps }
}
