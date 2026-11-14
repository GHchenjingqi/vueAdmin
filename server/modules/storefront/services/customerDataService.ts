import crypto from 'node:crypto'
import { Op } from 'sequelize'
import { AppError } from '../../../middleware/errorHandler.js'
import { getTenantContext } from '../../tenant/context.js'
import {
  ShopCustomer,
  ShopCustomerAddress,
  ShopOrder,
  ShopOrderItem,
  ShopReview,
  ShopWishlist,
  ShopPointsLog,
  ShopCart,
  ShopCartItem,
  ShopRmaRequest,
  ShopAnalyticsEvent,
  ShopNewsletter,
  ShopRestockSubscription,
} from '../../shop/models/index.js'

/**
 * 顾客数据权利（PLAN 5.3）
 *
 * 背景：C 端此前只有注册/登录/me 三个接口，**没有注销入口、也没有数据导出**。
 * GDPR（被遗忘权、可携带权）与 CCPA 都要求提供这两项；缺了属于合规缺口。
 *
 * 设计取舍：
 * 1. **注销 = 匿名化 + 停用，不物理删除**：订单、退款、发票、积分流水属于财务凭证，
 *    多地法规要求保留若干年（税务/反欺诈），物理删除会造成账实不符。
 *    `status='deleted'` 后顾客无法登录，邮箱被替换为不可反推的占位值，
 *    昵称/地址等直接标识清除；订单通过 customerId 仍能关联到匿名主体，
 *    既满足"不再识别到自然人"，也保住账务链。
 * 2. **数据导出给结构化 JSON**：只导出与该顾客本人相关的数据，
 *    不包含其它顾客、内部审计字段或支付凭据。
 * 3. 两个操作都要求已登录（customerAuth），注销需要密码二次确认，避免会话被劫持后直接毁号。
 */

const tid = (): number => getTenantContext()?.tenantId ?? 1

/** 注销后的占位邮箱：保留域名形态但不指向真实邮箱、不可反推 */
function anonymizedEmail(customerId: number): string {
  return `deleted-${customerId}-${crypto.randomBytes(4).toString('hex')}@deleted.invalid`
}

export interface DeleteAccountResult {
  status: 'deleted'
  /** 提示前端要清除本地会话 */
  sessionCleared: true
}

/**
 * 注销账号（匿名化 + 停用）。
 *
 * 幂等：已注销的再调用返回 404（避免通过接口探测某邮箱是否注册过）。
 */
export async function deleteAccount(customerId: number): Promise<DeleteAccountResult> {
  const tId = tid()
  const customer = await ShopCustomer.findOne({ where: { id: customerId, tenantId: tId } })
  if (!customer || customer.status === 'deleted') throw new AppError(404, '账号不存在')

  // 注销前捕获原邮箱：匿名化后按 email 关联的营销订阅无法再匹配，需同步清理
  const originalEmail = customer.email

  const placeholder = anonymizedEmail(customer.id)

  await ShopCustomer.update(
    {
      status: 'deleted',
      email: placeholder,
      // 密码置为不可登录的随机值，防止旧 JWT 以外的路径（如重放登录）再进入
      passwordHash: `deleted:${crypto.randomBytes(24).toString('hex')}`,
      nickname: null,
      // 会员权益与积分为个人资产，注销即放弃；保留列值以免影响历史报表口径
      membershipTierId: null,
      referralCode: null,
    } as never,
    { where: { id: customer.id, tenantId: tId } },
  )

  // 直接标识（地址、收藏）删除；订单/退款/积分流水保留为匿名历史
  await Promise.all([
    ShopCustomerAddress.destroy({ where: { customerId: customer.id, tenantId: tId } }),
    ShopWishlist.destroy({ where: { customerId: customer.id, tenantId: tId } }),
    // 浏览历史复用 analytics_events（view_item），按 customerId 清理
    ShopAnalyticsEvent.destroy({ where: { tenantId: tId, customerId: customer.id } } as never),
    // 营销订阅按原邮箱清理：被遗忘权应撤回营销同意，且匿名化后邮箱已不可匹配
    ShopNewsletter.destroy({ where: { tenantId: tId, email: originalEmail } }),
    ShopRestockSubscription.destroy({ where: { tenantId: tId, email: originalEmail } }),
  ])

  // 购物车按 customerId 清理（游客车用 token 归属，不在注销范围）
  const carts = await ShopCart.findAll({ where: { customerId: customer.id, tenantId: tId }, attributes: ['id'] })
  if (carts.length) {
    const cartIds = carts.map((c) => c.id)
    await ShopCartItem.destroy({ where: { cartId: { [Op.in]: cartIds }, tenantId: tId } } as never)
    await ShopCart.destroy({ where: { id: { [Op.in]: cartIds }, tenantId: tId } } as never)
  }

  // 评价保留（可能已展示在商品页并影响其它顾客判断），但解除与顾客的关联
  await ShopReview.update({ customerId: null, isAnonymous: true } as never, {
    where: { customerId: customer.id, tenantId: tId },
  } as never)

  return { status: 'deleted', sessionCleared: true }
}

export interface CustomerDataExport {
  exportedAt: string
  profile: {
    id: number
    email: string
    nickname: string | null
    status: string
    points: number
    growthValue: number
    orderCount: number
    createdAt: string | null
  }
  addresses: Array<Record<string, unknown>>
  orders: Array<{
    orderNo: string
    status: string
    paymentStatus: string
    currency: string
    amountCents: number
    createdAt: string | null
    items: Array<{ title: string | null; qty: number; price: number }>
  }>
  reviews: Array<{ spuId: number; rating: number; content: string; createdAt: string | null }>
  rmas: Array<{ orderId: number; status: string; reason: string | null; createdAt: string | null }>
  pointsLogs: Array<{ change: number; reason: string | null; createdAt: string | null }>
}

/**
 * 导出该顾客本人的数据（GDPR 可携带权）。
 *
 * 只按 customerId 精确取数，不返回其它顾客或内部审计字段；
 * 邮箱等直接标识按原值返回（这是顾客本人行使查阅权，不是对外披露）。
 */
export async function exportCustomerData(customerId: number): Promise<CustomerDataExport> {
  const tId = tid()
  const customer = await ShopCustomer.findOne({ where: { id: customerId, tenantId: tId } })
  if (!customer) throw new AppError(404, '账号不存在')

  const [addresses, orders, reviews, rmas, pointsLogs] = await Promise.all([
    ShopCustomerAddress.findAll({ where: { customerId, tenantId: tId } }),
    ShopOrder.findAll({ where: { tenantId: tId, buyer: { [Op.ne]: null } } as never, order: [['id', 'DESC']] }),
    ShopReview.findAll({ where: { customerId, tenantId: tId } }),
    ShopRmaRequest.findAll({ where: { customerId, tenantId: tId } }),
    ShopPointsLog.findAll({ where: { customerId, tenantId: tId } }),
  ])

  // 订单归属在 buyer JSON 里（customerId），需在内存中筛（JSON 列跨库函数不一致）
  const mine = orders.filter((o) => {
    const buyer = (o.buyer as Record<string, unknown> | null) ?? null
    return buyer && Number(buyer.customerId) === customerId
  })
  const items = mine.length
    ? await ShopOrderItem.findAll({ where: { tenantId: tId, orderId: { [Op.in]: mine.map((o) => o.id) } } })
    : []
  const itemsByOrder = new Map<number, typeof items>()
  for (const it of items) {
    const list = itemsByOrder.get(it.orderId) ?? []
    list.push(it)
    itemsByOrder.set(it.orderId, list)
  }

  const iso = (d: Date | null | undefined): string | null => (d ? new Date(d).toISOString() : null)

  return {
    exportedAt: new Date().toISOString(),
    profile: {
      id: customer.id,
      email: customer.email,
      nickname: customer.nickname,
      status: customer.status,
      points: customer.points,
      growthValue: customer.growthValue,
      orderCount: customer.orderCount,
      createdAt: iso(customer.createdAt),
    },
    addresses: addresses.map((a) => ({
      fullName: a.fullName,
      phone: a.phone,
      country: a.country,
      province: a.province,
      city: a.city,
      address1: a.address1,
      address2: a.address2,
      postcode: a.postcode,
      isDefault: a.isDefault,
    })),
    orders: mine.map((o) => ({
      orderNo: o.orderNo,
      status: o.status,
      paymentStatus: o.paymentStatus,
      currency: o.currency,
      amountCents: Number(o.amountCents),
      createdAt: iso(o.createdAt),
      items: (itemsByOrder.get(o.id) ?? []).map((it) => ({
        title: (it as unknown as { titleSnapshot?: string | null }).titleSnapshot ?? null,
        qty: it.qty,
        price: Number(it.price),
      })),
    })),
    reviews: reviews.map((r) => ({ spuId: r.spuId, rating: r.rating, content: r.content, createdAt: iso(r.createdAt) })),
    rmas: rmas.map((r) => ({ orderId: r.orderId, status: r.status, reason: r.reason, createdAt: iso(r.createdAt) })),
    pointsLogs: pointsLogs.map((p) => ({ change: p.change, reason: p.reason, createdAt: iso(p.createdAt) })),
  }
}
