import { AppError } from '../../../middleware/errorHandler.js'
import { getTenantContext } from '../../tenant/context.js'
import { ShopRmaRequest, ShopOrder, ShopOrderItem } from '../../shop/models/index.js'
import type { OrderStatus } from '../../shop/models/ShopOrder.js'
import type { StorefrontSite } from '../middleware/siteContext.js'

/**
 * 退货/售后服务（阶段 5 步骤 5 / 第四切片）
 *
 * 复用 shop 模型层（shop_rma_requests / orders / order_items），不复制数据、不建第二套后端。
 * 公开接口需顾客登录（customerAuth），租户由 siteContext 注入（service 层显式 tenantId 兜底为 1）。
 * 申请人须为订单买家（email 匹配），订单须处于可退状态（fulfilled/shipped/done）。
 * 退款金额按订单快照单价(分) × 退货数服务端重算，避免前端篡改。
 * 状态机：pending →（admin 审核）approved →（顾客回寄）returned →（admin 退款）refunded；
 * 顾客可在 pending 时 cancel；rejected 为审核驳回。本切片仅实现顾客侧可触发的 pending/cancel/returned。
 */

const tid = (): number => getTenantContext()?.tenantId ?? 1

/** 调用方身份（来自 customerAuth 中间件，RMA 强制登录故必传） */
export interface RmaAuth {
  customerId: number
  email: string
}

/** 允许申请退货的订单状态 */
const RETURNABLE: OrderStatus[] = ['fulfilled', 'shipped', 'done']

export interface RmaItemInput {
  orderItemId: number
  skuId: number
  qty: number
}

export interface RmaSubmitInput {
  orderId: number
  items: RmaItemInput[]
  reason?: string
}

export interface RmaSubmitResult {
  id: number
  status: string
  refundAmountCents: number
  refundCurrency: string
}

export interface RmaListItem {
  id: number
  orderId: number
  status: string
  reason: string | null
  items: { orderItemId: number; skuId: number; qty: number; title: string | null }[] | null
  refundAmountCents: number
  refundCurrency: string
  trackingNo: string | null
  createdAt: Date
}

function toListItem(r: ShopRmaRequest): RmaListItem {
  return {
    id: r.id,
    orderId: r.orderId,
    status: r.status,
    reason: r.reason,
    items: (r.items as RmaListItem['items']) ?? null,
    refundAmountCents: Number(r.refundAmountCents),
    refundCurrency: r.refundCurrency,
    trackingNo: r.trackingNo,
    createdAt: r.createdAt,
  }
}

/** 提交退货申请：校验订单归属/可退状态/明细，服务端重算退款金额 */
export async function submitRma(
  _site: StorefrontSite,
  input: RmaSubmitInput,
  auth: RmaAuth,
): Promise<RmaSubmitResult> {
  const tId = tid()
  const order = await ShopOrder.findOne({ where: { id: input.orderId, tenantId: tId } })
  if (!order) throw new AppError(404, `订单 ${input.orderId} 不存在`)
  if (order.email !== auth.email) throw new AppError(403, '该订单不属于当前登录顾客')
  if (!RETURNABLE.includes(order.status)) {
    throw new AppError(400, '该订单当前状态不可申请退货')
  }

  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw new AppError(400, '退货明细不能为空')
  }

  const orderItems = await ShopOrderItem.findAll({ where: { orderId: order.id, tenantId: tId } })
  const itemMap = new Map(orderItems.map((it) => [it.id, it]))
  const snapshot: RmaListItem['items'] = []
  let refundCents = 0
  for (const it of input.items) {
    if (!Number.isInteger(it.qty) || it.qty < 1) {
      throw new AppError(400, '退货数量必须为正整数')
    }
    const oi = itemMap.get(it.orderItemId)
    if (!oi || oi.skuId !== it.skuId) {
      throw new AppError(400, `订单明细 ${it.orderItemId} 不属于该订单`)
    }
    if (it.qty > oi.qty) {
      throw new AppError(400, `退货数量超过已购数量（${oi.qty}）`)
    }
    refundCents += Number(oi.unitAmountCents) * it.qty
    snapshot!.push({ orderItemId: oi.id, skuId: oi.skuId, qty: it.qty, title: oi.title })
  }

  const row = await ShopRmaRequest.create({
    tenantId: tId,
    siteId: _site.shopId ?? 0,
    orderId: order.id,
    customerId: auth.customerId,
    email: auth.email,
    status: 'pending',
    reason: input.reason ?? null,
    items: snapshot,
    refundAmountCents: refundCents,
    refundCurrency: order.currency,
  })
  return {
    id: row.id,
    status: row.status,
    refundAmountCents: Number(row.refundAmountCents),
    refundCurrency: row.refundCurrency,
  }
}

/** 当前顾客的退货申请列表（按创建时间倒序） */
export async function listMyRmas(_site: StorefrontSite, customerId: number): Promise<RmaListItem[]> {
  const tId = tid()
  const rows = await ShopRmaRequest.findAll({
    where: { tenantId: tId, customerId },
    order: [['createdAt', 'DESC']],
  })
  return rows.map(toListItem)
}

/** 当前顾客获取单条退货申请（非本人 → 404） */
export async function getMyRma(_site: StorefrontSite, id: number, customerId: number): Promise<RmaListItem> {
  const tId = tid()
  const row = await ShopRmaRequest.findOne({ where: { id, tenantId: tId, customerId } })
  if (!row) throw new AppError(404, '退货申请不存在')
  return toListItem(row)
}

/** 顾客取消：仅 pending 可取消 */
export async function cancelRma(
  _site: StorefrontSite,
  id: number,
  customerId: number,
): Promise<{ status: string }> {
  const tId = tid()
  const row = await ShopRmaRequest.findOne({ where: { id, tenantId: tId, customerId } })
  if (!row) throw new AppError(404, '退货申请不存在')
  if (row.status !== 'pending') throw new AppError(400, '仅 pending 状态的申请可取消')
  await row.update({ status: 'cancelled' } as never)
  return { status: 'cancelled' }
}

/** 顾客回寄：仅 approved（审核通过）可提交物流单号，状态置 returned */
export async function submitReturnTracking(
  _site: StorefrontSite,
  id: number,
  trackingNo: string,
  customerId: number,
): Promise<{ status: string; trackingNo: string }> {
  const tId = tid()
  const row = await ShopRmaRequest.findOne({ where: { id, tenantId: tId, customerId } })
  if (!row) throw new AppError(404, '退货申请不存在')
  if (row.status !== 'approved') throw new AppError(400, '仅审核通过(approved)的申请可回寄')
  await row.update({ status: 'returned', trackingNo } as never)
  return { status: 'returned', trackingNo }
}
